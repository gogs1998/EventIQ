import { describe, expect, it } from "vitest";
import { GYM_TO_CONFIRM } from "@/lib/copy";
import type { Bout, Fighter } from "@/lib/types";
import {
  boutClassLine,
  buildHooks,
  buildTape,
  completeness,
  finishCount,
  finishRate,
  firstName,
  formatRecord,
  isDebut,
  isUndefeated,
  lastName,
  leadName,
  parseWeightKg,
  tapeGapsBehind,
  totalFights,
} from "@/lib/tape";

let nextId = 0;

/** Nothing here reads a fixture: every function under test takes its fighters. */
function fighter(f: Omit<Fighter, "id" | "gym"> & { gym?: string }): Fighter {
  nextId += 1;
  return { id: `f${nextId}`, gym: "Some Gym", ...f };
}

function bout(extra: Partial<Bout> = {}): Bout {
  return {
    number: 99,
    discipline: "MMA",
    weightKg: 70,
    rounds: 3,
    roundMinutes: 3,
    redId: "red",
    blueId: "blue",
    ...extra,
  };
}

describe("record formatting", () => {
  it("calls a fighter with no fights a debut", () => {
    const f: Fighter = { id: "t1", name: "Test One", gym: "Gym", record: { w: 0, l: 0, d: 0 } };
    expect(isDebut(f)).toBe(true);
    expect(formatRecord(f)).toBe("Debut");
  });

  it("treats a missing record as a debut for counting but shows nothing", () => {
    const f: Fighter = { id: "t2", name: "Test Two", gym: "Gym" };
    expect(totalFights(f)).toBe(0);
    expect(formatRecord(f)).toBeUndefined();
  });

  it("omits draws when there are none", () => {
    const f: Fighter = { id: "t3", name: "T", gym: "G", record: { w: 6, l: 1, d: 0 } };
    expect(formatRecord(f)).toBe("6-1");
  });

  it("includes draws when there are some", () => {
    const f: Fighter = { id: "t4", name: "T", gym: "G", record: { w: 5, l: 0, d: 1 } };
    expect(formatRecord(f)).toBe("5-0-1");
  });

  it("does not count a winless fighter as undefeated", () => {
    const f: Fighter = { id: "t5", name: "T", gym: "G", record: { w: 0, l: 0, d: 0 } };
    expect(isUndefeated(f)).toBe(false);
  });

  /**
   * Rows written before the questionnaire clamped these still exist, so the
   * tape has to cope with a record and a set of finishes that contradict it
   * rather than reading out "5 finishes" beside "2-0".
   */
  it("never counts more finishes than wins", () => {
    const f: Fighter = {
      id: "t7",
      name: "T",
      gym: "G",
      record: { w: 2, l: 0, d: 0 },
      finishes: { ko: 3, sub: 2 },
    };
    expect(finishCount(f)).toBe(2);
    expect(buildTape(f, f).find((r) => r.key === "finishes")?.red).toBe("2");
  });

  it("says nothing about a finish hook it cannot stand behind", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R", record: { w: 2, l: 0, d: 0 }, finishes: { ko: 9, sub: 0 } }),
      fighter({ name: "B", record: { w: 2, l: 1, d: 0 } }),
    );

    expect(hooks.join(" ")).not.toContain("9");
    expect(hooks.join(" ")).toContain("finished 2 of 2 wins");
  });

  it("counts nothing where the fighter has no record to count against", () => {
    const f: Fighter = { id: "t8", name: "T", gym: "G", finishes: { ko: 2, sub: 1 } };
    expect(finishCount(f)).toBe(3);
  });

  it("caps finish rate at 1 even if the data disagrees with itself", () => {
    const f: Fighter = {
      id: "t6",
      name: "T",
      gym: "G",
      record: { w: 2, l: 0, d: 0 },
      finishes: { ko: 2, sub: 2 },
    };
    expect(finishRate(f)).toBe(1);
  });
});

/**
 * Amateur cards carry fighters known by one word. The name block sets the lead
 * name above the big one, so a single token used for both printed "Bones Bones"
 * on the card and in the video.
 */
