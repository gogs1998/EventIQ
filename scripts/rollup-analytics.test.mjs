import { describe, expect, it } from "vitest";
import { ROLLUP_HOURS, foldBefore, halfFolded, removeSql, sumSql, utcDay } from "./rollup-analytics.mjs";

/**
 * Where the fold cuts, without the fold.
 *
 * The only thing that can go wrong here quietly is the boundary: a cutoff in the
 * middle of a day leaves that day summed in one table and counted in the other,
 * and the two halves each contribute their own count of distinct sessions for
 * one evening's spectators. So the cutoff is always midnight UTC, and it is
 * always at least the window old.
 */
const HOUR = 3_600_000;

describe("foldBefore", () => {
  it("cuts at midnight UTC, never part way through a day", () => {
    const before = foldBefore(Date.parse("2026-09-08T12:00:00Z"));
    expect(new Date(before).toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("never folds a day younger than the window", () => {
    for (const hour of [0, 1, 6, 12, 18, 23]) {
      const now = Date.parse(`2026-09-08T${String(hour).padStart(2, "0")}:30:00Z`);
      const before = foldBefore(now);
      expect(now - before, `${hour}:30`).toBeGreaterThanOrEqual(ROLLUP_HOURS * HOUR);
    }
  });

  /**
   * A show finishing at eleven at night is still being read the next morning,
   * and the promoter's dashboard is the first thing they open. Two days is a
   * long way clear of that; the point of the check is that the window is honest
   * about which days it leaves alone.
   */
  it("leaves last night's show alone", () => {
    const before = foldBefore(Date.parse("2026-09-08T09:00:00Z"));
    expect(utcDay(before)).toBe("2026-09-06");
  });

  it("takes a window from the caller, for the check that the fold changes nothing", () => {
    const before = foldBefore(Date.parse("2026-09-08T12:00:00Z"), 0);
    expect(new Date(before).toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });
});

describe("sumSql and removeSql", () => {
  const before = 1_788_000_000_000;

  /** One cutoff, two statements. A delete wider than the sum is a lost day. */
  it("bound the same rows by the same instant", () => {
    expect(sumSql(before)).toContain(`created_at < ${before}`);
    expect(removeSql(before)).toContain(`created_at < ${before}`);
  });

  it("keeps every breakdown a sponsor's report is made of", () => {
    for (const column of ["bout_number", "fighter_id", "sponsor_id"]) {
      expect(sumSql(before), column).toContain(column);
    }
    expect(sumSql(before)).toContain("COUNT(DISTINCT session_id)");
  });
});

/**
 * The one state a re-run must not walk into. D1 gives no transaction across two
 * statements, so a run interrupted after the sum leaves a day counted in both
 * tables — and summing it a second time would be undetectable afterwards.
 */
describe("halfFolded", () => {
  it("finds a day that is summed and still live", () => {
    expect(
      halfFolded([
        { event_id: "ev1", day: "2026-09-05", rows_folded: 40, summed: 0 },
        { event_id: "ev1", day: "2026-09-06", rows_folded: 12, summed: 1 },
      ]),
    ).toEqual([{ event_id: "ev1", day: "2026-09-06", rows_folded: 12, summed: 1 }]);
  });

  it("is quiet on an ordinary run", () => {
    expect(halfFolded([{ event_id: "ev1", day: "2026-09-05", rows_folded: 40, summed: 0 }])).toEqual(
      [],
    );
  });
});
