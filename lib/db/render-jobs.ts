import { isNull, lt, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";
import { loadCardById, type LoadedCard } from "@/lib/db/queries";
import { logError, type LogContext } from "@/lib/log";
import {
  RENDER_SLOTS,
  renderFingerprint,
  renderJobId,
  slotOf,
  sponsorFingerprint,
  type RenderInputs,
  type RenderSlot,
} from "@/lib/renders";

// Re-exported because this is where callers already look for it, and because
// the queue is what the id is for. It is *defined* in lib/renders.ts so that
// scripts/render-tape.mjs can import the same function rather than keeping a
// copy: this module reaches drizzle and the bindings, and a script cannot load
// it at all.
export { renderJobId };

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

/** Every video of one bout, by slot. */
export type BoutHashes = Record<number, Record<RenderSlot, string>>;

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
export async function boutFingerprints(card: LoadedCard): Promise<BoutHashes> {
  const { event } = card;

  const lockup = (id: string | null | undefined) => {
    const sponsor = id ? card.sponsors[id] : undefined;
    return sponsor ? sponsorFingerprint(sponsor) : null;
  };

  const hashes: BoutHashes = {};
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

    const inputs: Omit<RenderInputs, "template"> = {
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

    // One digest per video, from one set of inputs. Every composition draws out
    // of the same rows, so everything but the slot is shared and a field added
    // above reaches all of them by construction. A walkout hashes its opponent
    // too, because it names them: a few more re-renders than strictly needed is
    // cheaper than a video naming somebody who is no longer on the bout.
    const perSlot = {} as Record<RenderSlot, string>;
    for (const { slot } of RENDER_SLOTS) {
      perSlot[slot] = await renderFingerprint({ ...inputs, template: slot });
    }
    hashes[bout.number] = perSlot;
  }

  return hashes;
}

/**
 * The same, for a caller holding an event id and no card — the queue, and the
 * server actions that ask for a render after saving something.
 */
export async function loadBoutFingerprints(db: Db, eventId: string): Promise<BoutHashes> {
  const card = await loadCardById(db, eventId);
  return card ? boutFingerprints(card) : {};
}

/**
 * Asks for a bout, or a whole card, to be rendered again.
 *
 * **Where it is called from.** Everything that changes what a video would look
 * like, which is nearly every write in the product: publishing a show, a
 * fighter's submission and their portrait, a bout added, edited or taken off,
 * the event details, and a sponsor edit. Those reach it through
 * `requestRenderQuietly` below; the promoter's "Render again" button is the one
 * caller that wants the failure, so it calls this directly.
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

  // Every published video of every bout asked for. A bout is four now, and a
  // promoter pressing "Render again" means the bout rather than one of them:
  // offering the promo on the programme and then leaving it a week behind the
  // tape would be worse than not offering it.
  const rows = wanted
    .filter((boutNumber) => hashes[boutNumber])
    .flatMap((boutNumber) =>
      RENDER_SLOTS.map(({ slot, template, corner }) => ({
        id: renderJobId(eventId, boutNumber, slot),
        eventId,
        boutNumber,
        template,
        corner,
        status: "queued" as const,
        inputHash: hashes[boutNumber][slot],
        attempts: 0,
        requestedAt: now,
      })),
    );
  if (!rows.length) return 0;

  // D1 binds at most 100 parameters to one statement, and a row here is nine
  // of them, so a fifteen-bout card in one insert is refused outright — which is
  // how a fighter's submission on the demo card queued nothing and said so only
  // in the log. Eight rows a statement leaves room for the update clause's own
  // parameters, and the batch keeps a card's worth of requests in one
  // transaction. A card is sixty rows now, which is eight statements and
  // nothing else.
  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    statements.push(upsert(db, rows.slice(i, i + ROWS_PER_INSERT), now));
  }
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

  return rows.length;
}

const ROWS_PER_INSERT = 8;

function upsert(db: Db, rows: (typeof schema.renderJobs.$inferInsert)[], now: number) {
  return db
    .insert(schema.renderJobs)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.renderJobs.eventId,
        schema.renderJobs.boutNumber,
        schema.renderJobs.template,
        schema.renderJobs.corner,
      ],
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

/**
 * The queue rows of one show, by bout and then by slot.
 *
 * Two levels because a bout is several videos. A row carrying a template nothing
 * publishes any more — a `social` left behind by a future change of mind, or a
 * walkout with no corner — is kept out rather than typed away, so the dashboard
 * never reads a state for a video it does not show.
 */
export function jobsByBout<T extends { boutNumber: number; template: string; corner: string }>(
  rows: T[],
): Record<number, Partial<Record<RenderSlot, T>>> {
  const jobs: Record<number, Partial<Record<RenderSlot, T>>> = {};
  for (const row of rows) {
    const slot = slotOf(row.template, row.corner);
    if (!slot) continue;
    jobs[row.boutNumber] = { ...jobs[row.boutNumber], [slot]: row };
  }
  return jobs;
}
