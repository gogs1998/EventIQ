import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";
import { loadCardById, type LoadedCard } from "@/lib/db/queries";
import { logError, type LogContext } from "@/lib/log";
import {
  CONFIRMED_TEMPLATE,
  PUBLISHED_TEMPLATES,
  confirmedComposition,
  hasConfirmed,
  isPublishedTemplate,
  renderFingerprint,
  renderJobId,
  sponsorFingerprint,
  type PublishedTemplate,
  type RenderInputs,
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

/** Every video of one bout, by template. */
export type BoutHashes = Record<number, Record<PublishedTemplate, string>>;

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
  const hashes: BoutHashes = {};
  for (const [number, inputs] of Object.entries(boutInputs(card))) {
    // One digest per composition, from one set of inputs. The tape and the promo
    // draw the same two people out of the same rows, so everything but the
    // template is shared and a field added below reaches both by construction.
    const perTemplate = {} as Record<PublishedTemplate, string>;
    for (const template of PUBLISHED_TEMPLATES) {
      perTemplate[template] = await renderFingerprint({ ...inputs, template });
    }
    hashes[Number(number)] = perTemplate;
  }
  return hashes;
}

/**
 * What each bout looks like on screen, less the template: shared by every video
 * made of it, the confirmed clips included.
 */
function boutInputs(card: LoadedCard): Record<number, Omit<RenderInputs, "template">> {
  const { event } = card;

  const lockup = (id: string | null | undefined) => {
    const sponsor = id ? card.sponsors[id] : undefined;
    return sponsor ? sponsorFingerprint(sponsor) : null;
  };

  const all: Record<number, Omit<RenderInputs, "template">> = {};
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

    all[bout.number] = {
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
  }
  return all;
}

/** Every confirmed fighter's clip on a card: by bout, then by fighter id. */
export type ConfirmedHashes = Record<number, Record<string, string>>;

/** The parts of an invite that say whether its fighter has confirmed. */
export type ConfirmationState = Parameters<typeof hasConfirmed>[0];

/**
 * The fingerprint of every confirmed clip the card should have.
 *
 * A clip exists for a fighter who has sent their details in (`hasConfirmed`),
 * on a bout that is going ahead, on a show that is published. Published because
 * the clip's whole job is to be posted and it carries the programme's code: a
 * post pointing at a draft is a post pointing at a 404. Publishing asks for the
 * whole card, which is when the clips of anybody already in are first queued.
 *
 * The bout's own inputs and the look the show uses, and nothing about which
 * corner: the opponent's name is on the clip, so a change to either fighter is a
 * change to both clips, and the row is already one per fighter.
 */
export async function confirmedFingerprints(
  card: LoadedCard,
  invites: Record<string, ConfirmationState>,
): Promise<ConfirmedHashes> {
  if (!card.published) return {};
  const template = confirmedComposition(card.confirmedStyle);
  const inputs = boutInputs(card);
  const hashes: ConfirmedHashes = {};
  for (const bout of card.event.bouts) {
    const shared = inputs[bout.number];
    if (!shared) continue;
    for (const fighterId of [bout.redId, bout.blueId]) {
      if (!hasConfirmed(invites[fighterId])) continue;
      hashes[bout.number] = {
        ...hashes[bout.number],
        [fighterId]: await renderFingerprint({ ...shared, template }),
      };
    }
  }
  return hashes;
}

/** Every invite on a show, reduced to what says whether its fighter has confirmed. */
export async function loadConfirmations(
  db: Db,
  eventId: string,
): Promise<Record<string, ConfirmationState>> {
  const rows = await db
    .select({
      fighterId: schema.invites.fighterId,
      submittedAt: schema.invites.submittedAt,
      revokedAt: schema.invites.revokedAt,
      withdrawnAt: schema.invites.withdrawnAt,
    })
    .from(schema.invites)
    .where(eq(schema.invites.eventId, eventId));
  return Object.fromEntries(rows.map((row) => [row.fighterId, row]));
}

