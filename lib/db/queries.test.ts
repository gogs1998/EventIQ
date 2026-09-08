import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { analyticsFrom, toFighter } from "@/lib/db/queries";

/**
 * The mapping from a row to a Fighter, and what it does with a column that has
 * gone bad.
 *
 * styleTags is the one column here holding JSON, and it is read on every fighter
 * of every card. An unparseable value threw inside loadCard, which is six rows
 * before anything renders — so one bad row took down the programme, the
 * dashboard and every render for the whole show rather than costing that one
 * fighter their tags.
 */

type FighterRow = typeof schema.fighters.$inferSelect;

function row(extra: Partial<FighterRow> = {}): FighterRow {
  return {
    id: "f1",
    name: "Owen Pryce",
    gym: "Bryn Athletic",
    nickname: null,
    hometown: null,
    age: null,
    heightCm: null,
    reachCm: null,
    stance: null,
    photo: null,
    cutout: null,
    instagram: null,
    recordW: null,
    recordL: null,
    recordD: null,
    finishKo: null,
    finishSub: null,
    walkoutTitle: null,
    walkoutArtist: null,
    bio: null,
    styleTags: null,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  } as FighterRow;
}

describe("toFighter", () => {
  it("reads the tags a fighter picked", () => {
    expect(toFighter(row({ styleTags: '["Boxing","Judo"]' }), []).styleTags).toEqual([
      "Boxing",
      "Judo",
    ]);
  });

  it("loses the tags rather than the show when the column will not parse", () => {
    const fighter = toFighter(row({ styleTags: "{not json" }), []);
    expect(fighter.styleTags).toBeUndefined();
    expect(fighter.name).toBe("Owen Pryce");
  });

  it("ignores anything in there that is not a list of tags", () => {
    expect(toFighter(row({ styleTags: '"Boxing"' }), []).styleTags).toBeUndefined();
    expect(toFighter(row({ styleTags: "[1,2]" }), []).styleTags).toBeUndefined();
    expect(toFighter(row({ styleTags: "[]" }), []).styleTags).toBeUndefined();
    expect(toFighter(row({ styleTags: '["Boxing",7]' }), []).styleTags).toEqual(["Boxing"]);
  });
});

/**
 * The counting, added up from wherever it happens to be sitting.
 *
 * A show's rows live in `analytics_events` for two days and in `analytics_daily`
 * for ever after, and scripts/rollup-analytics.mjs moves them from one to the
 * other. The promise this makes to a promoter is that the numbers they were
 * looking at yesterday are the numbers they see today — so what is tested here
 * is not the arithmetic but the invariant: fold any part of a show's counting
 * and the totals are identical.
 */
const KINDS = [
  { kind: "programme_open", count: 140, sessions: 96 },
  { kind: "bout_expand", count: 310, sessions: 84 },
  { kind: "sponsor_tap", count: 22, sessions: 19 },
];
const TAPS = [
  { sponsorId: "mouthguards-pro", count: 14 },
  { sponsorId: "fightiq-win", count: 8 },
];

/** The same counting split in two, as the fold would leave it. */
function split(rows: { count: number; sessions?: number }[], at: number) {
  const head = rows.map((row) => ({
    ...row,
    count: Math.min(row.count, at),
    ...(row.sessions === undefined ? {} : { sessions: Math.min(row.sessions, at) }),
  }));
  const tail = rows.map((row) => ({
    ...row,
    count: row.count - Math.min(row.count, at),
    ...(row.sessions === undefined ? {} : { sessions: row.sessions - Math.min(row.sessions, at) }),
  }));
  return [head, tail] as const;
}

describe("analyticsFrom", () => {
  it("counts what is there and zeroes what is not", () => {
    const { totals, taps } = analyticsFrom(KINDS, TAPS);
    expect(totals.programme_open).toBe(140);
    expect(totals.bout_expand).toBe(310);
    expect(totals.spectators).toBe(96);
    // Never an estimate, and never a gap filled in. A show nobody scanned reads
    // as nought, which is information.
    expect(totals.tape_play).toBe(0);
    expect(totals.profile_view).toBe(0);
    expect(taps).toEqual({ "mouthguards-pro": 14, "fightiq-win": 8 });
  });

  it("gives the same totals however the fold has split the rows", () => {
    const whole = analyticsFrom(KINDS, TAPS);
    for (const at of [0, 1, 7, 20, 96, 140, 400]) {
      const [foldedKinds, liveKinds] = split(KINDS, at);
      const [foldedTaps, liveTaps] = split(TAPS, at);
      expect(
        analyticsFrom(
          [...(liveKinds as typeof KINDS), ...(foldedKinds as typeof KINDS)],
          [...(liveTaps as typeof TAPS), ...(foldedTaps as typeof TAPS)],
        ),
        `split at ${at}`,
      ).toEqual(whole);
    }
  });

  /**
   * The folded rows come back grouped by day, so one kind arrives several times
   * over. Assigning rather than adding would have shown a promoter one day of
   * their show and called it the total.
   */
  it("adds a kind that arrives more than once", () => {
    const { totals, taps } = analyticsFrom(
      [
        { kind: "programme_open", count: 40, sessions: 30 },
        { kind: "programme_open", count: 100, sessions: 66 },
      ],
      [
        { sponsorId: "mouthguards-pro", count: 9 },
        { sponsorId: "mouthguards-pro", count: 5 },
      ],
    );
    expect(totals.programme_open).toBe(140);
    expect(totals.spectators).toBe(96);
    expect(taps).toEqual({ "mouthguards-pro": 14 });
  });

  it("ignores a kind nothing knows about and a tap naming no sponsor", () => {
    const { totals, taps } = analyticsFrom(
      [{ kind: "something_else", count: 9, sessions: 9 }],
      [{ sponsorId: null, count: 4 }],
    );
    expect(totals).toEqual({
      programme_open: 0,
      bout_expand: 0,
      tape_play: 0,
      sponsor_tap: 0,
      profile_view: 0,
      spectators: 0,
    });
    expect(taps).toEqual({});
  });
});
