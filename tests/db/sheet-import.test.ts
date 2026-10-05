import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { importSheet, previewSheet, setFighterPhoto } from "@/app/promoter/sheet-actions";
import { ACTION_ERRORS } from "@/lib/copy";
import { NEW_FIGHTER } from "@/lib/fighter-match";
import { plantBout, plantFighter, plantPromoters, plantShow, type PlantedShow } from "./fixtures";
import { signInAs, testDatabase } from "./harness";

/**
 * Putting a whole running order on at once, from the outside.
 *
 * What these are for is the seam rather than the parse — lib/sheet.test.ts
 * already holds every shape a sheet arrives in, and none of it touches a
 * database. What can only be checked here is that the bulk door obeys the same
 * rules the one-at-a-time door does: whose show it is, who the names already
 * are, and that a sheet lands whole or not at all.
 *
 * The last of those is the one worth being explicit about. Every reason an
 * import can be refused is checked before a single statement is built, and the
 * statements that follow go in one `db.batch`, which D1 runs as a transaction.
 * So there is no state in which some of a pasted card is on and the rest is not
 * — and the tests below assert it from both sides: a refusal leaves the card
 * exactly as it was, and an import that goes through leaves every bout, every
 * fighter and every invite from the paste on it.
 */

const platform = testDatabase();

/** A two-line sheet, in the shape of the corrected rows the preview sends back. */
function rows(
  lines: {
    red: string;
    blue: string;
    redGym?: string;
    blueGym?: string;
    redMatch?: string;
    blueMatch?: string;
    discipline?: string;
    weightKg?: string;
  }[],
) {
  return lines.map((line) => ({
    red: { name: line.red, gym: line.redGym ?? "", match: line.redMatch ?? "" },
    blue: { name: line.blue, gym: line.blueGym ?? "", match: line.blueMatch ?? "" },
    discipline: line.discipline ?? "MMA",
    weightKg: line.weightKg ?? "70",
    classLabel: "",
    womens: false,
    rounds: "3",
    roundMinutes: "3",
  }));
}

/** Cage County holds the show. Budo is signed in and is not entitled to it. */
async function twoPromoters(bouts = 2) {
  const db = platform().db;
  await plantPromoters(db, [
    { id: "pr_cage", name: "Cage County" },
    { id: "pr_budo", name: "Budo" },
  ]);
  const show = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: false,
    bouts,
  });
  return { db, show };
}

async function boutsOf(show: PlantedShow) {
  return platform()
    .db.select()
    .from(schema.bouts)
    .where(eq(schema.bouts.eventId, show.eventId))
    .orderBy(schema.bouts.number);
}

/** Everything an import could move. */
async function snapshot(eventId: string): Promise<string> {
  const db = platform().db;
  const [bouts, invites] = await db.batch([
    db.select().from(schema.bouts).where(eq(schema.bouts.eventId, eventId)),
    db.select().from(schema.invites).where(eq(schema.invites.eventId, eventId)),
  ]);
  const fighters = await db.select().from(schema.fighters);
  return JSON.stringify({ bouts, invites, fighters });
}

describe("the ownership boundary", () => {
  const cases = [
    { name: "previewSheet", run: (show: PlantedShow) => previewSheet(show.slug, "A v B") },
    {
      name: "importSheet",
      run: (show: PlantedShow) => importSheet(show.slug, rows([{ red: "A Name", blue: "B Name" }]), false),
    },
    {
      name: "setFighterPhoto",
      run: (show: PlantedShow) => setFighterPhoto(show.slug, show.fighterIds[0], jpegForm("photo")),
    },
  ];

  describe.each(cases)("$name", ({ run }) => {
    it("answers another promoter the way it answers a show that is not there", async () => {
      const { show } = await twoPromoters();
      await signInAs("pr_budo");
      const before = await snapshot(show.eventId);

      expect(await run(show)).toEqual({ ok: false, error: ACTION_ERRORS.noSuchShow });
      expect(await snapshot(show.eventId)).toBe(before);
    });

    it("tells a promoter whose session has run out, rather than reading as a crash", async () => {
      const { show } = await twoPromoters();
      const before = await snapshot(show.eventId);

      expect(await run(show)).toEqual({ ok: false, error: ACTION_ERRORS.signedOut });
      expect(await snapshot(show.eventId)).toBe(before);
    });

    it("goes through for the promoter who owns the show", async () => {
      const { show } = await twoPromoters();
      await signInAs("pr_cage");

      expect(await run(show)).toMatchObject({ ok: true });
    });
  });
});