/**
 * The same, for a caller holding an event id and no card — the queue, and the
 * server actions that ask for a render after saving something.
 */
export async function loadBoutFingerprints(db: Db, eventId: string): Promise<BoutHashes> {
  const card = await loadCardById(db, eventId);
  return card ? boutFingerprints(card) : {};
}

/** Both kinds at once, for the queue: each bout's own videos and its confirmed clips. */
async function loadQueueFingerprints(
  db: Db,
  eventId: string,
): Promise<{ bouts: BoutHashes; confirmed: ConfirmedHashes }> {
  const [card, confirmations] = await Promise.all([
    loadCardById(db, eventId),
    loadConfirmations(db, eventId),
  ]);
  if (!card) return { bouts: {}, confirmed: {} };
  const [bouts, confirmed] = await Promise.all([
    boutFingerprints(card),
    confirmedFingerprints(card, confirmations),
  ]);
  return { bouts, confirmed };
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
 * **Two strengths of asking.** Nearly every caller asks for the whole card
 * after an edit that touched one fighter, and that is only cheap if the bouts
 * that edit did not change are left exactly as they are. So by default a row is
 * put back in the queue only when the bout's fingerprint has moved away from
 * both the video it is playing and the request already on the row: a bout
 * whose video is current stays `done`, and one that has failed twice stays
 * parked rather than being retried every hour because somebody on another bout
 * changed their nickname. It used to reset every row on the card to `queued`
 * whatever its hash said, and the runner takes any queued row, so one fighter's
 * edit re-rendered all thirty videos.
 *
 * `force` is the promoter's own "Render again", which means it even for a bout
 * that is already current, and is the one way to put a parked bout back in the
 * queue without changing it.
 */
export async function enqueueRender(
  db: Db,
  eventId: string,
  bouts: number[] | "all",
  now: number = Date.now(),
  { force = false }: { force?: boolean } = {},
): Promise<number> {
  const { bouts: hashes, confirmed } = await loadQueueFingerprints(db, eventId);
  const wanted = bouts === "all" ? Object.keys(hashes).map(Number) : bouts;

  // Every published composition of every bout asked for. A bout is two videos
  // now, and a promoter pressing "Render again" means the bout rather than one
  // of them: offering the promo on the programme and then leaving it a week
  // behind the tape would be worse than not offering it. The confirmed clips of
  // the fighters on it come with them for the same reason.
  const rows = wanted
    .filter((boutNumber) => hashes[boutNumber])
    .flatMap((boutNumber) => [
      ...PUBLISHED_TEMPLATES.map((template) => ({
        id: renderJobId(eventId, boutNumber, template),
        eventId,
        boutNumber,
        template,
        fighterId: "",
        status: "queued" as const,
        inputHash: hashes[boutNumber][template],
        attempts: 0,
        requestedAt: now,
      })),
      ...Object.entries(confirmed[boutNumber] ?? {}).map(([fighterId, inputHash]) => ({
        id: renderJobId(eventId, boutNumber, CONFIRMED_TEMPLATE, fighterId),
        eventId,
        boutNumber,
        template: CONFIRMED_TEMPLATE,
        fighterId,
        status: "queued" as const,
        inputHash,
        attempts: 0,
        requestedAt: now,
      })),
    ]);
  if (!rows.length) return 0;

  // D1 binds at most 100 parameters to one statement, and a row here is nine
  // of them, so a fifteen-bout card in one insert is refused outright — which is
  // how a fighter's submission on the demo card queued nothing and said so only
  // in the log. Ten rows a statement leaves room, and the batch keeps a card's
  // worth of requests in one transaction. A card is up to sixty rows now, with a
  // confirmed clip for every fighter, which is six statements in the one batch.
  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    statements.push(upsert(db, rows.slice(i, i + ROWS_PER_INSERT), now, force));
  }
  await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

  return rows.length;
}

const ROWS_PER_INSERT = 10;

