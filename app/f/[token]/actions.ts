"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { isLinkPreviewBot } from "@/lib/bots";
import { ACTION_ERRORS } from "@/lib/copy";
import { getDb, getMedia, type Db } from "@/lib/db";
import { loadInviteByToken } from "@/lib/db/queries";
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-type";
import { cutoutSurvives } from "@/lib/portrait";
import { allowedSponsorIds, num, sanitiseDraft, type Draft } from "@/lib/questionnaire";

/**
 * Everything a fighter can do with their invite.
 *
 * The token is the whole of the authorisation, so it is re-read from the
 * database on every call rather than trusted from a form field, and nothing here
 * takes a fighter id from the caller. A fighter holding a link can edit exactly
 * one profile: theirs.
 *
 * These answer with an `ActionResult` rather than throwing, because the fighter
 * filling this in is standing in a car park on one bar of signal and the form
 * has to be able to say what happened next to the control they just used. A
 * regenerated link, a photograph that would not go, a save that did not land —
 * all of them are sentences now, and the stack goes to the log.
 */

type Invite = Awaited<ReturnType<typeof loadInviteByToken>>;

type Found = { db: Db; row: NonNullable<Invite> };

async function inviteFor(token: string): Promise<ActionResult<Found>> {
  const db = await getDb();
  const row = await loadInviteByToken(db, token);
  // A regenerated link and a made-up one answer the same way, which is also the
  // only true thing that can be said to somebody holding either.
  if (!row) return refuse(ACTION_ERRORS.unknownInvite);
  return done({ db, row });
}

/**
 * Columns written from a draft. Kept in one place so save and submit agree.
 *
 * `cutout` is deliberately absent. Nothing a fighter types produces a cutout —
 * the renderer makes it from the photograph on a machine that has the model, and
 * putting it in the form's column set meant every autosave wrote back whatever
 * the browser happened to be holding, which for a cutout is nothing. Leaving the
 * column out of the update leaves the stored value alone; `saveDraft` clears it
 * in the one case where it has to.
 */
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
 *
 * A refusal from here is never destructive: the batch either lands or does not,
 * and the questionnaire keeps the typing in the boxes either way.
 */
export async function saveDraft(
  token: string,
  input: unknown,
): Promise<ActionResult<{ savedAt: number }>> {
  return attempt(
    { event: "saveDraft", route: "/f/[token]" },
    ACTION_ERRORS.profileNotSaved,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { db, row } = found;
      const { invite, fighter, event } = row;

      const draft = sanitiseDraft(input);
      const sponsorIds = await claimableSponsors(db, event.promoterId, draft.sponsorIds);

      // Everything else about the cutout is the renderer's, but this is the one thing
      // only the request path knows: that the photograph the cutout was made from has
      // just been replaced. Left in place it would put the fighter's old picture in
      // the video for as long as nobody noticed.
      const columns = cutoutSurvives(fighter.photo, draft.photo)
        ? columnsFrom(draft)
        : { ...columnsFrom(draft), cutout: null };

      const writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        db.update(schema.fighters).set(columns).where(eq(schema.fighters.id, fighter.id)),
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

      return done({ savedAt: Date.now() });
    },
  );
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

export async function submitProfile(token: string, input: unknown): Promise<ActionResult> {
  return attempt(
    { event: "submitProfile", route: "/f/[token]" },
    ACTION_ERRORS.profileNotSubmitted,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { db, row } = found;

      // The save is what carries the answers, so a submit that goes through on a
      // save that did not would mark the profile finished with the last few
      // fields missing from it.
      const saved = await saveDraft(token, input);
      if (!saved.ok) return saved;

      await db
        .update(schema.invites)
        .set({ submittedAt: Date.now() })
        .where(eq(schema.invites.id, row.invite.id));

      revalidatePath(`/e/${row.event.slug}`);
      return DONE;
    },
  );
}

/**
 * Records that the fighter opened their link.
 *
 * This is the promoter's warmest signal — "he looked at it and bailed" is a
 * different conversation from "he never saw it" — so it is written on the way in
 * rather than inferred later from how full the profile looks.
 *
 * The page awaits this before rendering, so it must not be able to take the
 * questionnaire down with it: a timestamp nobody can write is a worse chase
 * list, and a form that will not open is a fighter who never fills it in. The
 * result is there for a caller that wants it and the page ignores it.
 *
 * Which is exactly why the unfurler has to be left out. An invite pasted into a
 * group chat is fetched by WhatsApp before anybody has read the message, and a
 * timestamp written for that says a fighter looked at their form when nobody
 * has. See lib/bots.ts for which way the guess is made to fall.
 */
export async function markOpened(token: string): Promise<ActionResult> {
  if (isLinkPreviewBot((await headers()).get("user-agent"))) return DONE;

  return attempt({ event: "markOpened", route: "/f/[token]" }, ACTION_ERRORS.notSaved, async () => {
    const db = await getDb();
    await db
      .update(schema.invites)
      .set({ lastOpenedAt: Date.now() })
      .where(eq(schema.invites.token, token));
    return DONE;
  });
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
 *
 * The three refusals below are separate sentences because they have separate
 * answers: a different file, a smaller one, or nothing the fighter can do. R2
 * being unavailable is the third and comes back as the general one.
 */
export async function uploadPhoto(
  token: string,
  form: FormData,
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    { event: "uploadPhoto", route: "/f/[token]" },
    ACTION_ERRORS.photoNotStored,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { fighter } = found.row;

      const file = form.get("photo");
      if (!(file instanceof File)) return refuse(ACTION_ERRORS.photoNotAPhotograph);
      if (file.size > MAX_PHOTO_BYTES) return refuse(ACTION_ERRORS.photoTooLarge);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentType = sniffImageType(bytes);
      if (!contentType) return refuse(ACTION_ERRORS.photoNotAPhotograph);

      const suffix = crypto.randomUUID().slice(0, 8);
      const key = `fighters/${fighter.id}-${suffix}.${IMAGE_EXTENSION[contentType]}`;

      const media = await getMedia();
      await media.put(key, bytes, { httpMetadata: { contentType } });

      return done({ path: `/media/${key}` });
    },
  );
}