/** The first three bytes are all `sniffImageType` reads, and all it should. */
function jpegForm(field: string): FormData {
  const form = new FormData();
  form.append(field, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], "poster.jpg"));
  return form;
}

describe("importSheet", () => {
  it("numbers the sheet on from the highest bout already on the card", async () => {
    const { show } = await twoPromoters(3);
    await signInAs("pr_cage");

    const result = await importSheet(
      show.slug,
      rows([
        { red: "Neil McLay", blue: "Declan Lowe" },
        { red: "Enes Oner", blue: "Cole Snee" },
      ]),
      false,
    );

    expect(result).toMatchObject({ ok: true });
    expect((await boutsOf(show)).map((bout) => bout.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("puts the first line at the bottom of the card where it is the main event", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      rows([
        { red: "Neil McLay", blue: "Declan Lowe" },
        { red: "Enes Oner", blue: "Cole Snee" },
        { red: "Aiden Roche", blue: "Kacper Zielinski" },
      ]),
      true,
    );

    const bouts = await boutsOf(show);
    // Numbers run from the opener up, so the main event carries the highest.
    expect(bouts.map((bout) => bout.redId)).toEqual(["aiden-roche", "enes-oner", "neil-mclay"]);
  });

  it("keeps the first line as bout one the other way round", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      rows([
        { red: "Neil McLay", blue: "Declan Lowe" },
        { red: "Enes Oner", blue: "Cole Snee" },
      ]),
      false,
    );

    expect((await boutsOf(show)).map((bout) => bout.redId)).toEqual(["neil-mclay", "enes-oner"]);
  });

  it("gives both corners of every bout a link, sealed, in the one write", async () => {
    const { db, show } = await twoPromoters(0);
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      rows([
        { red: "Neil McLay", redGym: "Urban Guerrillas", blue: "Declan Lowe", blueGym: "Crowning Glory" },
        { red: "Enes Oner", blue: "Cole Snee" },
      ]),
      false,
    );

    const invites = await db.select().from(schema.invites).where(eq(schema.invites.eventId, show.eventId));
    expect(invites).toHaveLength(4);
    expect(invites.every((invite) => invite.token === null && invite.tokenDigest)).toBe(true);

    const fighters = await db.select().from(schema.fighters);
    expect(fighters.find((one) => one.id === "neil-mclay")?.gym).toBe("Urban Guerrillas");
    // A corner with no gym on the sheet stands in rather than going in blank,
    // the same as a bout typed into the form.
    expect(fighters.find((one) => one.id === "enes-oner")?.gym).toBe("Gym to confirm");
  });

  it("carries the grading the preview was corrected to", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      [
        {
          red: { name: "Rhona Kidd", gym: "Griphouse", match: "" },
          blue: { name: "Marta Nowak", gym: "Dinky Ninjas", match: "" },
          discipline: "MUAY_THAI",
          weightKg: "57.5",
          classLabel: "C CLASS",
          womens: true,
          rounds: "5",
          roundMinutes: "2",
        },
      ],
      false,
    );

    expect((await boutsOf(show))[0]).toMatchObject({
      discipline: "MUAY_THAI",
      weightKg: 57.5,
      classLabel: "C CLASS",
      womens: true,
      rounds: 5,
      roundMinutes: 2,
    });
  });

  it("falls back rather than refusing where a box was left half-typed", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      [
        {
          red: { name: "Neil McLay", gym: "", match: "" },
          blue: { name: "Declan Lowe", gym: "", match: "" },
          discipline: "SUMO",
          weightKg: "",
          classLabel: "",
          womens: false,
          rounds: "",
          roundMinutes: "",
        },
      ],
      false,
    );

    // The same defaults a bout typed into the form gets, rather than a refusal
    // about a box a promoter is halfway through.
    expect((await boutsOf(show))[0]).toMatchObject({
      discipline: "MMA",
      weightKg: 70,
      rounds: 3,
      roundMinutes: 3,
    });
  });

  it("says so rather than putting a bout on with one corner", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");
    const before = await snapshot(show.eventId);

    expect(await importSheet(show.slug, rows([{ red: "Neil McLay", blue: "" }]), false)).toEqual({
      ok: false,
      error: ACTION_ERRORS.boutNeedsBothCorners,
    });
    expect(await snapshot(show.eventId)).toBe(before);
  });

  it("says there is nothing to add rather than reporting an empty import as done", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    expect(await importSheet(show.slug, [], false)).toEqual({
      ok: false,
      error: ACTION_ERRORS.sheetNothingToAdd,
    });
  });

  it("refuses a paste longer than one card rather than truncating it silently", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    const long = rows(
      Array.from({ length: 31 }, (_, at) => ({ red: `Red ${at}`, blue: `Blue ${at}` })),
    );
    expect(await importSheet(show.slug, long, false)).toEqual({
      ok: false,
      error: ACTION_ERRORS.sheetTooLong,
    });
    expect(await boutsOf(show)).toHaveLength(0);
  });
});

