"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { newId } from "@/lib/auth";
import { ACTION_ERRORS, GYM_TO_CONFIRM } from "@/lib/copy";
import { getDb, type Db } from "@/lib/db";
import { newInviteValues, uniqueSlug } from "@/lib/db/queries";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import {
  recordDiff,
  type ImportOutcome,
  type ImportTarget,
  type RecordFill,
} from "@/lib/fighter-import";
import { withinPromoterImportLimit } from "@/lib/rate-limit";
import { importRecord, promoterScope } from "@/lib/record-import";
import { currentPromoter, type Promoter } from "@/lib/session";
import { loadOwnedCard, type OwnedCard } from "@/lib/visibility";
import { hasSlug, slugify } from "@/lib/slug";
import { parseWeightKg } from "@/lib/tape";

/**
 * Everything the promoter can change.
 *
 * Every action re-reads the show and checks who owns it. The slug in the URL is
 * a name, not a capability, so nothing here trusts it: a promoter who guesses
 * another promoter's slug gets the same answer as one who guesses a slug that
 * does not exist.
 *
 * Everything a caller can reasonably reach comes back as an `ActionResult`
 * rather than being thrown. These used to throw for an expired session, for
 * another promoter's show and for a D1 that would not answer, and every caller
 * `void`ed the promise — so the failure was a control that greyed out, came
 * back, and changed nothing. `attempt` wraps each body: a refusal is a sentence
 * from lib/copy.ts, a fault is logged with its stack and shown as one.
 * `redirect()` still throws, because it is control flow the framework needs, so
 * it stays outside the wrapper.
 */

type Owned = { promoter: Promoter; card: OwnedCard };

/**
 * The show and the promoter who owns it, or the sentence to show instead.
 *
 * The check itself is `loadOwnedCard` in lib/visibility.ts, beside the publish
 * gate, rather than a where clause written out here. There were five copies of
 * it and five copies of a rule is exactly what section 14 keeps recording. The
 * branded `OwnedCard` is the other half: it can only be made by that function,
 * so nothing in this file can come to hold a card nobody checked.
 *
 * A show that is not this promoter's and a show that does not exist still answer
 * identically, so guessing a slug tells you nothing. It reads the session rather
 * than calling `requirePromoter`, because "signed out" is a thing a promoter can
 * act on and was previously indistinguishable from a crash.
 */
async function ownedEvent(db: Db, slug: string): Promise<ActionResult<Owned>> {
  const promoter = await currentPromoter();
  if (!promoter) return refuse(ACTION_ERRORS.signedOut);

  const card = await loadOwnedCard(db, slug, promoter.id);
  if (!card) return refuse(ACTION_ERRORS.noSuchShow);

  return done({ promoter, card });
}

function text(form: FormData, key: string, max = 200): string {
  return String(form.get(key) ?? "").slice(0, max).trim();
}

function number(form: FormData, key: string): number | null {
  const value = text(form, key);
  if (!value) return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------- events

export async function createEvent(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const created = await attempt(
    { event: "createEvent", route: "/promoter" },
    ACTION_ERRORS.showNotCreated,
    async (): Promise<ActionResult<{ slug: string }>> => {
      const promoter = await currentPromoter();
      if (!promoter) return refuse(ACTION_ERRORS.signedOut);

      const name = text(form, "name", 80);
      const date = text(form, "date", 10);
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return refuse(ACTION_ERRORS.showNeedsNameAndDate);
      }
      // A name made only of punctuation slugifies to nothing, and the row that
      // used to be written from it was a programme addressed at `/e/`: unreachable,
      // and the second one named that way collided with the first.
      if (!hasSlug(name)) return refuse(ACTION_ERRORS.showNameNeedsCharacters);

      const db = await getDb();
      // Suffixed rather than refused where the address is taken, because the
      // refusal used to say that a show of that name exists and the promoter it
      // belongs to may be somebody else. Null is the one collision they can
      // already see — a show of their own — where a second `-2` of it would be
      // two shows with one name. HANDOVER section 6f.
      const address = await uniqueSlug(db, name, promoter.id);
      if (!address) return refuse(ACTION_ERRORS.addressTaken);
      const { slug } = address;

      const now = Date.now();
      await db.insert(schema.events).values({
        id: newId("ev"),
        promoterId: promoter.id,
        slug,
        name,
        date,
        doorsTime: text(form, "doorsTime", 8) || "18:00",
        firstBellTime: text(form, "firstBellTime", 8) || "19:00",
        venue: text(form, "venue", 80) || "Venue to confirm",
        city: text(form, "city", 60) || "",
        sanctioning: text(form, "sanctioning", 80) || null,
        // Unpublished, always. A show is not on the tables the moment it is typed
        // in, and a half-entered card appearing at a public address would be worse
        // than no card at all.
        published: false,
        createdAt: now,
        updatedAt: now,
      });

      return done({ slug });
    },
  );

  if (!created.ok) return created;
  redirect(`/promoter/e/${created.slug}`);
}

