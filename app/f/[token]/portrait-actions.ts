"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { flagOn, hasConsented } from "@/lib/consent";
import { ACTION_ERRORS } from "@/lib/copy";
import { getAi, getDb, getMedia, readVar } from "@/lib/db";
import { loadInviteByToken } from "@/lib/db/queries";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-type";
import { mediaKeyOf, stylisedBelongsTo, stylisedKey } from "@/lib/portrait";

/**
 * The opt-in stylised portrait.
 *
 * Three rules run through all of this and none of them are negotiable.
 *
 * **A real photograph is the default.** Nothing here happens unless a fighter
 * asked for it, and nothing here reaches the programme until they have seen the
 * result and pressed approve. A fighter who sends a picture and says nothing
 * gets their picture, exactly as before.
 *
 * **It is never presented as a likeness.** The prompt asks for poster artwork
 * and forbids lettering, and every line of copy around it says drawing rather
 * than photograph. The lettering matters twice over: image generators misspell
 * text, and a sponsor's name is set in the app's own typography precisely so a
 * real business can never be misspelled by a model.
 *
 * **The bytes decide what came back.** The model's output is sniffed before it
 * is stored, for the same reason an upload is (HANDOVER section 6b). A content
 * type from anywhere but the bytes is a claim, and /media serves this object
 * back at our own origin.
 *
 * The model is `@cf/runwayml/stable-diffusion-v1-5-img2img`, which is the
 * image-to-image model Workers AI hosts. There is no AI binding under `next
 * dev`, so locally this answers "not available here" and the pure parts —
 * the key shape and the ownership check in lib/portrait.ts — are what the tests
 * cover.
 */

const STYLISED_MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";

/**
 * Fixed, and not built from anything a caller sends. A prompt with a fighter's
 * own words in it would be a text field going to a model, which is a different
 * feature with different problems.
 */
const STYLISED_PROMPT =
  "bold graphic fight poster portrait illustration, flat cel shading, heavy ink outlines, " +
  "limited palette of deep charcoal, bone white and one warm accent, dramatic single key " +
  "light, plain dark background, head and shoulders, facing the viewer";

/** Lettering above all: a model's spelling must never end up beside a sponsor's. */
const STYLISED_NEGATIVE =
  "text, letters, words, caption, watermark, signature, logo, extra people, extra limbs, " +
  "deformed face, blurry";

/**
 * How far the drawing may travel from the photograph.
 *
 * Low enough that the pose, the build and the framing are still the fighter's,
 * high enough that nobody could mistake the result for a photograph of them.
 * Both halves of that are the point.
 */
const STYLISED_STRENGTH = 0.55;

/** Portrait, to match the frame the sequence gives it. SD1.5 is happiest near this size. */
const STYLISED_WIDTH = 512;
const STYLISED_HEIGHT = 768;

/** The same ceiling the upload has. A model input is not the place to relax it. */
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

async function inviteFor(token: string) {
  const db = await getDb();
  const row = await loadInviteByToken(db, token);
  return row ? { db, row } : null;
}

/** Off unless a deployment turned it on and there is a model to reach. */
async function offered(): Promise<boolean> {
  return flagOn(await readVar("STYLISED_PORTRAITS")) && !!(await getAi());
}

/**
 * Whether the questionnaire should offer this at all.
 *
 * Read by the page rather than guessed by the browser, so an instance with no
 * binding shows no control instead of a button that always refuses.
 */
export async function stylisedPortraitsOffered(): Promise<boolean> {
  return offered();
}

/**
 * The whole of a byte stream.
 *
 * Read through a reader rather than handed to `new Response(...)`, because the
 * Workers stream type and the DOM one this app also compiles against are not the
 * same declaration and will not assign to each other. The shape below is all
 * either of them needs to satisfy.
 */
async function collect(stream: {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
}): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** Base64 without blowing the stack on a few hundred kilobytes at a time. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/**
 * Draws one, stores it, and hands back a preview.
 *
 * The object goes into the bucket immediately but no row points at it, so
 * /media will not serve it and nothing on any card can reach it — the preview
 * comes back inline instead. That is what makes "approve or discard" real: until
 * approve writes the column, the drawing exists nowhere anybody can see it but
 * the fighter who asked for it.
 */
