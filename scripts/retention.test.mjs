import { describe, expect, it } from "vitest";
import { RETENTION_DAYS } from "@/lib/consent";
import { PRUNE_AFTER_MS } from "@/lib/record-import";
import { foldBefore } from "./rollup-analytics.mjs";
import {
  IMPORT_CACHE_DAYS,
  alreadyClear,
  bucketKeys,
  clearStatements,
  cutoffDate,
  foldedAnalyticsCountSql,
  foldedAnalyticsDeleteSql,
  foldedAnalyticsWhere,
  lit,
  pastRetention,
  staleCacheCountSql,
  staleCacheDeleteSql,
} from "./retention.mjs";

/**
 * Which fighters the sweep takes, without the sweep.
 *
 * This is the one script here that destroys data on purpose, so the decision it
 * makes about each row is worth more scrutiny than the wrangler calls around it.
 * The case that matters most is the one at the bottom: a fighter still on a card
 * for a show that has not happened is never taken, however old their other shows
 * are.
 */

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-08T12:00:00Z");
const cutoff = cutoffDate(NOW, RETENTION_DAYS);
const cutoffMs = NOW - RETENTION_DAYS * DAY;

const row = (over = {}) => ({
  id: "f1",
  name: "Test Fighter",
  photo: null,
  cutout: null,
  stylised: null,
  created_at: NOW,
  on_card: null,
  invited: null,
  already_clear: 0,
  ...over,
});

describe("cutoffDate", () => {
  it("is the calendar day the retention window opens on", () => {
    expect(cutoffDate(NOW, 180)).toBe("2026-03-12");
    expect(cutoffDate(NOW, 0)).toBe("2026-09-08");
  });
});

describe("pastRetention", () => {
  it("takes a fighter whose last show is older than the window", () => {
    expect(pastRetention(row({ on_card: "2020-01-01" }), cutoff, cutoffMs)).toBe(true);
  });

  /**
   * The whole point of the rule. Somebody walking out next Saturday is not a
   * fighter nobody is putting on a card, whatever else is behind them.
   */
  it("never takes a fighter who is on a card for a show still to come", () => {
    expect(
      pastRetention(row({ on_card: "2026-09-19", invited: "2019-01-01" }), cutoff, cutoffMs),
    ).toBe(false);
  });

  /**
   * A bout removed from a card orphans the fighter, and the invite is what is
   * left saying which show they were for. Without reading it, an orphan would
   * look like somebody with no show at all.
   */
  it("reads an orphaned fighter's date off their invite", () => {
    expect(pastRetention(row({ on_card: null, invited: "2026-09-19" }), cutoff, cutoffMs)).toBe(
      false,
    );
    expect(pastRetention(row({ on_card: null, invited: "2019-01-01" }), cutoff, cutoffMs)).toBe(
      true,
    );
  });

  it("falls back to when the row was made where there is no show at all", () => {
    expect(pastRetention(row({ created_at: NOW }), cutoff, cutoffMs)).toBe(false);
    expect(pastRetention(row({ created_at: NOW - 400 * DAY }), cutoff, cutoffMs)).toBe(true);
  });

  it("takes the latest of the two dates rather than the first it finds", () => {
    expect(
      pastRetention(row({ on_card: "2019-01-01", invited: "2026-09-19" }), cutoff, cutoffMs),
    ).toBe(false);
  });
});

describe("alreadyClear", () => {
  it("separates a fighter with nothing left from one with details on them", () => {
    expect(alreadyClear(row({ already_clear: 1 }))).toBe(true);
    expect(alreadyClear(row())).toBe(false);
  });
});

describe("bucketKeys", () => {
  it("names every object of theirs that is ours to delete", () => {
    expect(
      bucketKeys(
        row({
          photo: "/media/fighters/f1-ab12.jpg",
          cutout: "/media/cutouts/f1-cd34.webp",
          stylised: "/media/portraits/f1-ef56.png",
        }),
      ),
    ).toEqual(["fighters/f1-ab12.jpg", "cutouts/f1-cd34.webp", "portraits/f1-ef56.png"]);
  });

  /** The seeded card's pictures are committed assets rather than stored objects. */
  it("leaves anything that is not in the bucket alone", () => {
    expect(bucketKeys(row({ photo: "/fighters/nadia-farrukh.webp" }))).toEqual([]);
    expect(bucketKeys(row({ photo: "/media/../etc/passwd" }))).toEqual([]);
  });
});

describe("clearStatements", () => {
  const sql = clearStatements("chloe-baines", NOW).join("\n");

  it("clears the fields a fighter sent and revokes their link", () => {
    for (const column of ["nickname", "hometown", "age", "photo", "cutout", "stylised", "bio"]) {
      expect(sql).toContain(`${column} = NULL`);
    }
    expect(sql).toContain("DELETE FROM fighter_sponsors");
    expect(sql).toContain("UPDATE invites SET revoked_at");
  });

  /** The running order is the promoter's, and a card with a hole in it is worse. */
  it("does not touch the name or the gym", () => {
    expect(sql).not.toMatch(/\bname = /);
    expect(sql).not.toMatch(/\bgym = /);
  });

  it("moves updated_at, so the bout's video is stale afterwards", () => {
    expect(sql).toContain(`updated_at = ${NOW}`);
  });
});

describe("lit", () => {
  it("escapes a quote rather than closing the string on it", () => {
    expect(lit("O'Rourke")).toBe("'O''Rourke'");
  });
});

/**
 * The two tables that grow whether or not anybody is looking.
 *
 * The counting one is the dangerous half. `analytics_events` is the only copy of
 * a show's numbers until the fold has been past it, so a sweep that took rows by
 * age alone would delete a promoter's evidence on any instance where the rollup
 * had never been scheduled — which is every instance, until somebody installs
 * the cron line.
 */
describe("the counting sweep", () => {
  const before = 1_788_000_000_000;

  it("takes only a day that has been summed already", () => {
    for (const sql of [foldedAnalyticsCountSql(before), foldedAnalyticsDeleteSql(before)]) {
      expect(sql).toContain("EXISTS (SELECT 1 FROM analytics_daily");
      expect(sql).toContain("d.event_id = analytics_events.event_id");
      // The same show-day, not merely some folded day of some show.
      expect(sql).toContain("d.day = date(analytics_events.created_at / 1000, 'unixepoch')");
    }
  });

  it("asks and deletes over exactly the same rows", () => {
    const where = foldedAnalyticsWhere(before);
    expect(foldedAnalyticsCountSql(before)).toContain(where);
    expect(foldedAnalyticsDeleteSql(before)).toContain(where);
  });

  it("never reaches past the fold's own window", () => {
    // The cutoff comes from the rollup script, so the sweep cannot be told to
    // take rows the fold has not looked at yet.
    expect(foldBefore(NOW)).toBeLessThanOrEqual(NOW - 48 * 3_600_000);
    expect(foldedAnalyticsWhere(foldBefore(NOW))).toContain(`created_at < ${foldBefore(NOW)}`);
  });
});

describe("the cache sweep", () => {
  /**
   * One month, in two places that must not drift: the importer prunes on its way
   * past, and this takes what is left on an instance nobody has imported on.
   */
  it("uses the same month the importer does", () => {
    expect(IMPORT_CACHE_DAYS * 86_400_000).toBe(PRUNE_AFTER_MS);
  });

  it("takes a cached page by when it was fetched", () => {
    expect(staleCacheCountSql(1_788_000_000_000)).toContain("fetched_at < 1788000000000");
    expect(staleCacheDeleteSql(1_788_000_000_000)).toContain("fetched_at < 1788000000000");
  });
});
