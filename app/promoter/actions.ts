"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import * as schema from "@/db/schema";
import { newId, newToken } from "@/lib/auth";
import { getDb, type Db } from "@/lib/db";
import { requirePromoter } from "@/lib/session";

/**
 * Everything the promoter can change.
 *
 * Every action re-reads the show and checks who owns it. The slug in the URL is
 * a name, not a capability, so nothing here trusts it: a promoter who guesses
 * another promoter's slug gets the same answer as one who guesses a slug that
 * does not exist.
 */

async function ownedEvent(db: Db, slug: string) {
  const promoter = await requirePromoter();
  const [event] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.slug, slug), eq(schema.events.promoterId, promoter.id)))
    .limit(1);
  if (!event) throw new Error("No such show");
  return { promoter, event };
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

/** A slug a promoter can read off a printed card and type into a phone. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ------------------------------------------------------------------- events

export async function createEvent(_state: string | null, form: FormData): Promise<string | null> {
  const promoter = await requirePromoter();
  const name = text(form, "name", 80);
  const date = text(form, "date", 10);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "A name and a date, both.";

  const db = await getDb();
  const slug = slugify(name);
  const [clash] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.slug, slug))
    .limit(1);
  if (clash) return "There is already a show at that address. Change the name slightly.";

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

  redirect(`/promoter/e/${slug}`);
}

export async function updateEvent(slug: string, form: FormData): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);

  await db
    .update(schema.events)
    .set({
      name: text(form, "name", 80) || event.name,
      tagline: text(form, "tagline", 120) || null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(text(form, "date", 10)) ? text(form, "date", 10) : event.date,
      doorsTime: text(form, "doorsTime", 8) || event.doorsTime,
      firstBellTime: text(form, "firstBellTime", 8) || event.firstBellTime,
      venue: text(form, "venue", 80) || event.venue,
      city: text(form, "city", 60) || event.city,
      sanctioning: text(form, "sanctioning", 80) || null,
      updatedAt: Date.now(),
    })
    .where(eq(schema.events.id, event.id));

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/e/${slug}`);
}

export async function setPublished(slug: string, published: boolean): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);
  await db
    .update(schema.events)
    .set({ published, updatedAt: Date.now() })
    .where(eq(schema.events.id, event.id));

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/e/${slug}`);
  revalidatePath("/");
}

// -------------------------------------------------------------------- bouts

/**
 * A bout and the two fighters on it, in one step.
 *
 * A bout cannot exist without both corners, and a promoter entering a card is
 * reading a matchmaking sheet with both names on the same line. Splitting this
 * into "create fighter, create fighter, create bout" would be three screens for
 * something that is one line of the sheet.
 */
export async function addBout(slug: string, form: FormData): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);

  const redName = text(form, "redName", 60);
  const blueName = text(form, "blueName", 60);
  if (!redName || !blueName) return;

  const [{ highest }] = await db
    .select({ highest: max(schema.bouts.number) })
    .from(schema.bouts)
    .where(eq(schema.bouts.eventId, event.id));

  const now = Date.now();
  const fighterIds: string[] = [];
  for (const [name, gymKey] of [
    [redName, "redGym"],
    [blueName, "blueGym"],
  ] as const) {
    const id = await uniqueFighterId(db, name);
    fighterIds.push(id);
    await db.insert(schema.fighters).values({
      id,
      name,
      gym: text(form, gymKey, 60) || "Gym to confirm",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.invites).values({
      id: newId("in"),
      token: newToken(),
      eventId: event.id,
      fighterId: id,
      createdAt: now,
    });
  }

  await db.insert(schema.bouts).values({
    id: newId("bo"),
    eventId: event.id,
    number: (highest ?? 0) + 1,
    discipline: text(form, "discipline", 20) || "MMA",
    weightKg: number(form, "weightKg") ?? 70,
    classLabel: text(form, "classLabel", 30) || null,
    womens: form.get("womens") === "on",
    rounds: number(form, "rounds") ?? 3,
    roundMinutes: number(form, "roundMinutes") ?? 3,
    redId: fighterIds[0],
    blueId: fighterIds[1],
  });

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/e/${slug}`);
}

/**
 * Fighters are shared across shows, so ids have to be unique globally rather
 * than within one card. A readable id keeps the profile URL something a fighter
 * will actually put in an Instagram bio, which is the whole point of it.
 */
async function uniqueFighterId(db: Db, name: string): Promise<string> {
  const base = slugify(name) || "fighter";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = attempt === 0 ? base : `${base}-${attempt + 1}`;
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
export async function updateBout(slug: string, boutNumber: number, form: FormData): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);

  const sponsorId = text(form, "sponsorId", 60);
  const billing = text(form, "billing", 10);

  await db
    .update(schema.bouts)
    .set({
      discipline: text(form, "discipline", 20) || "MMA",
      weightKg: number(form, "weightKg") ?? 70,
      classLabel: text(form, "classLabel", 30) || null,
      titleLabel: text(form, "titleLabel", 60) || null,
      womens: form.get("womens") === "on",
      rounds: number(form, "rounds") ?? 3,
      roundMinutes: number(form, "roundMinutes") ?? 3,
      billing: billing === "MAIN" || billing === "CO_MAIN" ? billing : null,
      sponsorId: sponsorId || null,
    })
    .where(and(eq(schema.bouts.eventId, event.id), eq(schema.bouts.number, boutNumber)));

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/e/${slug}`);
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
export async function removeBout(slug: string, boutNumber: number): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);

  await db
    .delete(schema.bouts)
    .where(and(eq(schema.bouts.eventId, event.id), eq(schema.bouts.number, boutNumber)));

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
      }
    }
  }

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/e/${slug}`);
}

/** Name and gym come off the promoter's own entry form, so they can fix them. */
export async function updateFighter(slug: string, fighterId: string, form: FormData): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);
  await assertOnCard(db, event.id, fighterId);

  await db
    .update(schema.fighters)
    .set({
      name: text(form, "name", 60),
      gym: text(form, "gym", 60) || "Gym to confirm",
      updatedAt: Date.now(),
    })
    .where(eq(schema.fighters.id, fighterId));

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/e/${slug}`);
}

async function assertOnCard(db: Db, eventId: string, fighterId: string): Promise<void> {
  const [invite] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(and(eq(schema.invites.eventId, eventId), eq(schema.invites.fighterId, fighterId)))
    .limit(1);
  if (!invite) throw new Error("Not on this card");
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
export async function markInviteSent(slug: string, fighterId: string): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);
  await db
    .update(schema.invites)
    .set({ sentAt: Date.now() })
    .where(and(eq(schema.invites.eventId, event.id), eq(schema.invites.fighterId, fighterId)));

  revalidatePath(`/promoter/e/${slug}`);
}

/**
 * A new token, invalidating the old one. For a link that went to the wrong
 * number, which on an amateur card happens more than once a show.
 */
export async function regenerateInvite(slug: string, fighterId: string): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);
  await db
    .update(schema.invites)
    .set({ token: newToken(), sentAt: null, lastOpenedAt: null })
    .where(and(eq(schema.invites.eventId, event.id), eq(schema.invites.fighterId, fighterId)));

  revalidatePath(`/promoter/e/${slug}`);
}

// ----------------------------------------------------------------- sponsors

export async function addSponsor(slug: string, form: FormData): Promise<void> {
  const db = await getDb();
  const { promoter, event } = await ownedEvent(db, slug);

  const name = text(form, "name", 60);
  if (!name) return;

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
}