export async function makeStylisedPortrait(
  token: string,
): Promise<ActionResult<{ path: string; preview: string }>> {
  return attempt(
    { event: "makeStylisedPortrait", route: "/f/[token]" },
    ACTION_ERRORS.portraitNotMade,
    async () => {
      const found = await inviteFor(token);
      if (!found) return refuse(ACTION_ERRORS.unknownInvite);
      const { fighter, invite } = found.row;

      if (!hasConsented(invite)) return refuse(ACTION_ERRORS.consentNeeded);

      const ai = (await offered()) ? await getAi() : undefined;
      if (!ai) return refuse(ACTION_ERRORS.portraitNotHere);

      // Only a photograph in the bucket. The seeded card's pictures are static
      // assets rather than objects, and there is nothing here to read them with.
      const sourceKey = mediaKeyOf(fighter.photo);
      if (!sourceKey) return refuse(ACTION_ERRORS.portraitNeedsPhoto);

      const media = await getMedia();
      const object = await media.get(sourceKey);
      if (!object) return refuse(ACTION_ERRORS.portraitNeedsPhoto);
      const source = new Uint8Array(await object.arrayBuffer());
      if (!source.length || source.length > MAX_SOURCE_BYTES) {
        return refuse(ACTION_ERRORS.portraitNeedsPhoto);
      }

      const output = await ai.run(STYLISED_MODEL, {
        prompt: STYLISED_PROMPT,
        negative_prompt: STYLISED_NEGATIVE,
        image_b64: toBase64(source),
        strength: STYLISED_STRENGTH,
        width: STYLISED_WIDTH,
        height: STYLISED_HEIGHT,
      });

      const drawn = await collect(output);
      const contentType = sniffImageType(drawn);
      // Whatever a model hands back is bytes from outside, and this one is
      // stored and served from our own origin. Anything but a picture is refused.
      if (!contentType) return refuse(ACTION_ERRORS.portraitNotMade);

      const suffix = crypto.randomUUID().slice(0, 8);
      const key = stylisedKey(fighter.id, suffix, IMAGE_EXTENSION[contentType]);
      await media.put(key, drawn, { httpMetadata: { contentType } });

      // Nothing published yet: the row is untouched, and the fighter sees this
      // inline rather than through /media, which would refuse it.
      return done({
        path: `/media/${key}`,
        preview: `data:${contentType};base64,${toBase64(drawn)}`,
      });
    },
  );
}

/**
 * Puts an approved drawing on the card.
 *
 * The path comes back from the browser, so it is checked against this fighter
 * rather than believed, and the object has to actually be in the bucket: a
 * column pointing at nothing would show a broken image in a video.
 *
 * `updatedAt` moves with it, which is what makes the bout's render stale — the
 * fingerprint in lib/renders.ts already reads that column, so the portrait
 * reaches the video without a new field in the hash.
 */
export async function approveStylisedPortrait(
  token: string,
  path: string,
): Promise<ActionResult> {
  return attempt(
    { event: "approveStylisedPortrait", route: "/f/[token]" },
    ACTION_ERRORS.portraitNotMade,
    async () => {
      const found = await inviteFor(token);
      if (!found) return refuse(ACTION_ERRORS.unknownInvite);
      const { db, row } = found;
      const { fighter, invite, event } = row;

      if (!hasConsented(invite)) return refuse(ACTION_ERRORS.consentNeeded);
      if (!stylisedBelongsTo(path, fighter.id)) return refuse(ACTION_ERRORS.portraitNotFound);

      const key = mediaKeyOf(path);
      const media = await getMedia();
      if (!key || !(await media.head(key))) return refuse(ACTION_ERRORS.portraitNotFound);

      await db
        .update(schema.fighters)
        .set({ stylised: path, updatedAt: Date.now() })
        .where(eq(schema.fighters.id, fighter.id));

      await requestRenderQuietly(db, event.id, "all", {
        event: "approveStylisedPortrait",
        route: "/f/[token]",
        fighterId: fighter.id,
      });

      revalidatePath(`/e/${event.slug}`);
      return DONE;
    },
  );
}

/**
 * Throws one away.
 *
 * Reachable from the preview and from an approved one, because "go back to my
 * photograph" has to be as easy as the opt-in was. The column is only cleared
 * where it is this path, so discarding an old preview cannot take an approved
 * portrait off the card.
 */
export async function discardStylisedPortrait(
  token: string,
  path: string,
): Promise<ActionResult> {
  return attempt(
    { event: "discardStylisedPortrait", route: "/f/[token]" },
    ACTION_ERRORS.portraitNotMade,
    async () => {
      const found = await inviteFor(token);
      if (!found) return refuse(ACTION_ERRORS.unknownInvite);
      const { db, row } = found;
      const { fighter, event } = row;

      if (!stylisedBelongsTo(path, fighter.id)) return refuse(ACTION_ERRORS.portraitNotFound);

      if (fighter.stylised === path) {
        await db
          .update(schema.fighters)
          .set({ stylised: null, updatedAt: Date.now() })
          .where(eq(schema.fighters.id, fighter.id));

        await requestRenderQuietly(db, event.id, "all", {
          event: "discardStylisedPortrait",
          route: "/f/[token]",
          fighterId: fighter.id,
        });
        revalidatePath(`/e/${event.slug}`);
      }

      const key = mediaKeyOf(path);
      // After the column, so a delete that fails leaves an object nothing points
      // at rather than a card pointing at an object that is gone.
      if (key) await (await getMedia()).delete(key).catch(() => {});

      return DONE;
    },
  );
}
