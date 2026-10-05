import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { addBout, findFighters } from "@/app/promoter/actions";
import { fightersNamed, lastSubmittedShow, nameOnAnotherPromotion } from "@/lib/db/queries";
import { ACTION_ERRORS } from "@/lib/copy";
import { NEW_FIGHTER } from "@/lib/fighter-match";
import { appearancesFor, loadPublicFighter } from "@/lib/visibility";
import { plantBout, plantFighter, plantPromoters, plantRender, plantShow } from "./fixtures";
import { signInAs, testDatabase } from "./harness";

/**
 * A fighter who comes back, and a fighter's page that outlives one card.
 *
 * Two rules are held to account here and they pull in opposite directions, which
 * is why they share a file.
 *
 * The first is tenancy. `fighters` is a global table on purpose (HANDOVER
 * section 19 item 11), so every read that starts at a fighter has to say who is
 * entitled to it — a name box answering across promoters would be one promoter
 * reading another's roster, one guess at a time.
 *
 * The second is the publish gate. A fighter's own page is the first address here
 * that names somebody without naming a show, so a draft reaching it is the same
 * class of hole as the capture page in section 6c, on a page anybody can open.
 */

const platform = testDatabase();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/**
 * Cage County has run a show with Owen Pryce on it and has another in the diary.
 * Budo is a second promotion with an Owen Pryce of their own, which is the case
 * the whole matching design exists for.
 */
async function twoPromotions() {
  const db = platform().db;
  await plantPromoters(db, [
    { id: "pr_cage", name: "Cage County" },
    { id: "pr_budo", name: "Budo" },
  ]);

  const past = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-11",
    published: true,
    bouts: 1,
    date: "2026-05-16",
  });
  const next = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: false,
    bouts: 1,
    date: "2026-11-14",
  });
  const rival = await plantShow(db, {
    promoterId: "pr_budo",
    slug: "budo-79",
    published: true,
    bouts: 1,
    date: "2026-06-20",
  });

  await plantFighter(db, {
    id: "owen-pryce",
    name: "Owen Pryce",
    gym: "Bryn MMA",
    record: { w: 3, l: 1, d: 0 },
  });
  await plantFighter(db, { id: "dre-osei", name: "Dre Osei", gym: "Northgate" });
  await plantFighter(db, { id: "owen-pryce-2", name: "owen pryce", gym: "Fenland" });

  await plantBout(db, { eventId: past.eventId, number: 2, redId: "owen-pryce", blueId: "dre-osei" });
  await plantBout(db, {
    eventId: rival.eventId,
    number: 2,
    redId: "owen-pryce-2",
    blueId: rival.fighterIds[0],
  });

  return { db, past, next, rival };
}

describe("fightersNamed", () => {
  it("offers the promoter's own fighter, with the show they were last on", async () => {
    const { db } = await twoPromotions();
    const matches = await fightersNamed(db, "Owen Pryce", "pr_cage");

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "owen-pryce",
      gym: "Bryn MMA",
      record: { w: 3, l: 1, d: 0 },
      lastShow: { name: "cage-county-11" },
    });
  });

  /** A promoter typing off a matchmaking sheet is not typing the fighter's capitals. */
  it("matches whatever case and spacing the name was typed in", async () => {
    const { db } = await twoPromotions();
    for (const typed of ["owen pryce", "OWEN PRYCE", "  Owen   Pryce  "]) {
      expect(await fightersNamed(db, typed, "pr_cage")).toHaveLength(1);
    }
  });

  /**
   * The tenancy rule. Budo's Owen Pryce is a row in the same table and is not
   * Cage County's to see; the name is the only thing the two share.
   */
  it("never offers a fighter off another promotion's card", async () => {
    const { db } = await twoPromotions();
    expect((await fightersNamed(db, "Owen Pryce", "pr_cage")).map((one) => one.id)).toEqual([
      "owen-pryce",
    ]);
    expect((await fightersNamed(db, "Owen Pryce", "pr_budo")).map((one) => one.id)).toEqual([
      "owen-pryce-2",
    ]);
  });

  /** A fighter nobody has put on a card cannot be said to belong to anybody. */
  it("does not offer a row that is on no running order", async () => {
    const { db } = await twoPromotions();
    await plantFighter(db, { id: "nobody", name: "Nobody Atall" });
    expect(await fightersNamed(db, "Nobody Atall", "pr_cage")).toEqual([]);
  });

  it("says nothing about an empty name", async () => {
    const { db } = await twoPromotions();
    expect(await fightersNamed(db, "   ", "pr_cage")).toEqual([]);
  });

  /**
   * SQLite's lower() folds A–Z and nothing else, so a comparison against a
   * lowered argument missed every name with an accented or Polish capital and
   * the sheet import minted that fighter a second time without asking.
   */
  it("matches a name with a capital outside A to Z", async () => {
    const { db, past } = await twoPromotions();
    await plantFighter(db, { id: "orla-byrne", name: "Órla Byrne", gym: "Docklands" });
    await plantFighter(db, { id: "lukasz-nowak", name: "ŁUKASZ NOWAK", gym: "Wisła" });
    await plantBout(db, {
      eventId: past.eventId,
      number: 3,
      redId: "orla-byrne",
      blueId: "lukasz-nowak",
    });

    for (const typed of ["Órla Byrne", "órla byrne", "ÓRLA BYRNE"]) {
      expect((await fightersNamed(db, typed, "pr_cage")).map((one) => one.id)).toEqual([
        "orla-byrne",
      ]);
    }
    expect((await fightersNamed(db, "Łukasz Nowak", "pr_cage")).map((one) => one.id)).toEqual([
      "lukasz-nowak",
    ]);
    expect(await nameOnAnotherPromotion(db, "órla byrne", "pr_budo")).toBe(true);
  });
});

