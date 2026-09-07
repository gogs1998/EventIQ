import { describe, expect, it } from "vitest";
import { hasSlug, slugify } from "@/lib/slug";

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
