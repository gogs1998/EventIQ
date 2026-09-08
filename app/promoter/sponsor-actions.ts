"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { newId } from "@/lib/auth";
import { ACTION_ERRORS } from "@/lib/copy";
import { getDb, getMedia, type Db } from "@/lib/db";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-type";
import { logError } from "@/lib/log";
import { currentPromoter, type Promoter } from "@/lib/session";

/**
 * Everything the promoter can do to a sponsor and its emblem.
 *
 * Its own file because the emblem is its own subject: it is bytes from outside
 * that we then serve from our own origin, it is an object in the bucket that
 * something has to delete when it stops being pointed at, and it is drawn into
 * the videos, so changing one makes every bout that sponsor appears in out of
 * date. Those three rules kept together means the next change to any of them
 * has an obvious place to land.
 *
 * An emblem could only be set at the moment a sponsor was created. A promoter
 * who added one without artwork, or sent the wrong file, had no way back except
 * deleting the sponsor — which takes the bout placements they had sold with it.
 *
 * Every one of these re-reads the show and checks who owns it, exactly as the
 * card actions do. A slug is a name, not a capability, and neither is a sponsor
 * id typed into a form.
 */

type Owned = { promoter: Promoter; event: typeof schema.events.$inferSelect };

/**
 * The show and the promoter who owns it, or the sentence to show instead.
 *
 * Written out again rather than shared with app/promoter/actions.ts: everything
 * exported from a "use server" module is an endpoint, so a helper cannot be
 * exported between two of them without also publishing it to the internet.
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

/**
 * A sponsor of this promoter's, with the emblem key it currently points at.
 *
 * Sponsors are per promoter and the programme sets a sponsor's name in its own
 * typography, so an id typed into a form used to be enough to put another
 * promoter's sponsor on a bout — the same hole, one step further along, would be
 * enough to delete their artwork. One id from another account answers exactly as
 * an id that does not exist.
 */
async function ownedSponsor(
  db: Db,
  promoterId: string,
  sponsorId: string,
): Promise<ActionResult<{ markKey: string | null }>> {
  const [sponsor] = await db
    .select({ markKey: schema.sponsors.markKey })
    .from(schema.sponsors)
    .where(and(eq(schema.sponsors.id, sponsorId), eq(schema.sponsors.promoterId, promoterId)))
    .limit(1);
  if (!sponsor) return refuse(ACTION_ERRORS.noSuchSponsor);

  return done({ markKey: sponsor.markKey });
}

function text(form: FormData, key: string, max = 200): string {
  return String(form.get(key) ?? "").slice(0, max).trim();
}

/**
 * An emblem is small. A few hundred pixels of monoline artwork sitting beside a
 * name is what these are, and anything past this is a photograph somebody has
 * chosen by mistake.
 */
const MAX_MARK_BYTES = 1024 * 1024;

/**
 * Stores a sponsor's emblem and answers with the key to put on the row.
 *
 * **The bytes decide what this is.** /media serves it back from our own origin,
 * so the declared type is a claim by whoever made the request and an SVG would
 * be a document with this origin's privileges. Same rule and same reasoning as
 * the fighter's photograph — see lib/image-type.ts and section 6b.
 *
 * Run before the sponsor row is written rather than after, so a bucket that will
 * not take the object leaves nothing behind at all. The other order leaves a
 * sponsor with a mark column pointing at nothing.
 *
 * The key carries a random suffix because /media answers with a year of
 * immutable caching, so a replaced emblem has to be a new URL or half the people
 * reading the card keep the old one.
 *
 * What this never does is put the sponsor's *name* in an image. The emblem is
 * artwork; the name is set in the app's own typography, because a real
 * business's name must never be misspelled by a picture of it.
 */
async function storeSponsorMark(
  promoterId: string,
  sponsorId: string,
  file: FormDataEntryValue | null,
): Promise<ActionResult<{ key: string | null }>> {
  if (!(file instanceof File) || file.size === 0) return done({ key: null });
  if (file.size > MAX_MARK_BYTES) return refuse(ACTION_ERRORS.markTooLarge);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return refuse(ACTION_ERRORS.markNotAnImage);

  const suffix = crypto.randomUUID().slice(0, 8);
  const key = `sponsors/${promoterId}/${sponsorId}-${suffix}.${IMAGE_EXTENSION[contentType]}`;

  try {
    const media = await getMedia();
    await media.put(key, bytes, { httpMetadata: { contentType } });
  } catch (error) {
    logError({ event: "storeSponsorMark", route: `/promoter/e/${sponsorId}` }, error);
    return refuse(ACTION_ERRORS.markNotStored);
  }

  return done({ key });
}