describe("nameOnAnotherPromotion", () => {
  it("says a namesake exists elsewhere, and nothing else about them", async () => {
    const { db } = await twoPromotions();
    expect(await nameOnAnotherPromotion(db, "Owen Pryce", "pr_cage")).toBe(true);
    expect(await nameOnAnotherPromotion(db, "Dre Osei", "pr_budo")).toBe(true);
  });

  it("does not count the asking promoter's own fighters", async () => {
    const { db } = await twoPromotions();
    expect(await nameOnAnotherPromotion(db, "Dre Osei", "pr_cage")).toBe(false);
  });
});

describe("findFighters", () => {
  it("is shut to a promoter who does not own the show, like every other action", async () => {
    await twoPromotions();
    await signInAs("pr_budo");
    expect(await findFighters("cage-county-12", "Owen Pryce")).toEqual({
      ok: false,
      error: ACTION_ERRORS.noSuchShow,
    });
  });

  it("offers the promoter's own match and does not mention anybody else's", async () => {
    await twoPromotions();
    await signInAs("pr_cage");
    const result = await findFighters("cage-county-12", "Owen Pryce");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.map((one) => one.id)).toEqual(["owen-pryce"]);
    // No note about Budo's namesake: the promoter has a match of their own in
    // front of them, and the note would be noise beside it.
    expect(result.elsewhere).toBe(false);
  });

  it("says a name is known elsewhere without saying anything about the card", async () => {
    await twoPromotions();
    await signInAs("pr_budo");
    const result = await findFighters("budo-79", "Dre Osei");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toEqual([]);
    expect(result.elsewhere).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Northgate");
    expect(JSON.stringify(result)).not.toContain("cage-county");
  });
});