/**
 * The matching rule, reached through the bulk door.
 *
 * lib/fighter-match.ts exists because two people with one name is ordinary in
 * this sport and merging them publishes one fighter's record beside the other's
 * name. A paste is the fastest way into the card, so it is the likeliest place
 * for that rule to be given away — which is the whole reason these are here and
 * not left to the add-bout tests.
 */
describe("the names already here", () => {
  /** Somebody of this promoter's, on one of their own cards, called Owen Pryce. */
  async function namesake() {
    const { db, show } = await twoPromoters(0);
    const earlier = await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-11",
      published: true,
      bouts: 0,
    });
    await plantFighter(db, { id: "owen-pryce", name: "Owen Pryce", gym: "Bryn Athletic" });
    await plantFighter(db, { id: "dre-osei", name: "Dre Osei" });
    await plantBout(db, { eventId: earlier.eventId, number: 1, redId: "owen-pryce", blueId: "dre-osei" });
    return { db, show };
  }

  it("holds the whole sheet until a namesake has been answered", async () => {
    const { show } = await namesake();
    await signInAs("pr_cage");
    const before = await snapshot(show.eventId);

    expect(
      await importSheet(
        show.slug,
        rows([
          { red: "Neil McLay", blue: "Declan Lowe" },
          { red: "Owen Pryce", blue: "Cole Snee" },
        ]),
        false,
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.sheetCornerNeedsAnAnswer });

    // Not the clean line on and the unanswered one missing: a partial card is a
    // running order the promoter has to reconcile against the sheet by eye,
    // which is the job this was meant to take away.
    expect(await snapshot(show.eventId)).toBe(before);
  });

  it("mints a fresh row where the promoter says it is a different person", async () => {
    const { db, show } = await namesake();
    await signInAs("pr_cage");

    const result = await importSheet(
      show.slug,
      rows([{ red: "Owen Pryce", redMatch: NEW_FIGHTER, blue: "Cole Snee" }]),
      false,
    );

    expect(result).toMatchObject({ ok: true });
    const named = await db.select().from(schema.fighters).where(eq(schema.fighters.name, "Owen Pryce"));
    expect(named).toHaveLength(2);
    expect((await boutsOf(show))[0].redId).toBe("owen-pryce-2");
  });

  it("puts the fighter already here on the card where the promoter confirms them", async () => {
    const { db, show } = await namesake();
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      rows([{ red: "Owen Pryce", redMatch: "owen-pryce", blue: "Cole Snee" }]),
      false,
    );

    expect((await boutsOf(show))[0].redId).toBe("owen-pryce");
    // Their profile is what they sent last time, and confirming who they are is
    // not editing it.
    const [fighter] = await db.select().from(schema.fighters).where(eq(schema.fighters.id, "owen-pryce"));
    expect(fighter.gym).toBe("Bryn Athletic");
    // A new show is a new link.
    const invites = await db.select().from(schema.invites).where(eq(schema.invites.eventId, show.eventId));
    expect(invites.map((invite) => invite.fighterId)).toContain("owen-pryce");
  });

  it("refuses an id the name in the box is no longer offered for", async () => {
    const { show } = await namesake();
    await signInAs("pr_cage");
    const before = await snapshot(show.eventId);

    // The panel was drawn for Owen Pryce and the name has since been corrected.
    expect(
      await importSheet(
        show.slug,
        rows([{ red: "Owain Price", redMatch: "owen-pryce", blue: "Cole Snee" }]),
        false,
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.matchOutOfDate });
    expect(await snapshot(show.eventId)).toBe(before);
  });

  it("refuses the same fighter confirmed on two bouts of one paste", async () => {
    const { show } = await namesake();
    await signInAs("pr_cage");

    expect(
      await importSheet(
        show.slug,
        rows([
          { red: "Owen Pryce", redMatch: "owen-pryce", blue: "Cole Snee" },
          { red: "Owen Pryce", redMatch: "owen-pryce", blue: "Neil McLay" },
        ]),
        false,
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.sheetCornerTwice });
    expect(await boutsOf(show)).toHaveLength(0);
  });

  it("refuses a bout whose two corners are the same person", async () => {
    const { show } = await namesake();
    await signInAs("pr_cage");

    expect(
      await importSheet(
        show.slug,
        rows([
          { red: "Owen Pryce", redMatch: "owen-pryce", blue: "Owen Pryce", blueMatch: "owen-pryce" },
        ]),
        false,
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.bothCornersOneFighter });
  });

  it("refuses a fighter already on this card", async () => {
    const { db, show } = await namesake();
    await plantBout(db, { eventId: show.eventId, number: 1, redId: "owen-pryce", blueId: "dre-osei" });
    await signInAs("pr_cage");

    expect(
      await importSheet(
        show.slug,
        rows([{ red: "Owen Pryce", redMatch: "owen-pryce", blue: "Cole Snee" }]),
        false,
      ),
    ).toEqual({ ok: false, error: ACTION_ERRORS.cornerAlreadyOnCard });
  });

  it("keeps two new namesakes on one sheet apart", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    await importSheet(
      show.slug,
      rows([
        { red: "Owen Pryce", blue: "Cole Snee" },
        { red: "Owen Pryce", blue: "Neil McLay" },
      ]),
      false,
    );

    expect((await boutsOf(show)).map((bout) => bout.redId)).toEqual(["owen-pryce", "owen-pryce-2"]);
  });
});

