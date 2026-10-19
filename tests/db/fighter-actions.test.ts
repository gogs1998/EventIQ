import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { saveDraft, uploadPhoto } from "@/app/f/[token]/actions";
import { removeMyDetails } from "@/app/f/[token]/consent-actions";
import { regenerateInvite } from "@/app/promoter/invite-actions";
import { CONSENT_VERSION } from "@/lib/consent";
import { ACTION_ERRORS } from "@/lib/copy";
import { openToken } from "@/lib/invite-token";
import { inviteSecret } from "@/lib/db";
import { loadInviteByToken } from "@/lib/db/queries";
import { EMPTY_DRAFT, type Draft } from "@/lib/questionnaire";
import { plantPromoters, plantShow, type PlantedShow } from "./fixtures";
import { signInAs, testDatabase } from "./harness";

/**
 * The fighter's side of the form, from the outside.
 *
 * Every one of these is a server action anybody holding a link can post to with
 * a payload of their own, so what is asserted is what the database and the
 * bucket look like afterwards rather than what the questionnaire would have
 * sent.
 */

const platform = testDatabase();

/** The smallest JPEG `sniffImageType` will believe. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

async function consentingShow(): Promise<{ show: PlantedShow; me: string; other: string }> {
  const db = platform().db;
  await plantPromoters(db, [{ id: "pr_cage", name: "Cage County" }]);
  const show = await plantShow(db, { promoterId: "pr_cage", slug: "cage-county-12", published: true });
  const [me, other] = show.fighterIds;
  await db
    .update(schema.invites)
    .set({ consentedAt: Date.now(), consentVersion: CONSENT_VERSION })
    .where(eq(schema.invites.fighterId, me));
  return { show, me, other };
}

function draft(over: Partial<Draft> = {}): Draft {
  return { ...EMPTY_DRAFT, consented: true, age: "27", ...over };
}

async function fighter(id: string) {
  const [row] = await platform()
    .db.select()
    .from(schema.fighters)
    .where(eq(schema.fighters.id, id));
  return row;
}

async function putObject(key: string): Promise<void> {
  await platform().media.put(key, JPEG, { httpMetadata: { contentType: "image/jpeg" } });
}

async function exists(key: string): Promise<boolean> {
  return (await platform().media.head(key)) !== null;
}

/** HANDOVER bug 51. */
describe("a photograph path the browser sends back", () => {
  it("cannot point a fighter's row at somebody else's picture", async () => {
    const { show, me, other } = await consentingShow();
    const theirs = (await fighter(other)).photo;
    const mine = (await fighter(me)).photo;

    const saved = await saveDraft(show.tokens[me], draft({ photo: theirs ?? undefined }));
    expect(saved.ok).toBe(true);
    expect((await fighter(me)).photo).toBe(mine);
    expect((await fighter(me)).photo).not.toBe(theirs);
  });

  it("cannot point it at any other object in the bucket either", async () => {
    const { show, me } = await consentingShow();
    const before = (await fighter(me)).photo;

    for (const photo of [
      "/media/renders/cage-county-12/bout-1-ab12cd34.mp4",
      "/media/sponsors/pr_cage/a1b2c3d4.png",
      "/fighters/dre-osei.webp",
    ]) {
      expect((await saveDraft(show.tokens[me], draft({ photo }))).ok).toBe(true);
      expect((await fighter(me)).photo).toBe(before);
    }
  });

  it("still takes the photograph off when the fighter removes it", async () => {
    const { show, me } = await consentingShow();
    expect((await saveDraft(show.tokens[me], draft({ photo: undefined }))).ok).toBe(true);
    expect((await fighter(me)).photo).toBeNull();
  });
});