describe("addBout and a fighter who has been here before", () => {
  it("refuses the bout while nobody has said which Owen Pryce it is", async () => {
    const { db, next } = await twoPromotions();
    await signInAs("pr_cage");

    expect(
      await addBout("cage-county-12", form({ redName: "Owen Pryce", blueName: "Danny Rook" })),
    ).toEqual({ ok: false, error: ACTION_ERRORS.cornerNeedsAnAnswer });

    // And nothing moved: no half-written fighter, no invite, no bout.
    expect(
      await db.select().from(schema.bouts).where(eq(schema.bouts.eventId, next.eventId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(schema.fighters).where(eq(schema.fighters.name, "Danny Rook")),
    ).toHaveLength(0);
  });

  it("reuses the row and issues a new invite when the promoter confirms the match", async () => {
    const { db, next } = await twoPromotions();
    await signInAs("pr_cage");

    expect(
      await addBout(
        "cage-county-12",
        form({
          redName: "Owen Pryce",
          redMatch: "owen-pryce",
          // The gym box is not drawn once a match is confirmed, and a value
          // posted at the action anyway must not overwrite what they sent.
          redGym: "Somewhere Else",
          blueName: "Danny Rook",
        }),
      ),
    ).toEqual({ ok: true });

    const [owen] = await db
      .select()
      .from(schema.fighters)
      .where(eq(schema.fighters.id, "owen-pryce"));
    expect(owen.gym).toBe("Bryn MMA");

    // One row for that person across both shows, and a link for the new one.
    expect(
      await db.select().from(schema.fighters).where(eq(schema.fighters.name, "Owen Pryce")),
    ).toHaveLength(1);
    const invites = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.fighterId, "owen-pryce"));
    expect(invites.map((one) => one.eventId)).toContain(next.eventId);
  });

  it("mints a second row where the promoter says it is a different person", async () => {
    const { db } = await twoPromotions();
    await signInAs("pr_cage");

    expect(
      await addBout(
        "cage-county-12",
        form({
          redName: "Owen Pryce",
          redMatch: NEW_FIGHTER,
          redGym: "Fenland",
          blueName: "Danny Rook",
        }),
      ),
    ).toEqual({ ok: true });

    const named = await db
      .select()
      .from(schema.fighters)
      .where(eq(schema.fighters.name, "Owen Pryce"));
    expect(named).toHaveLength(2);
    expect(named.some((one) => one.id !== "owen-pryce")).toBe(true);
  });

  it("refuses a fighter id the promoter was never offered", async () => {
    await twoPromotions();
    await signInAs("pr_cage");
    // Budo's Owen Pryce, named straight at the action.
    expect(
      await addBout(
        "cage-county-12",
        form({ redName: "Owen Pryce", redMatch: "owen-pryce-2", blueName: "Danny Rook" }),
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.matchOutOfDate });
  });

  it("refuses one person in both corners", async () => {
    await twoPromotions();
    await signInAs("pr_cage");
    expect(
      await addBout(
        "cage-county-12",
        form({
          redName: "Owen Pryce",
          redMatch: "owen-pryce",
          blueName: "Owen Pryce",
          blueMatch: "owen-pryce",
        }),
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.bothCornersOneFighter });
  });

  it("refuses a fighter who is already on this card", async () => {
    const { db, next } = await twoPromotions();
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "owen-pryce",
      blueId: "dre-osei",
    });
    await signInAs("pr_cage");

    expect(
      await addBout(
        "cage-county-12",
        form({ redName: "Owen Pryce", redMatch: "owen-pryce", blueName: "Danny Rook" }),
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.cornerAlreadyOnCard });
  });

  /** No namesake, no panel, no change: the ordinary line off a matchmaking sheet. */
  it("leaves a card with no namesake on it exactly as it was", async () => {
    const { db, next } = await twoPromotions();
    await signInAs("pr_cage");

    expect(
      await addBout(
        "cage-county-12",
        form({ redName: "Test Redcorner", blueName: "Test Bluecorner", redGym: "Testing Gym" }),
      ),
    ).toEqual({ ok: true });

    expect(
      await db.select().from(schema.bouts).where(eq(schema.bouts.eventId, next.eventId)),
    ).toHaveLength(2);
  });
});

