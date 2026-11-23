import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIPS } from "@/lib/clips";
import { mastheadFor } from "@/lib/masthead";
import { ALSO_FOR, PRODUCT_CTA, PRODUCTS, productStrings } from "@/lib/products";

const ROOT = path.join(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const ALL = [
  ...PRODUCTS.flatMap(productStrings),
  ...Object.values(PRODUCT_CTA),
  ALSO_FOR.heading,
  ALSO_FOR.body,
  ALSO_FOR.awards.title,
  ALSO_FOR.awards.body,
  ALSO_FOR.seminars.title,
  ALSO_FOR.seminars.body,
];

describe("the product pages' examples", () => {
  /**
   * The apps were built for real prospective clients and seeded with their real
   * events. None of it may reach a public page: the examples here are invented,
   * and this is the list of what they must never be confused with.
   */
  it("never name a real prospective client, venue or person", () => {
    const forbidden =
      /scottish combat|crowne plaza|des clarke|scottishcombat|vizeer|demetrious|mighty mouse|machida|rodtang|paul craig|bearjew|carrillo|bellahouston/i;
    for (const line of ALL) expect(line).not.toMatch(forbidden);
    for (const page of PRODUCTS) {
      const alt = readFileSync(path.join(ROOT, "app", page.path.slice(1), "opengraph-image.alt.txt"), "utf8");
      expect(alt).not.toMatch(forbidden);
    }
  });

  it("say the example is invented", () => {
    for (const page of PRODUCTS) expect(page.example.body).toMatch(/invented/);
  });
});

describe("the product pages' copy", () => {
  it("keeps the established tone", () => {
    for (const line of ALL) {
      // No claims about how long anything takes.
      expect(line, line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line, line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      // American spellings and exclamation marks read as somebody else's product.
      expect(line, line).not.toMatch(/organiz|customiz|recogniz|color\b|center\b|!/i);
      expect(line, line).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
      // The laddy register belongs inside a programme, not on a marketing page.
      expect(line, line).not.toMatch(/\b(war|scrap|banger|smash|brutal|savage)\b/i);
    }
  });

  /** A figure written into marketing copy is a figure nobody can check. */
  it("states no figure about reach, attendance or engagement", () => {
    for (const line of ALL) {
      expect(line, line).not.toMatch(/\d+\s*(%|per ?cent|views|followers|attendees|guests|people|nominees)/i);
    }
  });

  it("reads as sentences rather than as placeholders", () => {
    for (const line of ALL) {
      expect(line.trim()).toBe(line);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  it("names each product the same way throughout", () => {
    for (const line of ALL) expect(line, line).not.toMatch(/EventIQ (Award|Seminar)(?!s\b)/);
  });

  it("keeps the og alt text in step with the page", () => {
    for (const page of PRODUCTS) {
      const alt = readFileSync(path.join(ROOT, "app", page.path.slice(1), "opengraph-image.alt.txt"), "utf8");
      expect(alt).toBe(page.meta.ogAlt);
    }
  });
});

describe("the product pages' media", () => {
  /** A video served straight off the assets binding will not play on an iPhone (bug 47). */
  it("serves every clip through /clips with a length on record", () => {
    for (const page of PRODUCTS) {
      for (const clip of [page.hero.clip, ...page.clips.items]) {
        expect(CLIPS[clip.clip], clip.clip).toBeDefined();
        expect(existsSync(path.join(PUBLIC, clip.poster)), clip.poster).toBe(true);
      }
    }
  });

  it("has every screenshot on disk, each with alt text", () => {
    for (const page of PRODUCTS) {
      const screens = [...page.features.screens, ...(page.sponsors.screen ? [page.sponsors.screen] : [])];
      for (const screen of screens) {
        expect(existsSync(path.join(PUBLIC, screen.src)), screen.src).toBe(true);
        expect(screen.alt.length).toBeGreaterThan(20);
      }
      expect(existsSync(path.join(ROOT, "app", page.path.slice(1), "opengraph-image.jpg"))).toBe(true);
    }
  });

  it("keeps the pages light", () => {
    for (const page of PRODUCTS) {
      for (const clip of [page.hero.clip, ...page.clips.items]) {
        expect(CLIPS[clip.clip]!.size, clip.clip).toBeLessThan(1_000_000);
      }
    }
  });
});

describe("the product pages' masthead", () => {
  it("say EventIQ at the top, as marketing pages do", () => {
    for (const page of PRODUCTS) expect(mastheadFor(page.path)).toBe("full");
  });
});