function upsert(
  db: Db,
  rows: (typeof schema.renderJobs.$inferInsert)[],
  now: number,
  force: boolean,
) {
  // Never disturb a runner that is part way through this bout. It will finish
  // and record what it made; if the inputs have moved on since it started, the
  // hourly --stale run picks the bout up again, which is what that run is for.
  const free = or(isNull(schema.renderJobs.leaseUntil), lt(schema.renderJobs.leaseUntil, now));
  // `IS NOT` rather than `<>`, because a row that has never published has a
  // NULL hash, and `<>` against NULL is NULL rather than true.
  const moved = and(
    sql`${schema.renderJobs.currentHash} IS NOT excluded.input_hash`,
    sql`${schema.renderJobs.inputHash} IS NOT excluded.input_hash`,
  );
  return db
    .insert(schema.renderJobs)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.renderJobs.eventId,
        schema.renderJobs.boutNumber,
        schema.renderJobs.template,
        schema.renderJobs.fighterId,
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
      setWhere: force ? free : and(free, moved),
    });
}

/**
 * Moves one bout's queue rows to the number the bout has been moved to.
 *
 * The id moves with the number. It is built from the event, the bout and the
 * template, and the claim and the queue both conflict on those three columns
 * rather than on the id — so a row renumbered under its old id sat on a primary
 * key that the next bout added at that number was always going to want, and the
 * collision rolled back every render request in that batch. Rebuilt in SQL from
 * the row's own template, so a composition this file does not publish is moved
 * by the same rule rather than left behind. Migration 0016 repaired the rows
 * that had already drifted; `renderJobId` in lib/renders.ts is the rule this
 * mirrors, and tests/db/promoter-actions.test.ts holds the two together.
 *
 * Called in ascending order of the new number, so the ids a move writes have
 * always just been vacated: by the bout that was removed, or by the one below
 * that moved first.
 */
export function moveBoutJobs(db: Db, eventId: string, from: number, to: number) {
  return db
    .update(schema.renderJobs)
    .set({
      boutNumber: to,
      // The number bound as text: D1 binds a JavaScript number as a REAL, and
      // concatenated that is `2.0`, an id nothing else would ever build.
      id: sql`'rj_' || ${eventId} || '_' || ${String(to)} || '_' || ${schema.renderJobs.template} || CASE WHEN ${schema.renderJobs.fighterId} = '' THEN '' ELSE '_' || ${schema.renderJobs.fighterId} END`,
    })
    .where(and(eq(schema.renderJobs.eventId, eventId), eq(schema.renderJobs.boutNumber, from)));
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
 * The queue rows of one show, by bout and then by template.
 *
 * Two levels because a bout is two videos. A row carrying a template nothing
 * publishes any more — a `walkout` left behind by a future change of mind — is
 * kept out rather than typed away, so the dashboard never reads a state for a
 * composition it does not show.
 */
export function jobsByBout<T extends { boutNumber: number; template: string }>(
  rows: T[],
): Record<number, Partial<Record<PublishedTemplate, T>>> {
  const jobs: Record<number, Partial<Record<PublishedTemplate, T>>> = {};
  for (const row of rows) {
    if (!isPublishedTemplate(row.template)) continue;
    jobs[row.boutNumber] = { ...jobs[row.boutNumber], [row.template]: row };
  }
  return jobs;
}

/**
 * The confirmed clips' rows of one show, by bout and then by fighter.
 *
 * Keyed by fighter, never by corner, so a row left behind by a fighter who has
 * since been swapped off the bout is never read as the new fighter's clip: the
 * caller asks for whoever is on the bout now, and that row is not theirs.
 */
export function confirmedJobsByBout<
  T extends { boutNumber: number; template: string; fighterId: string },
>(rows: T[]): Record<number, Record<string, T>> {
  const jobs: Record<number, Record<string, T>> = {};
  for (const row of rows) {
    if (row.template !== CONFIRMED_TEMPLATE || !row.fighterId) continue;
    jobs[row.boutNumber] = { ...jobs[row.boutNumber], [row.fighterId]: row };
  }
  return jobs;
}