describe("names", () => {
  it("uses a single-word name once", () => {
    const f: Fighter = { id: "n1", name: "Bones", gym: "G" };
    expect(lastName(f)).toBe("Bones");
    expect(firstName(f)).toBe("Bones");
    expect(leadName(f)).toBeUndefined();
  });

  it("splits an ordinary name into a lead and a surname", () => {
    const f: Fighter = { id: "n2", name: "Ada Long", gym: "G" };
    expect(leadName(f)).toBe("Ada");
    expect(lastName(f)).toBe("Long");
  });

  it("keeps the middle names on the lead line rather than dropping them", () => {
    const f: Fighter = { id: "n3", name: "Ada Mary Long", gym: "G" };
    expect(leadName(f)).toBe("Ada Mary");
    expect(lastName(f)).toBe("Long");
    expect(firstName(f)).toBe("Ada");
  });

  it("copes with the spacing a form actually receives", () => {
    const f: Fighter = { id: "n4", name: "  Ada   Long  ", gym: "G" };
    expect(leadName(f)).toBe("Ada");
    expect(lastName(f)).toBe("Long");
  });

  it("names a single-word debutant once in the hook", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "Bones", record: { w: 0, l: 0, d: 0 } }),
      fighter({ name: "Ada Long", record: { w: 4, l: 1, d: 0 } }),
    );

    expect(hooks).toContain("Bones is making their debut.");
  });
});

describe("buildTape", () => {
  it("drops a row only when neither corner can fill it", () => {
    const red = fighter({ name: "Red One", gym: "Ironworks", heightCm: 180 });
    const blue = fighter({ name: "Blue One", gym: "Vanguard" });

    const keys = buildTape(red, blue).map((r) => r.key);

    expect(keys).toContain("height");
    expect(keys).toContain("gym");
    // Neither gave a reach or a stance, so those rows never appear.
    expect(keys).not.toContain("reach");
    expect(keys).not.toContain("stance");
  });

  it("keeps a half-filled row and marks no leader", () => {
    const red = fighter({ name: "Red Two", heightCm: 180 });
    const blue = fighter({ name: "Blue Two" });

    const row = buildTape(red, blue).find((r) => r.key === "height");
    expect(row?.red).toBe("180cm");
    expect(row?.blue).toBeUndefined();
    expect(row?.leader).toBeUndefined();
  });

  it("awards the leader and the gap on contested rows", () => {
    const red = fighter({ name: "Red Three", reachCm: 191 });
    const blue = fighter({ name: "Blue Three", reachCm: 180 });

    const row = buildTape(red, blue).find((r) => r.key === "reach");
    expect(row?.leader).toBe("red");
    expect(row?.edge).toBe("+11cm");
  });

  it("declares no leader when a contested row is tied", () => {
    const row = buildTape(
      fighter({ name: "R", reachCm: 180 }),
      fighter({ name: "B", reachCm: 180 }),
    ).find((r) => r.key === "reach");

    expect(row?.leader).toBeUndefined();
    expect(row?.edge).toBeUndefined();
  });

  it("never picks a leader on age, which is not a contest", () => {
    const row = buildTape(fighter({ name: "R", age: 22 }), fighter({ name: "B", age: 34 })).find(
      (r) => r.key === "age",
    );

    expect(row?.leader).toBeUndefined();
  });
});

describe("buildHooks", () => {
  it("leads with the belt when there is one", () => {
    const hooks = buildHooks(
      bout({ titleLabel: "Middleweight Title" }),
      fighter({ name: "R One", record: { w: 3, l: 1, d: 0 } }),
      fighter({ name: "B One", record: { w: 2, l: 2, d: 0 } }),
    );

    expect(hooks[0]).toContain("Middleweight Title");
  });

  it("spots two debutants", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R Two", record: { w: 0, l: 0, d: 0 } }),
      fighter({ name: "B Two", record: { w: 0, l: 0, d: 0 } }),
    );

    expect(hooks.join(" ")).toContain("Two debutants");
  });

  it("names the reach advantage and its size", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "Ada Long", reachCm: 195 }),
      fighter({ name: "Bo Short", reachCm: 180 }),
    );

    expect(hooks).toContain("Long carries 15cm more reach.");
  });

  it("ignores a trivial reach difference", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R", reachCm: 182 }),
      fighter({ name: "B", reachCm: 180 }),
    );

    expect(hooks.join(" ")).not.toContain("reach");
  });

  it("calls out a gym clash", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R", gym: "Ironworks MMA" }),
      fighter({ name: "B", gym: "Ironworks MMA" }),
    );

    expect(hooks.join(" ")).toContain("Same gym");
  });

  it("says nothing about a gym neither of them has given yet", () => {
    // Both corners carry the placeholder the card editor writes, so the old
    // equality test announced a gym clash on a freshly entered card.
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R", gym: GYM_TO_CONFIRM }),
      fighter({ name: "B", gym: GYM_TO_CONFIRM }),
    );

    expect(hooks.join(" ")).not.toContain("Same gym");
  });

  it("says nothing about a gym that is a box of spaces", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R", gym: "   " }),
      fighter({ name: "B", gym: "" }),
    );

    expect(hooks.join(" ")).not.toContain("Same gym");
  });

  it("does not make a derby out of two blank hometowns", () => {
    const hooks = buildHooks(
      bout(),
      fighter({ name: "R", hometown: "  " }),
      fighter({ name: "B", hometown: "  " }),
    );

    expect(hooks.join(" ")).not.toContain("derby");
  });

  it("returns nothing rather than inventing a story from an empty pair", () => {
    expect(
      buildHooks(bout(), fighter({ name: "R", gym: "A" }), fighter({ name: "B", gym: "B" })),
    ).toEqual([]);
  });

  it("never returns more than three", () => {
    const hooks = buildHooks(
      bout({ titleLabel: "Belt" }),
      fighter({
        name: "Ada Long",
        gym: "A",
        reachCm: 200,
        heightCm: 200,
        stance: "Southpaw",
        record: { w: 9, l: 0, d: 0 },
        finishes: { ko: 8, sub: 1 },
      }),
      fighter({
        name: "Bo Short",
        gym: "B",
        reachCm: 170,
        heightCm: 170,
        stance: "Orthodox",
        record: { w: 0, l: 0, d: 0 },
      }),
    );

    expect(hooks.length).toBe(3);
  });
});

