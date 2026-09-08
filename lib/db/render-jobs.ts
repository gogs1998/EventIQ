import { eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";
import { logError, type LogContext } from "@/lib/log";
import { renderFingerprint, sponsorFingerprint, type RenderInputs } from "@/lib/renders";

/**
 * The app's half of the render queue.
 *
 * Nothing here renders anything — a Worker cannot — so this file only ever asks
 * for a bout to be rendered and works out whether the video on the programme is
 * still of that bout as it stands. The other half is scripts/render-tape.mjs,
 * which claims the queued rows and publishes the mp4. Section 11 of the
 * handover has the shape of it.
 *
 * It lives outside lib/db/queries.ts on purpose. Queries is the seam between
 * rows and the shapes the pages use; this is a queue with leases and attempt
 * counts in it, which is a different job, and it changes for different reasons.
 */

/** Deterministic, so the app and the renderer address the same row. */
export function renderJobId(eventId: string, boutNumber: number): string {
  return `rj_${eventId}_${boutNumber}`;
}

/**
 * The fingerprint of every bout on a show, as it stands now.
 *
 * The same field list the renderer hashes — lib/renders.ts is imported by both,
 * and refuses an input object that is missing a field or carrying a spare one,
 * so the two cannot drift apart quietly.
 */
export async function loadBoutFingerprints(
  db: Db,
  eventId: string,
): Promise<Record<number, string>> {
  const [event] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) return {};

  const [promoter] = await db
    .select()
    .from(schema.promoters)
    .where(eq(schema.promoters.id, event.promoterId))
    .limit(1);
  if (!promoter) return {};

  const bouts = await db
    .select()
    .from(schema.bouts)
    .where(eq(schema.bouts.eventId, eventId))
    .orderBy(schema.bouts.number);
  if (!bouts.length) return {};

  const fighterIds = [...new Set(bouts.flatMap((bout) => [bout.redId, bout.blueId]))];

  const fighters = await db
    .select({
      id: schema.fighters.id,
      updatedAt: schema.fighters.updatedAt,
      photo: schema.fighters.photo,
      cutout: schema.fighters.cutout,
    })
    .from(schema.fighters)
    .where(inArray(schema.fighters.id, fighterIds));

  const links = await db
    .select()
    .from(schema.fighterSponsors)
    .where(inArray(schema.fighterSponsors.fighterId, fighterIds))
    .orderBy(schema.fighterSponsors.position);

  const sponsorRows = await db
    .select()
    .from(schema.sponsors)
    .where(eq(schema.sponsors.promoterId, event.promoterId));

  const byId = new Map(fighters.map((fighter) => [fighter.id, fighter]));
  const sponsors = new Map(sponsorRows.map((sponsor) => [sponsor.id, sponsor]));
  const sponsorsOf = new Map<string, string[]>();
  for (const link of links) {
    sponsorsOf.set(link.fighterId, [...(sponsorsOf.get(link.fighterId) ?? []), link.sponsorId]);
  }

  const lockup = (id: string | null | undefined) => {
    const sponsor = id ? sponsors.get(id) : undefined;
    return sponsor ? sponsorFingerprint(sponsor) : null;
  };

  const hashes: Record<number, string> = {};
  for (const bout of bouts) {
    const red = byId.get(bout.redId);
    const blue = byId.get(bout.blueId);
    // A bout naming a fighter who is not there is a broken database rather than
    // a bout with nothing rendered, so leave it out and let it read as missing.
    if (!red || !blue) continue;

    const inputs: RenderInputs = {
      eventName: event.name,
      eventDate: event.date,
      eventVenue: event.venue,
      eventCity: event.city,
      eventBackdrop: event.backdrop,
      promoterName: promoter.name,
      promoterMark: promoter.mark,
      number: bout.number,
      discipline: bout.discipline,
      weightKg: bout.weightKg,
      classLabel: bout.classLabel,
      titleLabel: bout.titleLabel,
      billing: bout.billing,
      womens: bout.womens ? 1 : 0,
      rounds: bout.rounds,
      roundMinutes: bout.roundMinutes,
      redId: red.id,
      redUpdatedAt: red.updatedAt,
      redPhoto: red.photo,
      redCutout: red.cutout,
      blueId: blue.id,
      blueUpdatedAt: blue.updatedAt,
      bluePhoto: blue.photo,
      blueCutout: blue.cutout,
      sponsors: [
        lockup(bout.sponsorId),
        ...(sponsorsOf.get(red.id) ?? []).map(lockup),
        ...(sponsorsOf.get(blue.id) ?? []).map(lockup),
      ].filter((entry): entry is string => entry !== null),
    };

    hashes[bout.number] = await renderFingerprint(inputs);
  }

  return hashes;
}

