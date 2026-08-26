import { describe, expect, it } from "vitest";
import type { Bout, Fighter } from "@/lib/types";
import {
  boutClassLine,
  buildHooks,
  buildTape,
  completeness,
  finishRate,
  formatRecord,
  isDebut,
  isUndefeated,
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

  it("marks a women's bout", () => {
    expect(boutClassLine(bout({ weightKg: 57, womens: true, classLabel: "Amateur" }))).toBe(
      "57kg · Women's · Amateur · MMA",
    );
  });
});