/**
 * The record row used to contest wins alone, which is not what a record means.
 * It made 10-9 lead 3-0, and it put an edge on a two-fight opponent over a
 * debutant — a line the room corrects out loud.
 */
describe("the record row", () => {
  function recordRow(red: Fighter, blue: Fighter) {
    return buildTape(red, blue).find((r) => r.key === "record");
  }

  it("does not call a busy loser the leader over a clean short record", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 10, l: 9, d: 0 } }),
      fighter({ name: "B", record: { w: 3, l: 0, d: 0 } }),
    );

    expect(row?.red).toBe("10-9");
    expect(row?.leader).toBeUndefined();
    expect(row?.edge).toBeUndefined();
  });

  it("reads Debut with no leader and no edge against a fighter with fights", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 0, l: 0, d: 0 } }),
      fighter({ name: "B", record: { w: 2, l: 1, d: 0 } }),
    );

    expect(row?.red).toBe("Debut");
    expect(row?.leader).toBeUndefined();
    expect(row?.edge).toBeUndefined();
  });

  it("leads on more wins where the losses do not contradict it", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 9, l: 0, d: 0 } }),
      fighter({ name: "B", record: { w: 2, l: 1, d: 0 } }),
    );

    expect(row?.leader).toBe("red");
    expect(row?.edge).toBe("+7 wins");
  });

  it("separates two fighters level on wins by their losses", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 3, l: 0, d: 0 } }),
      fighter({ name: "B", record: { w: 3, l: 2, d: 0 } }),
    );

    expect(row?.leader).toBe("red");
    expect(row?.edge).toBe("2 fewer losses");
  });

  it("says nothing about a single win between them", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 3, l: 1, d: 0 } }),
      fighter({ name: "B", record: { w: 2, l: 1, d: 0 } }),
    );

    expect(row?.leader).toBeUndefined();
  });

  it("declares nothing where only one corner has given a record", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 6, l: 0, d: 0 } }),
      fighter({ name: "B" }),
    );

    expect(row?.red).toBe("6-0");
    expect(row?.blue).toBeUndefined();
    expect(row?.leader).toBeUndefined();
  });

  it("keeps the row shape the components read", () => {
    const row = recordRow(
      fighter({ name: "R", record: { w: 9, l: 0, d: 0 } }),
      fighter({ name: "B", record: { w: 2, l: 1, d: 0 } }),
    );

    expect(row?.redValue).toBe(9);
    expect(row?.blueValue).toBe(2);
  });
});

describe("a field nobody has answered", () => {
  it("leaves the gym row empty rather than reading the placeholder as a gym", () => {
    const row = buildTape(
      fighter({ name: "R", gym: GYM_TO_CONFIRM }),
      fighter({ name: "B", gym: "Ironworks MMA" }),
    ).find((r) => r.key === "gym");

    expect(row?.red).toBeUndefined();
    expect(row?.blue).toBe("Ironworks MMA");
  });

  it("drops the hometown row when both are whitespace", () => {
    const keys = buildTape(
      fighter({ name: "R", hometown: " " }),
      fighter({ name: "B", hometown: "" }),
    ).map((r) => r.key);

    expect(keys).not.toContain("hometown");
  });

  it("does not score a placeholder or a blank as something they told us", () => {
    const placeheld: Fighter = { id: "p1", name: "R", gym: GYM_TO_CONFIRM, hometown: "  " };
    const blank: Fighter = { id: "p2", name: "R", gym: "" };
    expect(completeness(placeheld).missing).toContain("Hometown");
    expect(completeness(placeheld).score).toBe(completeness(blank).score);
  });

  it("counts a line the opponent has genuinely answered, not the placeholder", () => {
    const mine: Fighter = { id: "p3", name: "A", gym: "Bryn" };
    const theirs: Fighter = { id: "p4", name: "B", gym: GYM_TO_CONFIRM, hometown: "Bolton" };
    expect(tapeGapsBehind(mine, theirs)).toEqual(["From"]);
  });
});