/**
 * Asks for a bout, or a whole card, to be rendered again.
 *
 * **Where this belongs.** Nothing calls it yet, deliberately — the actions files
 * it belongs in are being rewritten on another branch. It should be called from
 * four places, all of which change what a video would look like:
 *
 * - `setPublished` in app/promoter/actions.ts, when a show goes live: a card
 *   nobody could read did not need its videos made.
 * - `submitQuestionnaire` in app/f/[token]/actions.ts: a fighter sending their
 *   photograph and record is the change the whole pipeline exists for.
 * - `saveBout` / `deleteBout` in app/promoter/actions.ts, for the bout touched.
 * - `updateEvent` and anything that edits a sponsor, for every bout on the card:
 *   the show's name, date, venue and backdrop are on screen in three of the five
 *   scenes, and a bout sponsor is the closing card.
 *
 * Queuing is cheap and idempotent, so it is better to ask twice than to leave a
 * fighter's photograph out of their own video until somebody notices. The
 * fingerprint means a request for a bout that has not changed costs one row
 * update and no render: the runner sees the hash it already published.
 */
export async function enqueueRender(
  db: Db,
  eventId: string,
  bouts: number[] | "all",
  now: number = Date.now(),
): Promise<number> {
  const hashes = await loadBoutFingerprints(db, eventId);
  const wanted = bouts === "all" ? Object.keys(hashes).map(Number) : bouts;

  const rows = wanted
    .filter((boutNumber) => hashes[boutNumber])
    .map((boutNumber) => ({
      id: renderJobId(eventId, boutNumber),
      eventId,
      boutNumber,
      status: "queued" as const,
      inputHash: hashes[boutNumber],
      attempts: 0,
      requestedAt: now,
    }));
  if (!rows.length) return 0;

  await db
    .insert(schema.renderJobs)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.renderJobs.eventId, schema.renderJobs.boutNumber],
      set: {
        status: "queued",
        // Named through `excluded` because this is one statement for however
        // many bouts, and the hash differs per row.
        inputHash: sql`excluded.input_hash`,
        attempts: 0,
        error: null,
        requestedAt: now,
      },
      // Never disturb a runner that is part way through this bout. It will
      // finish and record what it made; if the inputs have moved on since it
      // started, the hourly --stale run picks the bout up again, which is what
      // that run is for.
      setWhere: or(
        isNull(schema.renderJobs.leaseUntil),
        lt(schema.renderJobs.leaseUntil, now),
      ),
    });

  return rows.length;
}

/**
 * The jobs for one show, keyed by bout number.
 *
 * `loadRenderJobs` in queries.ts returns the rows; this is only the shaping the
 * dashboard wants, kept here so that file does not grow a second reason to
 * change.
 */
/**
 * The same, for a server action that has already saved what the promoter or the
 * fighter typed.
 *
 * A queue row is a request, not the change itself. If the request cannot be
 * written the saved change is still saved, so telling the person "that did not
 * save" would be untrue and would have them type it again. The failure goes to
 * the log and the hourly --stale run, which compares fingerprints rather than
 * queue rows, catches the bout up anyway.
 */
export async function requestRenderQuietly(
  db: Db,
  eventId: string,
  bouts: number[] | "all",
  context: LogContext,
): Promise<void> {
  try {
    await enqueueRender(db, eventId, bouts);
  } catch (error) {
    logError({ ...context, eventId }, error);
  }
}

export function jobsByBout<T extends { boutNumber: number }>(rows: T[]): Record<number, T> {
  const jobs: Record<number, T> = {};
  for (const row of rows) jobs[row.boutNumber] = row;
  return jobs;
}
