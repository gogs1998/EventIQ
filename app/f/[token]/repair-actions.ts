"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { collect, toBase64 } from "@/lib/ai-image";
import { flagOn, hasConsented } from "@/lib/consent";
import { ACTION_ERRORS } from "@/lib/copy";
import { getAi, getMedia, readVar } from "@/lib/db";
import { inviteFor } from "@/lib/db/owned";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-type";
import { cutoutQualityFrom, photoCouldBeBetter } from "@/lib/photo-quality";
import { mediaKeyOf, ownMediaKeyOf, tidiedBelongsTo, tidiedKey } from "@/lib/portrait";

/**
 * The opt-in tidied photograph, for a fighter whose photo would not cut out.
 *
 * The same shape as the stylised portrait in portrait-actions.ts, deliberately
 * and line for line, because that shape is what makes a model touching a
 * fighter's photograph acceptable at all:
 *
 * - **Nothing happens unless they ask.** Its own flag, `AI_PHOTO_REPAIR`, off by
 *   default; its own consent line, separate from the form's; and only offered
 *   where the renderer judged the cutout poor (lib/photo-quality.ts). A fighter
 *   whose photograph works is never offered an edited one.
 * - **Nothing reaches the card until they approve it.** The object is stored
 *   when it is made but no row points at it, so /media refuses it and the
 *   preview comes back inline.
 * - **The original is kept.** `photo` is never written here. The tidied copy has
 *   its own column, and discarding it goes straight back to what they sent.
 * - **It is never presented as untouched.** The copy calls it a tidied copy
 *   throughout, and the card labels it.
 * - **The bytes decide what came back**, exactly as for an upload.
 *
 * The prompt is conservative on purpose: light and background, nothing about
 * the person. The strength is low so the model has little room to move a face,
 * and the negative prompt names the changes that would matter most — a
 * different face, a different build, a different skin tone. That is a request
 * to a model rather than a guarantee, which is why the fighter looks at the
 * result before anything else does.
 *
 * As with the portrait, there is no AI binding under `next dev`, so locally this
 * answers "not available here" and has not been run against the real model.
 */

const TIDY_MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";

/** Fixed. Nothing a caller sends reaches the model as text. */
const TIDY_PROMPT =
  "the same person in the same photograph, same face, same expression, same hair, same body, " +
  "same skin tone, same clothes, natural realistic photograph, soft even front lighting, " +
  "plain light grey wall behind, sharp focus, true colour";

const TIDY_NEGATIVE =
  "different person, changed face, changed features, skin lightening, skin darkening, " +
  "slimmer, more muscular, reshaped body, makeup, beauty filter, illustration, painting, " +
  "cartoon, extra people, extra limbs, text, letters, watermark, logo, blurry, deformed";

/**
 * How far the copy may move from the photograph. Low: enough to even out light
 * and soften a cluttered background, not enough to redraw a face. The stylised
 * portrait uses 0.55 because it is meant to be unmistakably a drawing.
 */
const TIDY_STRENGTH = 0.22;

const TIDY_WIDTH = 512;
const TIDY_HEIGHT = 768;

/** The same ceiling the upload has. */
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

async function offered(): Promise<boolean> {
  return flagOn(await readVar("AI_PHOTO_REPAIR")) && !!(await getAi());
}

/** Read by the page, so an instance without it draws no control at all. */
export async function photoRepairOffered(): Promise<boolean> {
  return offered();
}

/**
 * Makes a tidied copy, stores it unattached, and hands back a preview.
 *
 * From `photo`, always: the photograph the fighter sent, never an earlier tidied
 * copy of it, so trying again does not compound one model's guesses on another's.
 */