export async function updateEvent(slug: string, form: FormData): Promise<ActionResult> {
  return attempt(
    { event: "updateEvent", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;
      const show = card.event;

      await db
        .update(schema.events)
        .set({
          name: text(form, "name", 80) || show.name,
          tagline: text(form, "tagline", 120) || null,
          date: /^\d{4}-\d{2}-\d{2}$/.test(text(form, "date", 10))
            ? text(form, "date", 10)
            : show.date,
          doorsTime: text(form, "doorsTime", 8) || show.doorsTime,
          firstBellTime: text(form, "firstBellTime", 8) || show.firstBellTime,
          venue: text(form, "venue", 80) || show.venue,
          city: text(form, "city", 60) || show.city,
          sanctioning: text(form, "sanctioning", 80) || null,
          updatedAt: Date.now(),
        })
        .where(eq(schema.events.id, card.eventId));

      // The show's name, date and venue are on screen in three of the five
      // scenes, so every bout's video is out of date now.
      await requestRenderQuietly(db, card.eventId, "all", { event: "updateEvent", route: `/promoter/e/${slug}/card` });

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}

export async function setPublished(slug: string, published: boolean): Promise<ActionResult> {
  return attempt(
    { event: "setPublished", route: `/promoter/e/${slug}` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await db
        .update(schema.events)
        .set({ published, updatedAt: Date.now() })
        .where(eq(schema.events.id, owned.card.eventId));

      // A card nobody could read did not need its videos made; a card people
      // are about to read does, and the hourly run only looks at published shows.
      if (published) {
        await requestRenderQuietly(db, owned.card.eventId, "all", { event: "setPublished", route: `/promoter/e/${slug}` });
      }

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      revalidatePath("/");
      return DONE;
    },
  );
}

// -------------------------------------------------------------------- bouts

/**
 * A bout and the two fighters on it, in one step.
 *
 * A bout cannot exist without both corners, and a promoter entering a card is
 * reading a matchmaking sheet with both names on the same line. Splitting this
 * into "create fighter, create fighter, create bout" would be three screens for
 * something that is one line of the sheet.
 *
 * All five rows go in as one `db.batch`, which D1 runs as a single transaction.
 * As five separate statements, a failure partway through left a fighter with no
 * bout and no invite: invisible on every screen, because everything is derived
 * from the running order, and still in the table when somebody next counted.
 * Same fix and same reasoning as `saveDraft` in the fighter's actions (bug 24).
 */
export async function addBout(slug: string, form: FormData): Promise<ActionResult> {
  return attempt(
    { event: "addBout", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;

      const redName = text(form, "redName", 60);
      const blueName = text(form, "blueName", 60);
      if (!redName || !blueName) return refuse(ACTION_ERRORS.boutNeedsBothCorners);

      // Off the card the ownership check has already loaded, rather than a
      // second query for a number that is sitting in it.
      const nextNumber = Math.max(0, ...card.event.bouts.map((bout) => bout.number)) + 1;

      const now = Date.now();
      const fighterIds: string[] = [];
      const writes: BatchItem<"sqlite">[] = [];

      for (const [name, gymKey] of [
        [redName, "redGym"],
        [blueName, "blueGym"],
      ] as const) {
        // Chosen before the batch rather than inside it: an id has to be unique
        // against rows that already exist, and a batch is a list of writes with
        // nothing read back between them.
        const id = await uniqueFighterId(db, name, fighterIds);
        fighterIds.push(id);
        writes.push(
          db.insert(schema.fighters).values({
            id,
            name,
            gym: text(form, gymKey, 60) || GYM_TO_CONFIRM,
            createdAt: now,
            updatedAt: now,
          }),
          // Through newInviteValues so the token is sealed rather than stored in
          // the clear, and so a third place that issues one cannot forget to.
          db.insert(schema.invites).values((await newInviteValues(card.eventId, id, now)).values),
        );
      }

      writes.push(
        db.insert(schema.bouts).values({
          id: newId("bo"),
          eventId: card.eventId,
          number: nextNumber,
          discipline: text(form, "discipline", 20) || "MMA",
          // Weights are the one number here that is not whole: catchweights on
          // these cards are agreed at the half kilo, so this is not rounded like
          // the rounds.
          weightKg: parseWeightKg(text(form, "weightKg")) ?? 70,
          classLabel: text(form, "classLabel", 30) || null,
          womens: form.get("womens") === "on",
          rounds: number(form, "rounds") ?? 3,
          roundMinutes: number(form, "roundMinutes") ?? 3,
          redId: fighterIds[0],
          blueId: fighterIds[1],
        }),
      );

      await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

      await requestRenderQuietly(db, card.eventId, [nextNumber], { event: "addBout", route: `/promoter/e/${slug}/card` });

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * Fighters are shared across shows, so ids have to be unique globally rather
 * than within one card. A readable id keeps the profile URL something a fighter
 * will actually put in an Instagram bio, which is the whole point of it.
 *
 * `taken` carries the ids this same call has already settled on but not yet
 * written. Both corners go in one batch now, so the database cannot report the
 * first one while the second is being chosen — which is the card where two
 * namesakes are matched against each other.
 */
async function uniqueFighterId(db: Db, name: string, taken: string[] = []): Promise<string> {
  const base = slugify(name) || "fighter";
  for (let n = 0; n < 20; n += 1) {
    const id = n === 0 ? base : `${base}-${n + 1}`;
    if (taken.includes(id)) continue;
    const [clash] = await db
      .select({ id: schema.fighters.id })
      .from(schema.fighters)
      .where(eq(schema.fighters.id, id))
      .limit(1);
    if (!clash) return id;
  }
  return newId(base);
}

/**
 * Bouts are addressed by their number within the show rather than by their row
 * id. The number is what a promoter is looking at on the sheet, it is unique per
 * event, and it keeps internal ids out of the markup.
 */
export async function updateBout(
  slug: string,
  boutNumber: number,
  form: FormData,
): Promise<ActionResult> {
  return attempt(
    { event: "updateBout", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { promoter, card } = owned;

      const sponsorId = text(form, "sponsorId", 60);
      const billing = text(form, "billing", 10);

      // The show is checked to be this promoter's and the sponsor was not: an id
      // typed into the form put another promoter's sponsor on the bout, and the
      // programme sets a sponsor's name in its own typography, so it would have
      // been published under their client's card. Sponsors are per promoter.
      if (sponsorId) {
        const [theirs] = await db
          .select({ id: schema.sponsors.id })
          .from(schema.sponsors)
          .where(and(eq(schema.sponsors.id, sponsorId), eq(schema.sponsors.promoterId, promoter.id)))
          .limit(1);
        if (!theirs) return refuse(ACTION_ERRORS.noSuchSponsor);
      }

      // As the bout stood before this write, because one that is off has no
      // video to bring up to date and must not be queued for one.
      // `loadBoutFingerprints` leaves it out anyway, so this is belt and braces
      // — but the queue call is where the decision reads, and a reader should
      // not have to go and check.
      const existing = card.event.bouts.find((bout) => bout.number === boutNumber);

      await db
        .update(schema.bouts)
        .set({
          discipline: text(form, "discipline", 20) || "MMA",
          weightKg: parseWeightKg(text(form, "weightKg")) ?? 70,
          classLabel: text(form, "classLabel", 30) || null,
          titleLabel: text(form, "titleLabel", 60) || null,
          womens: form.get("womens") === "on",
          rounds: number(form, "rounds") ?? 3,
          roundMinutes: number(form, "roundMinutes") ?? 3,
          billing: billing === "MAIN" || billing === "CO_MAIN" ? billing : null,
          sponsorId: sponsorId || null,
        })
        .where(and(eq(schema.bouts.eventId, card.eventId), eq(schema.bouts.number, boutNumber)));

      if (!existing?.cancelled) {
        await requestRenderQuietly(db, card.eventId, [boutNumber], { event: "updateBout", route: `/promoter/e/${slug}/card` });
      }

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}

/** Longest a withdrawal note can be. It is set beside a bout number, not under it. */
const CANCELLED_NOTE_MAX = 60;

/**
 * Takes a bout off the card, or puts it back on.
 *
 * The alternative a promoter would otherwise reach for is `removeBout`, and on a
 * published show that is the wrong remedy: it destroys the sponsor placement
 * that was sold and the analytics rows keyed on the bout number, and it leaves
 * the programme wrong at the one moment several hundred people are reading it.
 * So the row stays exactly where it is and carries a flag, which is what a paper
 * programme does with a withdrawal.
 *
 * Nothing is rendered for a bout that is off. The video is a walkout for a
 * walkout that is not happening, and it would sit on the programme behind a line
 * saying the bout is withdrawn.
 */
export async function setBoutOff(
  slug: string,
  boutNumber: number,
  off: boolean,
  note: string,
): Promise<ActionResult> {
  return attempt(
    { event: "setBoutOff", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;

      await db
        .update(schema.bouts)
        .set({
          cancelled: off,
          // Cleared when the bout goes back on, so a bout that came off for a
          // weight miss and was rematched does not carry the old line.
          cancelledNote: off ? note.trim().slice(0, CANCELLED_NOTE_MAX) || null : null,
        })
        .where(and(eq(schema.bouts.eventId, card.eventId), eq(schema.bouts.number, boutNumber)));

      // A bout coming back on is a bout that needs its video again; one going off
      // is not asked for at all. The queued row is left where it is: the runner
      // reads the fingerprints, which no longer carry this bout, and a bout put
      // back on the following morning gets its place in the queue back with it.
      if (!off) {
        await requestRenderQuietly(db, card.eventId, [boutNumber], { event: "setBoutOff", route: `/promoter/e/${slug}/card` });
      }

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * Withdrawals happen on every amateur card, so this has to be easy.
 *
 * The gap it leaves in the running order is closed only while the show is
 * unpublished. Once spectators are reading the card, bout numbers are what the
 * analytics rows are keyed on and what the MC is calling out, so renumbering
 * behind everyone would silently reattribute one bout's figures to another and
 * put the wrong number on the screen mid-show. A published card skips the
 * number instead, which is exactly what a paper programme does.
 *
 * **A corner this leaves on no other bout is off the card, and their link is
 * pulled.** It used to be left live: a fighter taken off a show could still open
 * their questionnaire and go on filling in a profile for a card they are not on,
 * for the ninety days the expiry gives it, and the promoter had no way to see
 * that had happened. The link is the whole of the authorisation, so revoking it
 * is what taking somebody off the card means.
 *
 * **The profile itself stays, and that is deliberate.** Withdrawals happen on
 * every amateur card and so do mistakes, and the two are the same click. A bout
 * removed in error must not destroy the photograph, the record and the answers
 * the fighter sent — put back on the card the next morning, they are re-invited
 * with a new link and everything they typed is still there. What clears a
 * profile nobody is putting on a card any more is `npm run retention`, which
 * dates a fighter by their last connection to any show, and the fighter's own
 * removal control, which is theirs to press. Section 6g.
 */
export async function removeBout(slug: string, boutNumber: number): Promise<ActionResult> {
  return attempt(
    { event: "removeBout", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;

      // Worked out from the card the ownership check already loaded, before the
      // bout goes out of it: a corner on no other bout of this show has nothing
      // left on the card at all.
      const going = card.event.bouts.find((bout) => bout.number === boutNumber);
      const orphaned = [going?.redId, going?.blueId].filter(
        (fighterId): fighterId is string =>
          !!fighterId &&
          !card.event.bouts.some(
            (bout) =>
              bout.number !== boutNumber &&
              (bout.redId === fighterId || bout.blueId === fighterId),
          ),
      );

      // One batch, which D1 runs as a single transaction, because a bout deleted
      // with its fighters' links still open is exactly the half-state this is
      // here to avoid — and nobody would ever see it, since every screen is
      // derived from the running order the bout has just left.
      const removals: BatchItem<"sqlite">[] = [
        db
          .delete(schema.bouts)
          .where(and(eq(schema.bouts.eventId, card.eventId), eq(schema.bouts.number, boutNumber))),
        // The video request goes with the bout. Left behind, it is a queued job
        // for a bout that no longer exists, which the runner would try, fail and
        // report against a card that has nothing at that number. Nothing is
        // queued in its place either: the fingerprints are built from the
        // running order, which no longer carries it.
        db
          .delete(schema.renderJobs)
          .where(and(eq(schema.renderJobs.eventId, card.eventId), eq(schema.renderJobs.boutNumber, boutNumber))),
      ];
      if (orphaned.length) {
        removals.push(
          db
            .update(schema.invites)
            // Only the ones still open, so a link the fighter had already pulled
            // themselves keeps the timestamp that says when they did.
            .set({ revokedAt: Date.now() })
            .where(
              and(
                eq(schema.invites.eventId, card.eventId),
                inArray(schema.invites.fighterId, orphaned),
                isNull(schema.invites.revokedAt),
              ),
            ),
        );
      }
      await db.batch(removals as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

      if (!card.published) {
        const remaining = await db
          .select({ id: schema.bouts.id, number: schema.bouts.number })
          .from(schema.bouts)
          .where(eq(schema.bouts.eventId, card.eventId))
          .orderBy(schema.bouts.number);

        // Shifted downwards one at a time from the bottom, because (event, number)
        // is unique and a bulk update would collide with itself.
        for (const [index, bout] of remaining.entries()) {
          if (bout.number !== index + 1) {
            await db
              .update(schema.bouts)
              .set({ number: index + 1 })
              .where(eq(schema.bouts.id, bout.id));
            // Jobs and videos are keyed by bout number, so they move with it;
            // otherwise the video made for bout seven would be filed under
            // whichever bout is seventh now.
            await db
              .update(schema.renderJobs)
              .set({ boutNumber: index + 1 })
              .where(and(eq(schema.renderJobs.eventId, card.eventId), eq(schema.renderJobs.boutNumber, bout.number)));
          }
        }
        // Renumbering moves every bout below the gap, and the number is in the
        // video's key and on its screen.
        await requestRenderQuietly(db, card.eventId, "all", { event: "removeBout", route: `/promoter/e/${slug}/card` });
      }

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * Name and gym come off the promoter's own entry form, so they can fix them.
 *
 * A name is the one field on a fighter that nothing can stand in for. An empty
 * gym becomes "Gym to confirm", a missing record is simply absent, but a blank
 * name renders as a gap on the public programme and reads out as silence in the
 * video, so it is refused rather than saved.
 */
export async function updateFighter(
  slug: string,
  fighterId: string,
  form: FormData,
): Promise<ActionResult> {
  return attempt(
    { event: "updateFighter", route: `/promoter/e/${slug}/card`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      if (!(await isOnCard(db, owned.card.eventId, fighterId))) {
        return refuse(ACTION_ERRORS.notOnThisCard);
      }

      const name = text(form, "name", 60);
      if (!name) return refuse(ACTION_ERRORS.fighterNeedsName);

      await db
        .update(schema.fighters)
        .set({
          name,
          gym: text(form, "gym", 60) || GYM_TO_CONFIRM,
          updatedAt: Date.now(),
        })
        .where(eq(schema.fighters.id, fighterId));

      // The name and gym are on the tape. The fighter is on one bout of this
      // card, but the fingerprint tells the other bouts apart for nothing.
      await requestRenderQuietly(db, owned.card.eventId, "all", { event: "updateFighter", route: `/promoter/e/${slug}/card`, fighterId });

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}

// --------------------------------------------------- filling a fighter in

/**
 * The promoter's own record importer, one fighter at a time.
 *
 * The weakest part of the product is the undercard, and the reason is that
 * thirty fighters never reply. The endpoint at /api/import-record has always
 * been able to fix that; what it lacked was a box in the place the promoter is
 * already standing. This is that box, and it deliberately does not go through
 * the open endpoint: it runs with the promoter's session, on a fighter their own
 * card carries, and it is counted against the promoter rather than against
 * whatever address they happen to be on — an office entering two cards from one
 * connection is two promoters, and a promoter on a train is one.
 *
 * **One fighter at a time, deliberately.** Doing a whole card on one press is
 * the obvious next thing and is not built here. Sherdog's robots.txt permits
 * crawling and robots.txt is not a licence (HANDOVER section 8a), the owner has
 * not settled the terms question, and thirty pages on one button press is
 * exactly what turns "one page, on a person's instruction, at human rate" into
 * something that would have to be defended. That is a decision for a person, not
 * one for this file to take on their behalf.
 *
 * Nothing is written here. It reads the page and answers with what it would do.
 */
export async function lookupFighterRecord(
  slug: string,
  fighterId: string,
  url: string,
): Promise<ActionResult<{ outcome: ImportOutcome; diff: RecordFill[] }>> {
  return attempt(
    { event: "lookupFighterRecord", route: `/promoter/e/${slug}/card`, fighterId },
    ACTION_ERRORS.importNotRead,
    async () => {
      const found = await importableFighter(slug, fighterId);
      if (!found.ok) return found;
      const { db, promoter, fighter } = found;

      const outcome = await importRecord(db, url, promoterScope(promoter.id));
      if (!outcome.ok) return done({ outcome, diff: [] });

      return done({ outcome, diff: recordDiff(targetOf(fighter), outcome.tape) });
    },
  );
}

/**
 * Writes the boxes that were empty, and only those.
 *
 * The page is read again rather than the confirmation being taken at its word,
 * so what goes on the card is what the source actually said rather than what
 * came back through a browser. It costs one cached row read: the lookup a moment
 * ago put the page in `import_cache`, and nothing goes out to Sherdog again.
 *
 * "Where empty" is decided here rather than when the diff was drawn, because a
 * fighter can fill their own form in between the two — and if they have, theirs
 * wins. Anything a person typed beats anything a page said.
 */
export async function applyFighterRecord(
  slug: string,
  fighterId: string,
  url: string,
): Promise<ActionResult<{ applied: string[] }>> {
  return attempt(
    { event: "applyFighterRecord", route: `/promoter/e/${slug}/card`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const found = await importableFighter(slug, fighterId);
      if (!found.ok) return found;
      const { db, promoter, card, fighter } = found;

      const outcome = await importRecord(db, url, promoterScope(promoter.id));
      if (!outcome.ok) {
        return refuse("reason" in outcome ? outcome.reason : ACTION_ERRORS.importNotRead);
      }

      const { tape } = outcome;
      const filled = recordDiff(targetOf(fighter), tape).filter((row) => row.fills);
      const filling = new Set(filled.map((row) => row.key));
      if (!filling.size) return done({ applied: [] });

      await db
        .update(schema.fighters)
        .set({
          // Bounded on the way in like everything else off a form: this is text
          // from somebody else's website, and it lands on a card.
          ...(filling.has("name") && tape.name ? { name: tape.name.trim().slice(0, 60) } : {}),
          ...(filling.has("age") ? { age: tape.age } : {}),
          ...(filling.has("hometown") && tape.hometown
            ? { hometown: tape.hometown.trim().slice(0, 60) }
            : {}),
          // All three or none, so an imported record can never be read back as a
          // debut. Same rule as the questionnaire's own save.
          ...(filling.has("record") && tape.record
            ? { recordW: tape.record.w, recordL: tape.record.l, recordD: tape.record.d }
            : {}),
          // Both or neither, for the same reason: queries.ts reads the pair as
          // all-or-nothing, and a stored knockout count with no submission count
          // beside it is not a set of finishes. `finishCount` holds the total to
          // the wins, so a page that disagrees with its own record cannot put
          // more finishes on the tape than there are wins to have had them in.
          ...(filling.has("finishes") && tape.finishes
            ? { finishKo: tape.finishes.ko, finishSub: tape.finishes.sub }
            : {}),
          updatedAt: Date.now(),
        })
        .where(eq(schema.fighters.id, fighterId));

      // A record and a hometown are two rows of the tale of the tape, so the
      // bout's video is out of date. Asked for the card, like updateFighter: the
      // fingerprint tells the other bouts apart for nothing.
      await requestRenderQuietly(db, card.eventId, "all", { event: "applyFighterRecord", route: `/promoter/e/${slug}/card`, fighterId });

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/promoter/e/${slug}/card`);
      revalidatePath(`/e/${slug}`);

      return done({ applied: filled.map((row) => row.label) });
    },
  );
}

/**
 * The show, the promoter, the fighter and the promoter's allowance, in the order
 * that stops the expensive question being asked before the cheap ones.
 *
 * The rate limit is here rather than at each caller because both of these can
 * end in a request to somebody else's website, and the thing being protected is
 * that website rather than us: it should not matter which of our doors a lookup
 * came through.
 */
async function importableFighter(
  slug: string,
  fighterId: string,
): Promise<
  ActionResult<{
    db: Db;
    promoter: Promoter;
    card: OwnedCard;
    fighter: typeof schema.fighters.$inferSelect;
  }>
> {
  const db = await getDb();
  const owned = await ownedEvent(db, slug);
  if (!owned.ok) return owned;
  const { promoter, card } = owned;

  if (!(await isOnCard(db, card.eventId, fighterId))) return refuse(ACTION_ERRORS.notOnThisCard);

  if (!(await withinPromoterImportLimit(promoter.id))) {
    return refuse(ACTION_ERRORS.importTooMany);
  }

  const [fighter] = await db
    .select()
    .from(schema.fighters)
    .where(eq(schema.fighters.id, fighterId))
    .limit(1);
  if (!fighter) return refuse(ACTION_ERRORS.notOnThisCard);

  return done({ db, promoter, card, fighter });
}

/**
 * The five boxes an import can fill, off the stored row.
 *
 * The record is all three columns or none, exactly as lib/db/queries.ts reads
 * it: a partly stored record is not a record, and reading it as one would let an
 * import top up a fighter's losses without their wins. The finishes are the same
 * rule over two columns.
 */
function targetOf(fighter: typeof schema.fighters.$inferSelect): ImportTarget {
  return {
    name: fighter.name,
    record:
      fighter.recordW !== null && fighter.recordL !== null && fighter.recordD !== null
        ? { w: fighter.recordW, l: fighter.recordL, d: fighter.recordD }
        : null,
    finishes:
      fighter.finishKo !== null && fighter.finishSub !== null
        ? { ko: fighter.finishKo, sub: fighter.finishSub }
        : null,
    age: fighter.age,
    hometown: fighter.hometown,
  };
}

/** A fighter is on a card if there is an invite for them on it, and not otherwise. */
async function isOnCard(db: Db, eventId: string, fighterId: string): Promise<boolean> {
  const [invite] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(and(eq(schema.invites.eventId, eventId), eq(schema.invites.fighterId, fighterId)))
    .limit(1);
  return !!invite;
}

// ------------------------------------------------------------------ invites
//
// markInviteSent, regenerateInvite and revokeInvite live in
// app/promoter/invite-actions.ts, beside the encryption and expiry rules they
// have to keep to.

// ----------------------------------------------------------------- sponsors
//
// addSponsor, replaceSponsorMark and removeSponsorMark live in
// app/promoter/sponsor-actions.ts, beside the bucket and fingerprint rules an
// emblem has to keep to.
