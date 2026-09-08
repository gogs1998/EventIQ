"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { newId, newToken } from "@/lib/auth";
import { ACTION_ERRORS, GYM_TO_CONFIRM } from "@/lib/copy";
import { getDb, type Db } from "@/lib/db";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import { currentPromoter, type Promoter } from "@/lib/session";
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

type Owned = { promoter: Promoter; event: typeof schema.events.$inferSelect };

/**
 * The show and the promoter who owns it, or the sentence to show instead.
 *
 * A show that is not this promoter's and a show that does not exist still answer
 * identically, so guessing a slug tells you nothing. It reads the session rather
 * than calling `requirePromoter`, because "signed out" is a thing a promoter can
 * act on and was previously indistinguishable from a crash.
 */
async function ownedEvent(db: Db, slug: string): Promise<ActionResult<Owned>> {
  const promoter = await currentPromoter();
  if (!promoter) return refuse(ACTION_ERRORS.signedOut);

  const [event] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.slug, slug), eq(schema.events.promoterId, promoter.id)))
    .limit(1);
  if (!event) return refuse(ACTION_ERRORS.noSuchShow);

  return done({ promoter, event });
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
      const slug = slugify(name);
      const [clash] = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(eq(schema.events.slug, slug))
        .limit(1);
      if (clash) return refuse(ACTION_ERRORS.addressTaken);

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
      const { event } = owned;

      await db
        .update(schema.events)
        .set({
          name: text(form, "name", 80) || event.name,
          tagline: text(form, "tagline", 120) || null,
          date: /^\d{4}-\d{2}-\d{2}$/.test(text(form, "date", 10))
            ? text(form, "date", 10)
            : event.date,
          doorsTime: text(form, "doorsTime", 8) || event.doorsTime,
          firstBellTime: text(form, "firstBellTime", 8) || event.firstBellTime,
          venue: text(form, "venue", 80) || event.venue,
          city: text(form, "city", 60) || event.city,
          sanctioning: text(form, "sanctioning", 80) || null,
          updatedAt: Date.now(),
        })
        .where(eq(schema.events.id, event.id));

      // The show's name, date and venue are on screen in three of the five
      // scenes, so every bout's video is out of date now.
      await requestRenderQuietly(db, event.id, "all", { event: "updateEvent", route: `/promoter/e/${slug}/card` });

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
        .where(eq(schema.events.id, owned.event.id));

      // A card nobody could read did not need its videos made; a card people
      // are about to read does, and the hourly run only looks at published shows.
      if (published) {
        await requestRenderQuietly(db, owned.event.id, "all", { event: "setPublished", route: `/promoter/e/${slug}` });
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
      const { event } = owned;

      const redName = text(form, "redName", 60);
      const blueName = text(form, "blueName", 60);
      if (!redName || !blueName) return refuse(ACTION_ERRORS.boutNeedsBothCorners);

      const [{ highest }] = await db
        .select({ highest: max(schema.bouts.number) })
        .from(schema.bouts)
        .where(eq(schema.bouts.eventId, event.id));

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
          db.insert(schema.invites).values({
            id: newId("in"),
            token: newToken(),
            eventId: event.id,
            fighterId: id,
            createdAt: now,
          }),
        );
      }

      writes.push(
        db.insert(schema.bouts).values({
          id: newId("bo"),
          eventId: event.id,
          number: (highest ?? 0) + 1,
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

      await requestRenderQuietly(db, event.id, [(highest ?? 0) + 1], { event: "addBout", route: `/promoter/e/${slug}/card` });

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
      const { promoter, event } = owned;

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
        .where(and(eq(schema.bouts.eventId, event.id), eq(schema.bouts.number, boutNumber)));

      await requestRenderQuietly(db, event.id, [boutNumber], { event: "updateBout", route: `/promoter/e/${slug}/card` });

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
 */
export async function removeBout(slug: string, boutNumber: number): Promise<ActionResult> {
  return attempt(
    { event: "removeBout", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { event } = owned;

      await db
        .delete(schema.bouts)
        .where(and(eq(schema.bouts.eventId, event.id), eq(schema.bouts.number, boutNumber)));
      // The video request goes with the bout. Left behind, it is a queued job
      // for a bout that no longer exists, which the runner would try, fail and
      // report against a card that has nothing at that number.
      await db
        .delete(schema.renderJobs)
        .where(and(eq(schema.renderJobs.eventId, event.id), eq(schema.renderJobs.boutNumber, boutNumber)));

      if (!event.published) {
        const remaining = await db
          .select({ id: schema.bouts.id, number: schema.bouts.number })
          .from(schema.bouts)
          .where(eq(schema.bouts.eventId, event.id))
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
              .where(and(eq(schema.renderJobs.eventId, event.id), eq(schema.renderJobs.boutNumber, bout.number)));
          }
        }
        // Renumbering moves every bout below the gap, and the number is in the
        // video's key and on its screen.
        await requestRenderQuietly(db, event.id, "all", { event: "removeBout", route: `/promoter/e/${slug}/card` });
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

      if (!(await isOnCard(db, owned.event.id, fighterId))) {
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
      await requestRenderQuietly(db, owned.event.id, "all", { event: "updateFighter", route: `/promoter/e/${slug}/card`, fighterId });

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
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

/**
 * Records that the promoter has sent the link.
 *
 * The dashboard's whole value is the difference between "he never looked" and
 * "he looked and bailed", and neither means anything if "we never sent it" is
 * mixed in with them. So this is a button the promoter presses rather than
 * something inferred from the link having been copied.
 */
export async function markInviteSent(slug: string, fighterId: string): Promise<ActionResult> {
  return attempt(
    { event: "markInviteSent", route: `/promoter/e/${slug}`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await db
        .update(schema.invites)
        .set({ sentAt: Date.now() })
        .where(
          and(eq(schema.invites.eventId, owned.event.id), eq(schema.invites.fighterId, fighterId)),
        );

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * A new token, invalidating the old one. For a link that went to the wrong
 * number, which on an amateur card happens more than once a show.
 */
export async function regenerateInvite(slug: string, fighterId: string): Promise<ActionResult> {
  return attempt(
    { event: "regenerateInvite", route: `/promoter/e/${slug}`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await db
        .update(schema.invites)
        .set({ token: newToken(), sentAt: null, lastOpenedAt: null })
        .where(
          and(eq(schema.invites.eventId, owned.event.id), eq(schema.invites.fighterId, fighterId)),
        );

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}

// ----------------------------------------------------------------- sponsors

export async function addSponsor(slug: string, form: FormData): Promise<ActionResult> {
  return attempt(
    { event: "addSponsor", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { promoter, event } = owned;

      const name = text(form, "name", 60);
      if (!name) return refuse(ACTION_ERRORS.sponsorNeedsName);

      const id = newId("sp");
      await db.insert(schema.sponsors).values({
        id,
        promoterId: promoter.id,
        name,
        qualifier: text(form, "qualifier", 60) || null,
        url: text(form, "url", 200) || null,
        createdAt: Date.now(),
      });

      if (form.get("showSponsor") === "on") {
        const existing = await db
          .select({ position: schema.eventSponsors.position })
          .from(schema.eventSponsors)
          .where(eq(schema.eventSponsors.eventId, event.id));
        await db.insert(schema.eventSponsors).values({
          eventId: event.id,
          sponsorId: id,
          position: existing.length,
        });
      }

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return DONE;
    },
  );
}