export async function makeTidiedPhoto(
  token: string,
): Promise<ActionResult<{ path: string; preview: string }>> {
  return attempt(
    { event: "makeTidiedPhoto", route: "/f/[token]" },
    ACTION_ERRORS.tidyNotMade,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { fighter, invite } = found.row;

      if (!hasConsented(invite)) return refuse(ACTION_ERRORS.consentNeeded);

      const ai = (await offered()) ? await getAi() : undefined;
      if (!ai) return refuse(ACTION_ERRORS.tidyNotHere);

      // Only where the cutout of what they sent came out poor. A fighter whose
      // photograph works is never offered an edited copy of it.
      const judged = {
        cutout: fighter.cutout ?? undefined,
        cutoutQuality: cutoutQualityFrom(fighter.cutoutQuality),
        stylised: fighter.stylised ?? undefined,
      };
      if (fighter.tidied || !photoCouldBeBetter(judged)) {
        return refuse(ACTION_ERRORS.tidyNotNeeded);
      }

      // The fighter's own photograph in the bucket, and nothing a row merely
      // names (bug 51).
      const sourceKey = ownMediaKeyOf(fighter.photo, fighter.id);
      if (!sourceKey || !sourceKey.startsWith("fighters/")) return refuse(ACTION_ERRORS.tidyNotNeeded);

      const media = await getMedia();
      const object = await media.get(sourceKey);
      if (!object) return refuse(ACTION_ERRORS.tidyNotNeeded);
      const source = new Uint8Array(await object.arrayBuffer());
      if (!source.length || source.length > MAX_SOURCE_BYTES) return refuse(ACTION_ERRORS.tidyNotMade);

      const output = await ai.run(TIDY_MODEL, {
        prompt: TIDY_PROMPT,
        negative_prompt: TIDY_NEGATIVE,
        image_b64: toBase64(source),
        strength: TIDY_STRENGTH,
        width: TIDY_WIDTH,
        height: TIDY_HEIGHT,
      });

      const tidied = await collect(output);
      const contentType = sniffImageType(tidied);
      if (!contentType) return refuse(ACTION_ERRORS.tidyNotMade);

      const suffix = crypto.randomUUID().slice(0, 8);
      const key = tidiedKey(fighter.id, suffix, IMAGE_EXTENSION[contentType]);
      await media.put(key, tidied, { httpMetadata: { contentType } });

      return done({
        path: `/media/${key}`,
        preview: `data:${contentType};base64,${toBase64(tidied)}`,
      });
    },
  );
}

/**
 * Puts an approved tidied copy on the card.
 *
 * The cutout and its verdict go, because they were made from the photograph
 * this now stands in for: the renderer cuts the tidied copy out next time
 * round (`cutoutSourceOf`) and judges that instead. `updatedAt` moves, so the
 * bout's video is stale until it has.
 */
export async function approveTidiedPhoto(token: string, path: string): Promise<ActionResult> {
  return attempt(
    { event: "approveTidiedPhoto", route: "/f/[token]" },
    ACTION_ERRORS.tidyNotMade,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { db, row } = found;
      const { fighter, invite, event } = row;

      if (!hasConsented(invite)) return refuse(ACTION_ERRORS.consentNeeded);
      if (!tidiedBelongsTo(path, fighter.id)) return refuse(ACTION_ERRORS.tidyNotFound);

      const key = mediaKeyOf(path);
      const media = await getMedia();
      if (!key || !(await media.head(key))) return refuse(ACTION_ERRORS.tidyNotFound);

      const superseded = [fighter.cutout, fighter.tidied]
        .map((old) => ownMediaKeyOf(old, fighter.id))
        .filter((old): old is string => old !== null && old !== key);

      await db
        .update(schema.fighters)
        .set({ tidied: path, cutout: null, cutoutQuality: null, cutoutIssues: null, updatedAt: Date.now() })
        .where(eq(schema.fighters.id, fighter.id));

      for (const old of superseded) await media.delete(old).catch(() => {});

      await requestRenderQuietly(db, event.id, "all", {
        event: "approveTidiedPhoto",
        route: "/f/[token]",
        fighterId: fighter.id,
      });
      revalidatePath(`/e/${event.slug}`);
      return DONE;
    },
  );
}

/**
 * Throws one away: a preview nobody wanted, or an approved copy the fighter has
 * changed their mind about. Going back to the photograph they sent has to be as
 * easy as the opt-in was, and the column is only cleared where it is this path.
 */
export async function discardTidiedPhoto(token: string, path: string): Promise<ActionResult> {
  return attempt(
    { event: "discardTidiedPhoto", route: "/f/[token]" },
    ACTION_ERRORS.tidyNotMade,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { db, row } = found;
      const { fighter, event } = row;

      if (!tidiedBelongsTo(path, fighter.id)) return refuse(ACTION_ERRORS.tidyNotFound);

      const media = await getMedia();
      if (fighter.tidied === path) {
        // The cutout was made from the tidied copy, so it goes too and the
        // renderer cuts the original out again.
        const cutoutKey = ownMediaKeyOf(fighter.cutout, fighter.id);
        await db
          .update(schema.fighters)
          .set({ tidied: null, cutout: null, cutoutQuality: null, cutoutIssues: null, updatedAt: Date.now() })
          .where(eq(schema.fighters.id, fighter.id));
        if (cutoutKey) await media.delete(cutoutKey).catch(() => {});

        await requestRenderQuietly(db, event.id, "all", {
          event: "discardTidiedPhoto",
          route: "/f/[token]",
          fighterId: fighter.id,
        });
        revalidatePath(`/e/${event.slug}`);
      }

      const key = mediaKeyOf(path);
      if (key) await media.delete(key).catch(() => {});
      return DONE;
    },
  );
}
