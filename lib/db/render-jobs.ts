import { isNull, lt, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";
import { loadCardById, type LoadedCard } from "@/lib/db/queries";
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
 * The fingerprint of every bout on a card that has already been loaded.
 *
 * The same field list the renderer hashes — lib/renders.ts is imported by both,
 * and refuses an input object that is missing a field or carrying a spare one,
 * so the two cannot drift apart quietly. lib/db/render-jobs.test.ts builds one
 * bout from both sides and asserts the digests match, because a fingerprint that
 * is merely *nearly* the renderer's is worse than none: every video would read
 * as out of date forever.
 *
 * A card rather than rows, because the dashboard already has one. Loading the
 * bouts, the fighters and the sponsors a second time to answer the same question
 * was half of what that page was spending.
 */
export async function boutFingerprints(card: LoadedCard): Promise<Record<number, string>> {
  const { event } = card;

  const lockup = (id: string | null | undefined) => {
    const sponsor = id ? card.sponsors[id] : undefined;
    return sponsor ? sponsorFingerprint(sponsor) : null;
  };

  const hashes: Record<number, string> = {};
  for (const bout of event.bouts) {
    const red = card.fighters[bout.redId];
    const blue = card.fighters[bout.blueId];
    // A bout naming a fighter who is not there is a broken database rather than
    // a bout with nothing rendered, so leave it out and let it read as missing.
    if (!red || !blue) continue;
    // A bout that is off is not rendered. Leaving it out here is what makes that
    // true everywhere at once: enqueueRender only queues bouts it has a hash for,
    // and the hourly --stale run compares against these, so neither can ask for a
    // walkout video for a walkout that is not happening.
    if (bout.cancelled) continue;

    const inputs: RenderInputs = {
      eventName: event.name,
      eventDate: event.date,
      eventVenue: event.venue,
      eventCity: event.city,
      eventBackdrop: event.backdrop,
      promoterName: event.promoter.name,
      promoterMark: event.promoter.mark,
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
      redUpdatedAt: card.fighterUpdatedAt[red.id],
      redPhoto: red.photo,
      redCutout: red.cutout,
      blueId: blue.id,
      blueUpdatedAt: card.fighterUpdatedAt[blue.id],
      bluePhoto: blue.photo,
      blueCutout: blue.cutout,
      sponsors: [
        lockup(bout.sponsorId),
        ...(red.sponsorIds ?? []).map(lockup),
        ...(blue.sponsorIds ?? []).map(lockup),
      ].filter((entry): entry is string => entry !== null),
    };

    hashes[bout.number] = await renderFingerprint(inputs);
  }

  return hashes;
}

/**
 * The same, for a caller holding an event id and no card — the queue, and the
 * server actions that ask for a render after saving something.
 */
export async function loadBoutFingerprints(
  db: Db,
  eventId: string,
): Promise<Record<number, string>> {
  const card = await loadCardById(db, eventId);
  return card ? boutFingerprints(card) : {};
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

  // D1 binds at most 100 parameters to one statement, and a row here is seven
  // of them, so a fifteen-bout card in one insert is refused outright — which is
  // how a fighter's submission on the demo card queued nothing and said so only
  // in the log. Ten rows a statement leaves room, and the batch keeps a card's
  // worth of requests in one transaction.
  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    statements.push(upsert(db, rows.slice(i, i + ROWS_PER_INSERT), now));
  }
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

  return rows.length;
}

const ROWS_PER_INSERT = 10;

function upsert(db: Db, rows: (typeof schema.renderJobs.$inferInsert)[], now: number) {
  return db
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
