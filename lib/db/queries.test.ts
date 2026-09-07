import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toFighter } from "@/lib/db/queries";

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