/**
 * Drops an emblem nothing points at any more.
 *
 * After the column, never before, so a delete that will not go through leaves an
 * object in the bucket that nothing reads rather than a row pointing at an
 * object that is gone — one of those is invisible and the other is a broken
 * picture on a card. Swallowed for the same reason: the change the promoter
 * asked for has already happened.
 */
async function dropSponsorMark(key: string | null): Promise<void> {
  if (!key) return;
  await (await getMedia()).delete(key).catch(() => {});
}

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
      const mark = await storeSponsorMark(promoter.id, id, form.get("mark"));
      if (!mark.ok) return mark;

      await db.insert(schema.sponsors).values({
        id,
        promoterId: promoter.id,
        name,
        qualifier: text(form, "qualifier", 60) || null,
        // assets-src/ is not in the repository, so for a sponsor a promoter adds
        // themselves this upload is the only artwork there will ever be.
        markKey: mark.key,
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

/**
 * Puts a different emblem on a sponsor that already exists.
 *
 * The new object goes in first and the old one comes out last, so a bucket that
 * will not take the replacement leaves the sponsor with the artwork it had. In
 * between, the column moves to a key nobody has used before, which is what stops
 * a year of immutable caching serving the old emblem to half the people reading
 * the card.
 */
export async function replaceSponsorMark(
  slug: string,
  sponsorId: string,
  form: FormData,
): Promise<ActionResult> {
  return attempt(
    { event: "replaceSponsorMark", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { promoter, event } = owned;

      const sponsor = await ownedSponsor(db, promoter.id, sponsorId);
      if (!sponsor.ok) return sponsor;

      const mark = await storeSponsorMark(promoter.id, sponsorId, form.get("mark"));
      if (!mark.ok) return mark;
      // Nothing was sent. A file input that came back empty is a form submitted
      // by accident, not an instruction to take the artwork off — that is what
      // removeSponsorMark is for, and it says so on the control.
      if (!mark.key) return refuse(ACTION_ERRORS.markNotAnImage);

      await db
        .update(schema.sponsors)
        .set({ markKey: mark.key })
        .where(eq(schema.sponsors.id, sponsorId));

      await dropSponsorMark(sponsor.markKey);
      await afterMarkChanged(db, slug, event.id, "replaceSponsorMark");
      return DONE;
    },
  );
}

/**
 * Takes the emblem off a sponsor and drops the object behind it.
 *
 * The sponsor stays, with its name set in the programme's own type, which is
 * what the lockup falls back to and is a state the card is designed for rather
 * than a gap. The curated artwork under public/sponsors is not touched by this:
 * only `mark_key` is cleared, so a seeded sponsor keeps the mark it came with.
 */
export async function removeSponsorMark(slug: string, sponsorId: string): Promise<ActionResult> {
  return attempt(
    { event: "removeSponsorMark", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { promoter, event } = owned;

      const sponsor = await ownedSponsor(db, promoter.id, sponsorId);
      if (!sponsor.ok) return sponsor;

      await db
        .update(schema.sponsors)
        .set({ markKey: null })
        .where(eq(schema.sponsors.id, sponsorId));

      await dropSponsorMark(sponsor.markKey);
      await afterMarkChanged(db, slug, event.id, "removeSponsorMark");
      return DONE;
    },
  );
}

/**
 * What both of the above owe the rest of the product.
 *
 * The emblem is in the render fingerprint through `sponsorMark`, because the
 * tape draws the resolved mark — so every bout this sponsor appears in is now
 * showing artwork the card no longer carries, and nothing else would say so. The
 * whole card is asked for rather than the bouts this sponsor holds: the
 * fingerprint tells the others apart for nothing, and a sponsor sits on a
 * fighter's reveal as well as on a bout's closing card.
 */
async function afterMarkChanged(
  db: Db,
  slug: string,
  eventId: string,
  event: string,
): Promise<void> {
  await requestRenderQuietly(db, eventId, "all", { event, route: `/promoter/e/${slug}/card` });

  revalidatePath(`/promoter/e/${slug}`);
  revalidatePath(`/promoter/e/${slug}/card`);
  revalidatePath(`/e/${slug}`);
}