describe("previewSheet", () => {
  it("reads the sheet and asks about a name already on the promoter's cards", async () => {
    const { db, show } = await twoPromoters(0);
    const earlier = await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-11",
      published: true,
      bouts: 0,
    });
    await plantFighter(db, { id: "owen-pryce", name: "Owen Pryce", gym: "Bryn Athletic" });
    await plantFighter(db, { id: "dre-osei", name: "Dre Osei" });
    await plantBout(db, { eventId: earlier.eventId, number: 1, redId: "owen-pryce", blueId: "dre-osei" });
    await signInAs("pr_cage");

    const result = await previewSheet(
      show.slug,
      ["Owen Pryce (Bryn Athletic) v Cole Snee (Dundee MMA) - MMA 77kg 3x3", "not a bout"].join("\n"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bouts).toHaveLength(1);
    expect(result.bouts[0].red.candidates.map((one) => one.id)).toEqual(["owen-pryce"]);
    expect(result.bouts[0].blue.candidates).toEqual([]);
    expect(result.problems).toEqual([{ line: 2, text: "not a bout", reason: "noCorners" }]);
    expect(result.nextNumber).toBe(1);
  });

  it("writes nothing", async () => {
    const { show } = await twoPromoters(1);
    await signInAs("pr_cage");
    const before = await snapshot(show.eventId);

    await previewSheet(show.slug, "Neil McLay v Declan Lowe\nEnes Oner v Cole Snee");

    expect(await snapshot(show.eventId)).toBe(before);
  });

  it("never offers a fighter off another promoter's card", async () => {
    const { db, show } = await twoPromoters(0);
    const theirs = await plantShow(db, {
      promoterId: "pr_budo",
      slug: "budo-79",
      published: true,
      bouts: 0,
    });
    await plantFighter(db, { id: "owen-pryce", name: "Owen Pryce" });
    await plantFighter(db, { id: "dre-osei", name: "Dre Osei" });
    await plantBout(db, { eventId: theirs.eventId, number: 1, redId: "owen-pryce", blueId: "dre-osei" });
    await signInAs("pr_cage");

    const result = await previewSheet(show.slug, "Owen Pryce v Cole Snee");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bouts[0].red.candidates).toEqual([]);
  });

  it("says the paste is too long rather than reading the first thirty of it", async () => {
    const { show } = await twoPromoters(0);
    await signInAs("pr_cage");

    const sheet = Array.from({ length: 31 }, (_, at) => `Red ${at} v Blue ${at}`).join("\n");
    expect(await previewSheet(show.slug, sheet)).toEqual({
      ok: false,
      error: ACTION_ERRORS.sheetTooLong,
    });
  });
});

