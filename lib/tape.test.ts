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

// The real fixture is imported by tape.ts, so tests that need bespoke fighters
// register them into the same map the module reads from.
import { fighters } from "@/data/event";

function register(f: Fighter): string {
  fighters[f.id] = f;
  return f.id;
}

function bout(redId: string, blueId: string, extra: Partial<Bout> = {}): Bout {
  return {
    number: 99,
    discipline: "MMA",
    weightKg: 70,
    rounds: 3,
    roundMinutes: 3,
    redId,
    blueId,
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
    const red = register({ id: "tr1", name: "Red One", gym: "Ironworks", heightCm: 180 });
    const blue = register({ id: "tb1", name: "Blue One", gym: "Vanguard" });

    const rows = buildTape(bout(red, blue));
    const keys = rows.map((r) => r.key);

    expect(keys).toContain("height");
    expect(keys).toContain("gym");
    // Neither gave a reach or a stance, so those rows never appear.
    expect(keys).not.toContain("reach");
    expect(keys).not.toContain("stance");
  });

  it("keeps a half-filled row and marks no leader", () => {
    const red = register({ id: "tr2", name: "Red Two", gym: "A", heightCm: 180 });
    const blue = register({ id: "tb2", name: "Blue Two", gym: "B" });

    const row = buildTape(bout(red, blue)).find((r) => r.key === "height");
    expect(row?.red).toBe("180cm");
    expect(row?.blue).toBeUndefined();
    expect(row?.leader).toBeUndefined();
  });

  it("awards the leader and the gap on contested rows", () => {
    const red = register({ id: "tr3", name: "Red Three", gym: "A", reachCm: 191 });
    const blue = register({ id: "tb3", name: "Blue Three", gym: "B", reachCm: 180 });

    const row = buildTape(bout(red, blue)).find((r) => r.key === "reach");
    expect(row?.leader).toBe("red");
    expect(row?.edge).toBe("+11cm");
  });

  it("declares no leader when a contested row is tied", () => {
    const red = register({ id: "tr4", name: "R", gym: "A", reachCm: 180 });
    const blue = register({ id: "tb4", name: "B", gym: "B", reachCm: 180 });

    const row = buildTape(bout(red, blue)).find((r) => r.key === "reach");
    expect(row?.leader).toBeUndefined();
    expect(row?.edge).toBeUndefined();
  });

  it("never picks a leader on age, which is not a contest", () => {
    const red = register({ id: "tr5", name: "R", gym: "A", age: 22 });
    const blue = register({ id: "tb5", name: "B", gym: "B", age: 34 });

    const row = buildTape(bout(red, blue)).find((r) => r.key === "age");
    expect(row?.leader).toBeUndefined();
  });
});

describe("buildHooks", () => {
  it("leads with the belt when there is one", () => {
    const red = register({ id: "hr1", name: "R One", gym: "A", record: { w: 3, l: 1, d: 0 } });
    const blue = register({ id: "hb1", name: "B One", gym: "B", record: { w: 2, l: 2, d: 0 } });

    const hooks = buildHooks(bout(red, blue, { titleLabel: "Middleweight Title" }));
    expect(hooks[0]).toContain("Middleweight Title");
  });

  it("spots two debutants", () => {
    const red = register({ id: "hr2", name: "R Two", gym: "A", record: { w: 0, l: 0, d: 0 } });
    const blue = register({ id: "hb2", name: "B Two", gym: "B", record: { w: 0, l: 0, d: 0 } });

    expect(buildHooks(bout(red, blue)).join(" ")).toContain("Two debutants");
  });

  it("names the reach advantage and its size", () => {
    const red = register({ id: "hr3", name: "Ada Long", gym: "A", reachCm: 195 });
    const blue = register({ id: "hb3", name: "Bo Short", gym: "B", reachCm: 180 });

    expect(buildHooks(bout(red, blue))).toContain("Long carries 15cm more reach.");
  });

  it("ignores a trivial reach difference", () => {
    const red = register({ id: "hr4", name: "R", gym: "A", reachCm: 182 });
    const blue = register({ id: "hb4", name: "B", gym: "B", reachCm: 180 });

    expect(buildHooks(bout(red, blue)).join(" ")).not.toContain("reach");
  });

  it("calls out a gym clash", () => {
    const red = register({ id: "hr5", name: "R", gym: "Ironworks MMA" });
    const blue = register({ id: "hb5", name: "B", gym: "Ironworks MMA" });

    expect(buildHooks(bout(red, blue)).join(" ")).toContain("Same gym");
  });

  it("returns nothing rather than inventing a story from an empty pair", () => {
    const red = register({ id: "hr6", name: "R", gym: "A" });
    const blue = register({ id: "hb6", name: "B", gym: "B" });

    expect(buildHooks(bout(red, blue))).toEqual([]);
  });

  it("never returns more than three", () => {
    const red = register({
      id: "hr7",
      name: "Ada Long",
      gym: "A",
      reachCm: 200,
      heightCm: 200,
      stance: "Southpaw",
      record: { w: 9, l: 0, d: 0 },
      finishes: { ko: 8, sub: 1 },
    });
    const blue = register({
      id: "hb7",
      name: "Bo Short",
      gym: "B",
      reachCm: 170,
      heightCm: 170,
      stance: "Orthodox",
      record: { w: 0, l: 0, d: 0 },
    });

    expect(buildHooks(bout(red, blue, { titleLabel: "Belt" })).length).toBe(3);
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
    const red = register({ id: "l1", name: "R", gym: "A" });
    const blue = register({ id: "l2", name: "B", gym: "B" });
    expect(
      boutClassLine(bout(red, blue, { weightKg: 83, classLabel: "C Class", discipline: "MUAY_THAI" })),
    ).toBe("83kg · C Class · Muay Thai");
  });

  it("marks a women's bout", () => {
    const red = register({ id: "l3", name: "R", gym: "A" });
    const blue = register({ id: "l4", name: "B", gym: "B" });
    expect(boutClassLine(bout(red, blue, { weightKg: 57, womens: true, classLabel: "Amateur" }))).toBe(
      "57kg · Women's · Amateur · MMA",
    );
  });
});