describe("the shows on a fighter's own page", () => {
  it("lists the published cards, newest first, with the opponent", async () => {
    const { db, next } = await twoPromotions();
    // Cage County 12 is still a draft; it must not reach a public page.
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "owen-pryce",
      blueId: "dre-osei",
    });

    const shows = await appearancesFor("owen-pryce");
    expect(shows.map((show) => show.slug)).toEqual(["cage-county-11"]);
    expect(shows[0]).toMatchObject({
      corner: "red",
      boutNumber: 2,
      opponent: { id: "dre-osei", name: "Dre Osei" },
      cancelled: false,
    });
    expect(shows[0].video).toBeUndefined();
  });

  it("brings the show back the moment it is published", async () => {
    const { db, next } = await twoPromotions();
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "owen-pryce",
      blueId: "dre-osei",
    });
    await db
      .update(schema.events)
      .set({ published: true })
      .where(eq(schema.events.id, next.eventId));

    expect((await appearancesFor("owen-pryce")).map((show) => show.slug)).toEqual([
      "cage-county-12",
      "cage-county-11",
    ]);
  });

  /** Only what a successful publish wrote, the same rule the programme plays by. */
  it("carries the video where one has been published", async () => {
    const { db, past } = await twoPromotions();
    await plantRender(db, {
      eventId: past.eventId,
      boutNumber: 2,
      key: "renders/cage-county-11/2-abc.mp4",
    });

    const [show] = await appearancesFor("owen-pryce");
    expect(show.video).toContain("renders/cage-county-11/2-abc.mp4");
  });

  /**
   * A bout is a queue row per composition. Joining on the show and the bout
   * number alone listed the same night once per video that bout has, and gave
   * one of those lines the face-off under a link that says tale of the tape.
   */
  it("is one line per show however many videos the bout has", async () => {
    const { db, past } = await twoPromotions();
    await plantRender(db, {
      eventId: past.eventId,
      boutNumber: 2,
      key: "renders/cage-county-11/bout-2-faceoff-abc.mp4",
      template: "faceoff",
    });
    await plantRender(db, {
      eventId: past.eventId,
      boutNumber: 2,
      key: "renders/cage-county-11/bout-2-tape-abc.mp4",
      template: "tape",
    });

    const shows = await appearancesFor("owen-pryce");
    expect(shows.map((show) => show.slug)).toEqual(["cage-county-11"]);
    expect(shows[0].video).toContain("bout-2-tape-abc.mp4");
  });
});

describe("loadPublicFighter", () => {
  it("is the profile and the shows behind it", async () => {
    const { db } = await twoPromotions();
    const profile = await loadPublicFighter(db, "owen-pryce");

    expect(profile?.fighter.name).toBe("Owen Pryce");
    expect(profile?.appearances.map((show) => show.slug)).toEqual(["cage-county-11"]);
  });

  /**
   * The whole gate. A fighter only ever on a draft has no public existence and
   * answers exactly as a name nobody has used does — an id is a readable slug,
   * so telling the two apart would be a way of asking what is in the diary.
   */
  it("has no page for a fighter who has only ever been on a draft", async () => {
    const { db, next } = await twoPromotions();
    await plantFighter(db, { id: "danny-rook", name: "Danny Rook" });
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "danny-rook",
      blueId: "dre-osei",
    });

    expect(await loadPublicFighter(db, "danny-rook")).toBeNull();
    expect(await loadPublicFighter(db, "nobody-at-all")).toBeNull();
  });

  /** Not even for the promoter whose draft it is. This page is not about one show. */
  it("does not soften for the promoter who owns the draft", async () => {
    const { db, next } = await twoPromotions();
    await plantFighter(db, { id: "danny-rook", name: "Danny Rook" });
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "danny-rook",
      blueId: "dre-osei",
    });
    await signInAs("pr_cage");

    expect(await loadPublicFighter(db, "danny-rook")).toBeNull();
  });
});

describe("lastSubmittedShow", () => {
  it("is a show they filled a form in for, never a row that merely has details", async () => {
    const { db, past, next } = await twoPromotions();
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "owen-pryce",
      blueId: "dre-osei",
    });
    // An invite on each show, neither submitted. A filled-in row is not evidence
    // that the fighter is the one who filled it in.
    await db.insert(schema.invites).values([
      { id: "in_past", eventId: past.eventId, fighterId: "owen-pryce", createdAt: Date.now() },
      { id: "in_next", eventId: next.eventId, fighterId: "owen-pryce", createdAt: Date.now() },
    ]);
    expect(await lastSubmittedShow(db, "owen-pryce", next.eventId)).toBeNull();

    await db
      .update(schema.invites)
      .set({ submittedAt: Date.now() })
      .where(eq(schema.invites.id, "in_past"));
    expect(await lastSubmittedShow(db, "owen-pryce", next.eventId)).toMatchObject({
      name: "cage-county-11",
    });
  });

  it("never names the show being filled in now", async () => {
    const { db, next } = await twoPromotions();
    await plantBout(db, {
      eventId: next.eventId,
      number: 2,
      redId: "owen-pryce",
      blueId: "dre-osei",
    });
    await db.insert(schema.invites).values({
      id: "in_next",
      eventId: next.eventId,
      fighterId: "owen-pryce",
      submittedAt: Date.now(),
      createdAt: Date.now(),
    });
    expect(await lastSubmittedShow(db, "owen-pryce", next.eventId)).toBeNull();
  });
});