describe("deleting a superseded picture", () => {
  it("never deletes an object that is not this fighter's, whatever the row says", async () => {
    const { show, me } = await consentingShow();
    const db = platform().db;
    const foreign = "renders/cage-county-12/bout-1-ab12cd34.mp4";
    const otherPhoto = "fighters/cage-county-12-1-blue-a1b2c3d4.jpg";
    await putObject(foreign);
    await putObject(otherPhoto);
    // A row as the old saveDraft would have left it.
    await db
      .update(schema.fighters)
      .set({ photo: `/media/${otherPhoto}`, cutout: `/media/${foreign}` })
      .where(eq(schema.fighters.id, me));

    const form = new FormData();
    form.set("photo", new File([JPEG], "photo.jpg", { type: "image/jpeg" }));
    const uploaded = await uploadPhoto(show.tokens[me], form);
    expect(uploaded.ok).toBe(true);

    expect(await exists(foreign)).toBe(true);
    expect(await exists(otherPhoto)).toBe(true);
  });

  it("still tidies the fighter's own previous photograph away", async () => {
    const { show, me } = await consentingShow();
    const form = () => {
      const data = new FormData();
      data.set("photo", new File([JPEG], "photo.jpg", { type: "image/jpeg" }));
      return data;
    };
    const first = await uploadPhoto(show.tokens[me], form());
    if (!first.ok) throw new Error(first.error);
    const firstKey = first.path.slice("/media/".length);
    expect(await exists(firstKey)).toBe(true);

    expect((await uploadPhoto(show.tokens[me], form())).ok).toBe(true);
    expect(await exists(firstKey)).toBe(false);
  });

  it("is held to the same rule when a fighter removes their details", async () => {
    const { show, me } = await consentingShow();
    const db = platform().db;
    const foreign = "fighters/cage-county-12-1-blue-a1b2c3d4.jpg";
    const own = `fighters/${me}-a1b2c3d4.jpg`;
    await putObject(foreign);
    await putObject(own);
    await db
      .update(schema.fighters)
      .set({ photo: `/media/${own}`, cutout: `/media/${foreign}` })
      .where(eq(schema.fighters.id, me));

    expect((await removeMyDetails(show.tokens[me])).ok).toBe(true);
    expect(await exists(own)).toBe(false);
    expect(await exists(foreign)).toBe(true);
  });
});

async function inviteOf(fighterId: string) {
  const [row] = await platform()
    .db.select()
    .from(schema.invites)
    .where(eq(schema.invites.fighterId, fighterId));
  return row;
}

describe("a fighter who took their details down, and New link", () => {
  it("records that the fighter asked, and takes the consent with the answers", async () => {
    const { show, me } = await consentingShow();
    await platform()
      .db.update(schema.invites)
      .set({ submittedAt: Date.now() })
      .where(eq(schema.invites.fighterId, me));

    expect((await removeMyDetails(show.tokens[me])).ok).toBe(true);

    const invite = await inviteOf(me);
    expect(invite.revokedAt).not.toBeNull();
    expect(invite.withdrawnAt).toBe(invite.revokedAt);
    expect(invite.consentedAt).toBeNull();
    expect(invite.consentVersion).toBeNull();
  });

  it("issues a link that starts again and asks for consent afresh", async () => {
    const { show, me } = await consentingShow();
    await platform()
      .db.update(schema.invites)
      .set({ submittedAt: Date.now() })
      .where(eq(schema.invites.fighterId, me));
    expect((await removeMyDetails(show.tokens[me])).ok).toBe(true);

    await signInAs("pr_cage");
    expect((await regenerateInvite(show.slug, me)).ok).toBe(true);

    const invite = await inviteOf(me);
    expect(invite.revokedAt).toBeNull();
    expect(invite.consentedAt).toBeNull();
    expect(invite.submittedAt).toBeNull();
    // Kept, as the record that they once asked.
    expect(invite.withdrawnAt).not.toBeNull();

    const token = await openToken(await inviteSecret(), invite.tokenCipher!);
    expect(token).toBeTruthy();
    expect(await loadInviteByToken(platform().db, token!)).not.toBeNull();
    // Nothing goes on the profile until they tick the box again.
    expect(await saveDraft(token!, draft({ nickname: "Back again", consented: false }))).toEqual({
      ok: false,
      error: ACTION_ERRORS.consentNeeded,
    });
    expect((await fighter(me)).nickname).toBeNull();
  });

  it("leaves the consent alone on a link the promoter replaced for the wrong number", async () => {
    const { show, me } = await consentingShow();
    await signInAs("pr_cage");
    expect((await regenerateInvite(show.slug, me)).ok).toBe(true);
    expect((await inviteOf(me)).consentedAt).not.toBeNull();
  });
});

describe("a record typed half way", () => {
  async function savedRecord(over: Partial<Draft>) {
    const { show, me } = await consentingShow();
    expect((await saveDraft(show.tokens[me], draft(over))).ok).toBe(true);
    const row = await fighter(me);
    return [row.recordW, row.recordL, row.recordD];
  }

  it("is not stored with noughts in the boxes the fighter has not reached", async () => {
    expect(await savedRecord({ w: "4" })).toEqual([null, null, null]);
  });

  it("is not stored from the draws alone", async () => {
    expect(await savedRecord({ d: "1" })).toEqual([null, null, null]);
  });

  it("is stored once wins and losses are both there, with no draws as none", async () => {
    expect(await savedRecord({ w: "4", l: "1" })).toEqual([4, 1, 0]);
  });
});
