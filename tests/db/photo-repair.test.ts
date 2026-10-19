import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { uploadPhoto } from "@/app/f/[token]/actions";
import { removeMyDetails } from "@/app/f/[token]/consent-actions";
import {
  approveTidiedPhoto,
  discardTidiedPhoto,
  makeTidiedPhoto,
  photoRepairOffered,
} from "@/app/f/[token]/repair-actions";
import { CONSENT_VERSION } from "@/lib/consent";
import { ACTION_ERRORS } from "@/lib/copy";
import { plantPromoters, plantShow, type PlantedShow } from "./fixtures";
import { testDatabase } from "./harness";

/**
 * The tidied photograph, from the outside: the same approve-or-discard shape as
 * the stylised portrait, and the original photograph never touched.
 *
 * There is no AI binding here — nor under `next dev` — so the making of one is
 * covered only as far as being refused; what is asserted is what approve and
 * discard leave on the row and in the bucket.
 */

const platform = testDatabase();

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

async function poorShow(): Promise<{ show: PlantedShow; me: string; other: string }> {
  const db = platform().db;
  await plantPromoters(db, [{ id: "pr_cage", name: "Cage County" }]);
  const show = await plantShow(db, { promoterId: "pr_cage", slug: "cage-county-12", published: true });
  const [me, other] = show.fighterIds;
  await db
    .update(schema.invites)
    .set({ consentedAt: Date.now(), consentVersion: CONSENT_VERSION })
    .where(eq(schema.invites.fighterId, me));
  await platform().media.put(`fighters/${me}-a1b2c3d4.jpg`, JPEG);
  await platform().media.put(`cutouts/${me}-e5f6a7b8.webp`, PNG);
  await db
    .update(schema.fighters)
    .set({
      photo: `/media/fighters/${me}-a1b2c3d4.jpg`,
      cutout: `/media/cutouts/${me}-e5f6a7b8.webp`,
      cutoutQuality: "poor",
      cutoutIssues: '["multiple-people"]',
    })
    .where(eq(schema.fighters.id, me));
  return { show, me, other };
}

async function fighter(id: string) {
  const [row] = await platform().db.select().from(schema.fighters).where(eq(schema.fighters.id, id));
  return row;
}

const exists = async (key: string) => (await platform().media.head(key)) !== null;

describe("the tidied photograph", () => {
  it("is not offered, and not made, where the deployment has not switched it on", async () => {
    const { show, me } = await poorShow();
    expect(await photoRepairOffered()).toBe(false);
    const made = await makeTidiedPhoto(show.tokens[me]);
    expect(made).toEqual({ ok: false, error: ACTION_ERRORS.tidyNotHere });
  });

  it("goes on the card only by approval, and keeps the photograph that was sent", async () => {
    const { show, me } = await poorShow();
    const before = await fighter(me);
    const key = `tidied/${me}-0a1b2c3d.png`;
    await platform().media.put(key, PNG);

    expect((await approveTidiedPhoto(show.tokens[me], `/media/${key}`)).ok).toBe(true);
    const after = await fighter(me);
    expect(after.tidied).toBe(`/media/${key}`);
    expect(after.photo).toBe(before.photo);
    // The poor cutout was of the photograph this now stands in for.
    expect(after.cutout).toBeNull();
    expect(after.cutoutQuality).toBeNull();
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    expect(await exists(`cutouts/${me}-e5f6a7b8.webp`)).toBe(false);
    expect(await exists(`fighters/${me}-a1b2c3d4.jpg`)).toBe(true);
  });

  it("cannot approve a picture of somebody else, or one that is not there", async () => {
    const { show, me, other } = await poorShow();
    const theirs = `tidied/${other}-0a1b2c3d.png`;
    await platform().media.put(theirs, PNG);
    expect(await approveTidiedPhoto(show.tokens[me], `/media/${theirs}`)).toEqual({
      ok: false,
      error: ACTION_ERRORS.tidyNotFound,
    });
    expect(await approveTidiedPhoto(show.tokens[me], `/media/tidied/${me}-99999999.png`)).toEqual({
      ok: false,
      error: ACTION_ERRORS.tidyNotFound,
    });
    expect((await fighter(me)).tidied).toBeNull();
  });

  it("goes straight back to the photograph that was sent when it is discarded", async () => {
    const { show, me } = await poorShow();
    const key = `tidied/${me}-0a1b2c3d.png`;
    await platform().media.put(key, PNG);
    await approveTidiedPhoto(show.tokens[me], `/media/${key}`);

    expect((await discardTidiedPhoto(show.tokens[me], `/media/${key}`)).ok).toBe(true);
    const after = await fighter(me);
    expect(after.tidied).toBeNull();
    expect(after.photo).toBe(`/media/fighters/${me}-a1b2c3d4.jpg`);
    expect(await exists(key)).toBe(false);
  });

  it("goes with the photograph it was made from, and with the fighter's details", async () => {
    const { show, me } = await poorShow();
    const key = `tidied/${me}-0a1b2c3d.png`;
    await platform().media.put(key, PNG);
    await approveTidiedPhoto(show.tokens[me], `/media/${key}`);

    const form = new FormData();
    form.set("photo", new File([JPEG], "photo.jpg", { type: "image/jpeg" }));
    expect((await uploadPhoto(show.tokens[me], form)).ok).toBe(true);
    expect((await fighter(me)).tidied).toBeNull();
    expect(await exists(key)).toBe(false);

    const second = `tidied/${me}-1a2b3c4d.png`;
    await platform().media.put(second, PNG);
    await approveTidiedPhoto(show.tokens[me], `/media/${second}`);
    expect((await removeMyDetails(show.tokens[me])).ok).toBe(true);
    expect(await exists(second)).toBe(false);
  });
});
