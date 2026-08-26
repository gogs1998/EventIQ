"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "@/db/schema";
import { getDb, getMedia, type Db } from "@/lib/db";
import { loadInviteByToken } from "@/lib/db/queries";
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-type";
import { allowedSponsorIds, num, sanitiseDraft, type Draft } from "@/lib/questionnaire";

/**
 * Everything a fighter can do with their invite.
 *
 * The token is the whole of the authorisation, so it is re-read from the
 * database on every call rather than trusted from a form field, and nothing here
 * takes a fighter id from the caller. A fighter holding a link can edit exactly
 * one profile: theirs.
 */

async function inviteOr404(token: string) {
  const db = await getDb();
  const row = await loadInviteByToken(db, token);
  if (!row) throw new Error("Unknown invite");
  return { db, ...row };
}

/** Columns written from a draft. Kept in one place so save and submit agree. */
function columnsFrom(draft: Draft) {
  const w = num(draft.w);
  const l = num(draft.l);
  const d = num(draft.d);
  const ko = num(draft.ko);
  const sub = num(draft.sub);
  const hasRecord = w !== undefined || l !== undefined || d !== undefined;

  return {
    nickname: draft.nickname || null,
    instagram: draft.instagram || null,
    photo: draft.photo ?? null,
    cutout: draft.cutout ?? null,
    bio: draft.bio || null,
    hometown: draft.hometown || null,
    age: num(draft.age) ?? null,
    heightCm: num(draft.heightCm) ?? null,
    reachCm: num(draft.reachCm) ?? null,
    stance: draft.stance || null,
    // All three or none, so a fighter who has answered nothing is never stored
    // as 0-0-0 and later read back as a debutant.
    recordW: hasRecord ? (w ?? 0) : null,
    recordL: hasRecord ? (l ?? 0) : null,
    recordD: hasRecord ? (d ?? 0) : null,
    finishKo: ko !== undefined || sub !== undefined ? (ko ?? 0) : null,
    finishSub: ko !== undefined || sub !== undefined ? (sub ?? 0) : null,
    walkoutTitle: draft.walkoutTitle || null,
    walkoutArtist: draft.walkoutArtist || null,
    styleTags: draft.styleTags.length ? JSON.stringify(draft.styleTags) : null,
    updatedAt: Date.now(),
  };
}

/**
 * Saves a draft, all of it or none of it.
 *
 * Sponsors are a join table, so they are replaced wholesale: there are at most a
 * handful and working out a diff would be more code than it saves. Written as
 * separate statements that meant a payload naming a sponsor that does not exist
 * deleted the fighter's real sponsors, then failed the foreign key on the insert,
 * and left the profile saved with an empty sponsor row. So the whole save is one
 * db.batch, which D1 runs as a single transaction, and the ids are checked
 * against the promoter's own book before any of it is written.
 */
export async function saveDraft(token: string, input: unknown): Promise<{ savedAt: number }> {
  const { db, invite, fighter, event } = await inviteOr404(token);
  const draft = sanitiseDraft(input);
  const sponsorIds = await claimableSponsors(db, event.promoterId, draft.sponsorIds);

  const writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    db.update(schema.fighters).set(columnsFrom(draft)).where(eq(schema.fighters.id, fighter.id)),
    db.delete(schema.fighterSponsors).where(eq(schema.fighterSponsors.fighterId, fighter.id)),
  ];

  if (sponsorIds.length) {
    writes.push(
      db.insert(schema.fighterSponsors).values(
        sponsorIds.map((sponsorId, position) => ({
          fighterId: fighter.id,
          sponsorId,
          position,
        })),
      ),
    );
  }

  // A submitted profile that is edited again stays submitted. Reopening it to
  // change a walkout song does not put the fighter back on the chase list.
  if (!invite.lastOpenedAt) {
    writes.push(
      db
        .update(schema.invites)
        .set({ lastOpenedAt: Date.now() })
        .where(eq(schema.invites.id, invite.id)),
    );
  }

  await db.batch(writes);

  return { savedAt: Date.now() };
}

/**
 * Which of the requested sponsor ids the fighter is entitled to place.
 *
 * Rows that exist and belong to the promoter running this show, which is the
 * same set the questionnaire offers. Checking it here rather than letting the
 * foreign key do it is what turns an impossible payload into nothing happening
 * instead of into a half-written profile.
 */
async function claimableSponsors(
  db: Db,
  promoterId: string,
  requested: string[],
): Promise<string[]> {
  if (!requested.length) return [];

  const rows = await db
    .select({ id: schema.sponsors.id })
    .from(schema.sponsors)
    .where(
      and(eq(schema.sponsors.promoterId, promoterId), inArray(schema.sponsors.id, requested)),
    );

  return allowedSponsorIds(
    requested,
    rows.map((row) => row.id),
  );
}

export async function submitProfile(token: string, input: unknown): Promise<void> {
  const { db, invite, event } = await inviteOr404(token);
  await saveDraft(token, input);
  await db
    .update(schema.invites)
    .set({ submittedAt: Date.now() })
    .where(eq(schema.invites.id, invite.id));

  revalidatePath(`/e/${event.slug}`);
}

/**
 * Records that the fighter opened their link.
 *
 * This is the promoter's warmest signal — "he looked at it and bailed" is a
 * different conversation from "he never saw it" — so it is written on the way in
 * rather than inferred later from how full the profile looks.
 */
export async function markOpened(token: string): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.invites)
    .set({ lastOpenedAt: Date.now() })
    .where(eq(schema.invites.token, token));
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/**
 * Stores a photograph and returns the path to put on the fighter.
 *
 * The browser has already downscaled this to 1000px and re-encoded it as JPEG,
 * which is what keeps the upload small enough to work on a phone in a car park.
 * The size check here is the backstop for a caller that did not.
 *
 * **The bytes decide what this is, never the declared type.** Anything reaching
 * here can have been sent directly to the action, so the browser's re-encode is
 * not a control and `file.type` is only a claim. The object is stored under the
 * type detected from its own first few bytes, because /media serves it back at
 * our own origin: an SVG stored as image/svg+xml would be a document with our
 * origin's privileges, which is a stored cross-site scripting hole for anybody
 * holding an invite link. See lib/image-type.ts.
 *
 * The key carries a random suffix so a replaced photo gets a new URL. Photos are
 * served with a one-year cache, and without that suffix a fighter who changed
 * their picture would keep seeing the old one until the cache gave up.
 */
export async function uploadPhoto(token: string, form: FormData): Promise<{ path: string }> {
  const { fighter } = await inviteOr404(token);

  const file = form.get("photo");
  if (!(file instanceof File)) throw new Error("No photo");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo too large");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error("That file is not a JPEG, PNG or WebP photograph");

  const suffix = crypto.randomUUID().slice(0, 8);
  const key = `fighters/${fighter.id}-${suffix}.${IMAGE_EXTENSION[contentType]}`;

  const media = await getMedia();
  await media.put(key, bytes, { httpMetadata: { contentType } });

  return { path: `/media/${key}` };
}
