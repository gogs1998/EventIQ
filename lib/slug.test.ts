import { describe, expect, it } from "vitest";
import { hasSlug, nextFreeSlug, sameAddress, slugify } from "@/lib/slug";

/**
 * The case that mattered is the empty one. A show called "!!!" or one named in a
 * script with no Latin letters slugified to "", and `createEvent` wrote it: a
 * programme addressed at `/e/` that nobody could reach and that collided with
 * the next show named the same way.
 */

describe("slugify", () => {
  it("makes an address a promoter can read off a card and type", () => {
    expect(slugify("Cage County 12")).toBe("cage-county-12");
    expect(slugify("O'Brien vs. Smith")).toBe("o-brien-vs-smith");
  });

  it("never leaves a separator at either end", () => {
    expect(slugify("  Cage County  ")).toBe("cage-county");
    expect(slugify("--Cage--County--")).toBe("cage-county");
    // Truncation can land on a separator, which would otherwise be kept.
    expect(slugify(`${"a".repeat(59)} tail`)).toBe("a".repeat(59));
  });

  it("keeps the address short enough to print", () => {
    expect(slugify("z".repeat(200))).toHaveLength(60);
  });

  it("returns nothing where there is nothing to make an address from", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("— · —")).toBe("");
    expect(slugify("")).toBe("");
  });
});

describe("hasSlug", () => {
  it("accepts a name with a letter or a number in it", () => {
    expect(hasSlug("Cage County 12")).toBe(true);
    expect(hasSlug("12")).toBe(true);
  });

  it("refuses a name that would leave the show with no address", () => {
    expect(hasSlug("!!!")).toBe(false);
    expect(hasSlug("   ")).toBe(false);
    expect(hasSlug("")).toBe(false);
  });
});

/**
 * Slugs are global, so a promoter naming their show after one somebody else has
 * already run used to be refused — and the refusal told them a show of that name
 * exists, which is the one thing every other answer on that path withholds.
 * Section 6f.
 */
describe("nextFreeSlug", () => {
  it("uses the address the name makes where nothing has taken it", () => {
    expect(nextFreeSlug("cage-county-13", [])).toBe("cage-county-13");
    expect(nextFreeSlug("cage-county-13", ["budo-79"])).toBe("cage-county-13");
  });

  it("suffixes rather than refusing, the way every publishing system does", () => {
    expect(nextFreeSlug("cage-county-13", ["cage-county-13"])).toBe("cage-county-13-2");
    expect(nextFreeSlug("cage-county-13", ["cage-county-13", "cage-county-13-2"])).toBe(
      "cage-county-13-3",
    );
  });

  it("fills a gap left in the middle rather than counting past it", () => {
    expect(nextFreeSlug("budo-79", ["budo-79", "budo-79-3"])).toBe("budo-79-2");
  });

  it("is not confused by an address that merely starts the same way", () => {
    expect(nextFreeSlug("budo-79", ["budo-79-rematch"])).toBe("budo-79");
  });

  it("terminates however many are taken", () => {
    const taken = ["budo-79", ...Array.from({ length: 40 }, (_, at) => `budo-79-${at + 2}`)];
    expect(nextFreeSlug("budo-79", taken)).toBe("budo-79-42");
  });
});

describe("sameAddress", () => {
  it("counts the address itself and its numbered forms", () => {
    expect(sameAddress("cage-county-13", "cage-county-13")).toBe(true);
    expect(sameAddress("cage-county-13", "cage-county-13-2")).toBe(true);
    expect(sameAddress("cage-county-13", "cage-county-13-11")).toBe(true);
  });

  /** A different show with a similar name, which must not be refused. */
  it("does not count an address that merely starts the same way", () => {
    expect(sameAddress("cage-county-13", "cage-county-13-rematch")).toBe(false);
    expect(sameAddress("cage-county-13", "cage-county-130")).toBe(false);
    expect(sameAddress("cage-county-13", "cage-county-13-2b")).toBe(false);
    expect(sameAddress("cage-county-13", "budo-79")).toBe(false);
  });
});