describe("tapeGapsBehind", () => {
  it("names the lines the opponent answered and this fighter did not", () => {
    const mine: Fighter = { id: "g1", name: "Owen Pryce", gym: "Bryn" };
    const theirs: Fighter = {
      id: "g2",
      name: "Reece Tulloch",
      gym: "Northgate",
      age: 20,
      heightCm: 172,
      record: { w: 1, l: 0, d: 0 },
    };
    expect(tapeGapsBehind(mine, theirs)).toEqual(["Record", "Age", "Height"]);
  });

  it("counts nothing when the fighter is level or ahead", () => {
    const mine: Fighter = { id: "g3", name: "A", gym: "G", age: 25, heightCm: 180 };
    const theirs: Fighter = { id: "g4", name: "B", gym: "G", age: 30 };
    expect(tapeGapsBehind(mine, theirs)).toEqual([]);
  });

  it("ignores rows neither of them answered", () => {
    const mine: Fighter = { id: "g5", name: "A", gym: "G" };
    const theirs: Fighter = { id: "g6", name: "B", gym: "G" };
    expect(tapeGapsBehind(mine, theirs)).toEqual([]);
  });
});

describe("completeness", () => {
  it("scores a bare name and gym near nothing", () => {
    const f: Fighter = { id: "c1", name: "Chloe Baines", gym: "Aspire MMA" };
    expect(completeness(f).score).toBe(0);
    expect(completeness(f).missing).toContain("Photo");
  });

  it("scores a fully answered questionnaire at 100", () => {
    const f: Fighter = {
      id: "c2",
      name: "Full House",
      gym: "G",
      nickname: "The Complete",
      hometown: "Bolton",
      age: 28,
      heightCm: 185,
      reachCm: 191,
      stance: "Orthodox",
      photo: "/p.webp",
      instagram: "handle",
      record: { w: 6, l: 1, d: 0 },
      bio: "Words.",
      walkoutSong: { title: "T", artist: "A" },
      sponsorIds: ["anvil"],
    };
    expect(completeness(f).score).toBe(100);
    expect(completeness(f).missing).toEqual([]);
  });

  it("weights the photo heavily, since it is what carries the card", () => {
    const withPhoto: Fighter = { id: "c3", name: "N", gym: "G", photo: "/p.webp" };
    const withoutPhoto: Fighter = { id: "c4", name: "N", gym: "G", nickname: "x", age: 20 };
    expect(completeness(withPhoto).score).toBeGreaterThan(completeness(withoutPhoto).score);
  });
});

describe("boutClassLine", () => {
  it("reads like a promoter wrote it", () => {
    expect(
      boutClassLine(bout({ weightKg: 83, classLabel: "C Class", discipline: "MUAY_THAI" })),
    ).toBe("83kg · C Class · Muay Thai");
  });

  /**
   * Amateur cards are full of round catchweights, but a 61.5kg bout was printed
   * as 61kg — a weight the two of them did not agree to make.
   */
  it("keeps the half kilo on a catchweight", () => {
    expect(boutClassLine(bout({ weightKg: 61.5 }))).toBe("61.5kg · MMA");
  });

  it("does not put a nought after the point on a whole weight", () => {
    expect(boutClassLine(bout({ weightKg: 70 }))).toBe("70kg · MMA");
  });

  it("prints one decimal at most, whatever is stored", () => {
    expect(boutClassLine(bout({ weightKg: 61.55 }))).toBe("61.6kg · MMA");
  });
});

/**
 * The weight is the one number on a matchmaking sheet that is not whole:
 * catchweights are agreed at the half kilo. Rounding it on the way in printed a
 * weight neither corner agreed to make.
 */
describe("parseWeightKg", () => {
  it("keeps the half kilo a catchweight is agreed at", () => {
    expect(parseWeightKg("61.5")).toBe(61.5);
    expect(parseWeightKg(" 70 ")).toBe(70);
  });

  it("holds it to the tenth the card prints", () => {
    expect(parseWeightKg("61.55")).toBe(61.6);
  });

  it("has nothing to say about an empty or impossible box", () => {
    expect(parseWeightKg("")).toBeUndefined();
    expect(parseWeightKg("heavy")).toBeUndefined();
    expect(parseWeightKg("-70")).toBeUndefined();
    expect(parseWeightKg("400")).toBeUndefined();
  });

  it("marks a women's bout", () => {
    expect(boutClassLine(bout({ weightKg: 57, womens: true, classLabel: "Amateur" }))).toBe(
      "57kg · Women's · Amateur · MMA",
    );
  });
});