/**
 * The photographs a promoter crops off a poster.
 *
 * Two rules, and they are the two this door exists to be held to. The bytes
 * decide what an upload is, never the declared type — section 6b — and a fighter
 * id is not a capability, so a promoter may only write onto a row that is on
 * their own card.
 */
describe("a photograph off a poster", () => {
  it("stores what the bytes say it is and puts the path on the fighter", async () => {
    const { db, show } = await twoPromoters(1);
    await signInAs("pr_cage");
    const fighterId = show.fighterIds[0];
    await db
      .update(schema.fighters)
      .set({ cutout: "/media/cutouts/old.png", stylised: "/media/portraits/old.png" })
      .where(eq(schema.fighters.id, fighterId));

    const result = await setFighterPhoto(show.slug, fighterId, jpegForm("photo"));

    expect(result).toMatchObject({ ok: true });
    const [fighter] = await db.select().from(schema.fighters).where(eq(schema.fighters.id, fighterId));
    expect(fighter.photo).toMatch(/^\/media\/fighters\/.+\.jpg$/);
    // Both are drawn from one particular picture; left behind they would put the
    // fighter's previous face in the video.
    expect(fighter.cutout).toBeNull();
    expect(fighter.stylised).toBeNull();

    const stored = await platform().media.get(fighter.photo!.slice("/media/".length));
    expect(stored?.httpMetadata?.contentType).toBe("image/jpeg");
  });

  it("refuses a file that is not a photograph whatever it says it is", async () => {
    const { db, show } = await twoPromoters(1);
    await signInAs("pr_cage");
    const form = new FormData();
    form.append(
      "photo",
      // An SVG is a document that can carry script, and it would be served from
      // our own origin. The declared type is a claim by whoever made the request.
      new File([new TextEncoder().encode("<svg onload=\"alert(1)\">")], "x.jpg", {
        type: "image/jpeg",
      }),
    );

    expect(await setFighterPhoto(show.slug, show.fighterIds[0], form)).toEqual({
      ok: false,
      error: ACTION_ERRORS.posterNotAPhotograph,
    });
    const [fighter] = await db
      .select()
      .from(schema.fighters)
      .where(eq(schema.fighters.id, show.fighterIds[0]));
    expect(fighter.photo).toBe(`/media/fighters/${show.fighterIds[0]}.jpg`);
  });

  /**
   * A returning fighter confirmed onto a pasted card brings their own profile
   * with them, and a crop off a poster does not go over the top of a photograph
   * they agreed to and sent. Section 6g: what a fighter sent is theirs.
   */
  it("leaves a photograph the fighter sent themselves alone", async () => {
    const { db, show } = await twoPromoters(1);
    await signInAs("pr_cage");
    const fighterId = show.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ consentedAt: Date.now(), consentVersion: "2026-01-01" })
      .where(eq(schema.invites.fighterId, fighterId));

    expect(await setFighterPhoto(show.slug, fighterId, jpegForm("photo"))).toEqual({
      ok: false,
      error: ACTION_ERRORS.posterWouldReplace,
    });
    const [fighter] = await db.select().from(schema.fighters).where(eq(schema.fighters.id, fighterId));
    expect(fighter.photo).toBe(`/media/fighters/${fighterId}.jpg`);
  });

  it("still takes one where the fighter has consented and sent nothing", async () => {
    const { db, show } = await twoPromoters(1);
    await signInAs("pr_cage");
    const fighterId = show.fighterIds[0];
    await db.batch([
      db
        .update(schema.invites)
        .set({ consentedAt: Date.now(), consentVersion: "2026-01-01" })
        .where(eq(schema.invites.fighterId, fighterId)),
      db.update(schema.fighters).set({ photo: null }).where(eq(schema.fighters.id, fighterId)),
    ]);

    expect(await setFighterPhoto(show.slug, fighterId, jpegForm("photo"))).toMatchObject({ ok: true });
  });

  it("refuses a fighter who is not on this card", async () => {
    const { db, show } = await twoPromoters(1);
    await plantFighter(db, { id: "somebody-else", name: "Somebody Else" });
    await signInAs("pr_cage");

    expect(await setFighterPhoto(show.slug, "somebody-else", jpegForm("photo"))).toEqual({
      ok: false,
      error: ACTION_ERRORS.notOnThisCard,
    });
  });
});
