import { describe, expect, it } from "vitest";
import {
  CARD_ROWS,
  cardRowFrames,
  countdownRowFrames,
  daysToGoLabel,
  formatShowDateLong,
  rowFrames,
} from "@/lib/promo";

describe("formatShowDateLong", () => {
  it("sets the date the way a poster does, with no year", () => {
    expect(formatShowDateLong("2026-09-19")).toBe("Saturday 19 September");
  });

  it("reads the date in UTC, so the day does not shift either side of midnight", () => {
    expect(formatShowDateLong("2026-11-14")).toBe("Saturday 14 November");
  });
});

describe("daysToGoLabel", () => {
  /**
   * The zero case is the whole reason this is a function rather than a template
   * string. "0 days to go" is the same mistake as "a tale of the tape for all 0
   * bouts": a count that has run out has become a different sentence.
   */
  it("says what day it is rather than counting nothing", () => {
    expect(daysToGoLabel(0)).toBe("Tonight");
  });

  it("does not put a one in front of a singular either", () => {
    expect(daysToGoLabel(1)).toBe("Tomorrow night");
  });

  it("counts anything further out", () => {
    expect(daysToGoLabel(30)).toBe("30 days to go");
    expect(daysToGoLabel(2)).toBe("2 days to go");
  });

  it("has nothing to say about a show that has already happened", () => {
    expect(daysToGoLabel(-1)).toBeNull();
  });
});

describe("rowFrames", () => {
  /**
   * The two ends of a real card. Fifteen bouts is the full bill the BUDO 79
   * programme taught us to expect; six is an ordinary small-hall night, and the
   * failure to avoid is six rows flashing past in a third of the sequence and
   * leaving the rest of it empty.
   */
  it("fits a full fifteen-bout card inside its budget", () => {
    const perRow = cardRowFrames(15);
    expect(perRow).toBe(24);
    expect(perRow * 15).toBeLessThanOrEqual(CARD_ROWS.budget);
  });

  it("gives a short card the ceiling rather than the whole budget each", () => {
    expect(cardRowFrames(6)).toBe(CARD_ROWS.ceiling);
    expect(cardRowFrames(1)).toBe(CARD_ROWS.ceiling);
  });

  it("holds every card between the floor and the ceiling", () => {
    for (let bouts = 1; bouts <= 15; bouts += 1) {
      expect(cardRowFrames(bouts)).toBeGreaterThanOrEqual(CARD_ROWS.floor);
      expect(cardRowFrames(bouts)).toBeLessThanOrEqual(CARD_ROWS.ceiling);
    }
  });

  it("never divides by a card with nothing on it", () => {
    expect(cardRowFrames(0)).toBe(CARD_ROWS.ceiling);
    expect(countdownRowFrames(0)).toBeGreaterThan(0);
  });

  it("takes the floor rather than the budget on a card long enough to need it", () => {
    // Longer than any bill anybody has shown us, and the point at which the
    // budget stops being divisible into readable rows: the floor wins and the
    // run overshoots rather than going under it.
    expect(rowFrames(40, { budget: 360, floor: 18, ceiling: 46 })).toBe(18);
  });
});
