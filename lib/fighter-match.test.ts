import { describe, expect, it } from "vitest";
import type { FighterMatch } from "@/lib/db/queries";
import {
  bothCornersAreOnePerson,
  NEW_FIGHTER,
  resolveCorner,
  sqliteLowerForms,
} from "@/lib/fighter-match";

/**
 * The decision that says whether a name a promoter typed is somebody already
 * here.
 *
 * It is worth a suite of its own because the wrong answer is invisible until a
 * fighter opens the card: a merge puts one person's record, hometown and
 * photograph under another's name on a published programme and in a video, and
 * nothing between here and there would notice. So the rule is stated as a
 * function with a branch per outcome, and what these hold it to is that
 * **silence is never a merge** — every path where nobody has said anything ends
 * in `ask` or in a fresh row, and none of them ends in `reuse`.
 */

const owen: FighterMatch = {
  id: "owen-pryce",
  name: "Owen Pryce",
  gym: "Bryn MMA",
  record: { w: 3, l: 1, d: 0 },
  lastShow: { name: "Cage County 11", date: "2026-05-16" },
};

const otherOwen: FighterMatch = {
  id: "owen-pryce-2",
  name: "Owen Pryce",
  gym: "Northgate",
  lastShow: { name: "Cage County 9", date: "2025-11-08" },
};

describe("resolveCorner", () => {
  it("mints a fresh row where nobody of that name is on the promoter's cards", () => {
    expect(resolveCorner("", [])).toEqual({ kind: "mint" });
    expect(resolveCorner(null, [])).toEqual({ kind: "mint" });
    expect(resolveCorner(NEW_FIGHTER, [])).toEqual({ kind: "mint" });
  });

  /** The rule the whole file exists for: a match is offered, never applied. */
  it("asks rather than merging where a match is offered and nothing was said", () => {
    expect(resolveCorner("", [owen])).toEqual({ kind: "ask", candidates: [owen] });
    expect(resolveCorner(undefined, [owen, otherOwen])).toEqual({
      kind: "ask",
      candidates: [owen, otherOwen],
    });
  });

  it("reuses only the row the promoter picked out of the ones offered", () => {
    expect(resolveCorner("owen-pryce", [owen, otherOwen])).toEqual({
      kind: "reuse",
      fighterId: "owen-pryce",
    });
    expect(resolveCorner("owen-pryce-2", [owen, otherOwen])).toEqual({
      kind: "reuse",
      fighterId: "owen-pryce-2",
    });
  });

  it("takes a different person at their word and starts a fresh profile", () => {
    expect(resolveCorner(NEW_FIGHTER, [owen])).toEqual({ kind: "mint" });
  });

  /**
   * A fighter id that was not offered is a form whose name box has moved since
   * the panel was drawn — or a caller posting straight at the action. Neither is
   * reinterpreted: minting would lose the promoter's answer, and reusing would
   * be the whole rule given away by a stale hidden field.
   */
  it("refuses a choice naming somebody who was not offered", () => {
    expect(resolveCorner("danny-rook", [owen])).toEqual({ kind: "stale" });
    expect(resolveCorner("owen-pryce", [])).toEqual({ kind: "stale" });
  });

  it("is not fooled by whitespace around a choice", () => {
    expect(resolveCorner("  owen-pryce  ", [owen])).toEqual({
      kind: "reuse",
      fighterId: "owen-pryce",
    });
    expect(resolveCorner("   ", [owen])).toEqual({ kind: "ask", candidates: [owen] });
  });
});

describe("bothCornersAreOnePerson", () => {
  it("catches one fighter confirmed into both corners", () => {
    const one = resolveCorner("owen-pryce", [owen]);
    expect(bothCornersAreOnePerson(one, one)).toBe(true);
  });

  it("leaves two namesakes alone, which is the card this all exists for", () => {
    expect(
      bothCornersAreOnePerson(
        resolveCorner("owen-pryce", [owen, otherOwen]),
        resolveCorner("owen-pryce-2", [owen, otherOwen]),
      ),
    ).toBe(false);
  });

  it("says nothing about two fresh rows, which are two different people", () => {
    expect(bothCornersAreOnePerson({ kind: "mint" }, { kind: "mint" })).toBe(false);
  });
});

describe("sqliteLowerForms", () => {
  // What SQLite's lower() does: A–Z only.
  const sqliteLower = (value: string) => value.replace(/[A-Z]/g, (c) => c.toLowerCase());

  it("is one form for a name in plain ASCII", () => {
    expect(sqliteLowerForms("declan lowe")).toEqual(["declan lowe"]);
  });

  it.each(["Łukasz Nowak", "Órla Byrne", "ÓRLA BYRNE", "órla byrne", "Seán Ó Briain", "Zoë-Ann Kelly"])(
    "finds %s however it was stored",
    (stored) => {
      expect(sqliteLowerForms(stored.toLowerCase())).toContain(sqliteLower(stored));
    },
  );
});
