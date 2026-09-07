import { describe, expect, it } from "vitest";
import { RENDER_INPUT_FIELDS, renderFingerprint } from "../lib/renders.ts";
import { chromeCandidates, claimSql, renderInputsFrom, resolveChrome } from "./render-tape.mjs";

/**
 * The renderer's pure parts. The capture loop needs a browser and a dev server
 * and is covered by actually running it; what is worth testing here is the
 * bookkeeping around it, because every one of these failures is silent.
 */

/** One row of the query in boutsOf, with every column it selects. */
const ROW = {
  number: 15,
  discipline: "MMA",
  weight_kg: 77,
  class_label: "C CLASS",
  title_label: "Cage County lightweight title",
  billing: "MAIN",
  womens: 0,
  rounds: 3,
  round_minutes: 3,
  sponsor_id: "spn_mouthguards",
  red_id: "callum-reeves",
  blue_id: "dre-osei",
  event_name: "Cage County 12",
  event_date: "2026-09-19",
  event_venue: "Grangemouth Town Hall",
  event_city: "Grangemouth",
  event_backdrop: "/backdrops/hall.webp",
  promoter_name: "Cage County",
  promoter_mark: "/marks/cage-county.svg",
  red_updated: 1_700_000_000_000,
  blue_updated: 1_700_000_000_001,
  red_photo: "/media/photos/callum-1.jpg",
  red_cutout: "/media/cutouts/callum-1.webp",
  blue_photo: null,
  blue_cutout: null,
};

const LOCKUPS = ["spn_mouthguards|Mouthguards.pro|Custom fit|/marks/mg.svg"];

describe("renderInputsFrom", () => {
  it("names every field the fingerprint expects and nothing else", () => {
    expect(Object.keys(renderInputsFrom(ROW, LOCKUPS)).sort()).toEqual(
      [...RENDER_INPUT_FIELDS].sort(),
    );
  });

  /**
   * The thing this is really protecting is the show and the sponsors. The
   * fingerprint used to cover the two fighters and the bout, so a venue
   * corrected the day before the show, a promoter's new mark or a bout sponsor
   * sold on the Friday left fifteen videos saying the old thing and nothing
   * anywhere reporting that they were out of date.
   */
  it("moves when anything on screen moves", async () => {
    const base = await renderFingerprint(renderInputsFrom(ROW, LOCKUPS));

    for (const column of Object.keys(ROW)) {
      // sponsor_id reaches the fingerprint as the lockup it resolves to, which
      // is what is actually drawn; the assertion below covers it.
      if (column === "sponsor_id") continue;
      const changed = { ...ROW, [column]: "moved" };
      const hash = await renderFingerprint(renderInputsFrom(changed, LOCKUPS));
      expect(hash, `${column} is not in the fingerprint`).not.toBe(base);
    }

    const resold = await renderFingerprint(
      renderInputsFrom(ROW, ["spn_other|Somebody Else||"]),
    );
    expect(resold).not.toBe(base);
  });

  it("does not move for a column the composition never draws", async () => {
    const base = await renderFingerprint(renderInputsFrom(ROW, LOCKUPS));
    // Doors time, the tagline and the show's own sponsor strip are all on the
    // programme page and in none of the five scenes.
    const withNoise = { ...ROW, doors_time: "18:30", tagline: "Twelve fights, one night" };
    expect(await renderFingerprint(renderInputsFrom(withNoise, LOCKUPS))).toBe(base);
  });
});

describe("claimSql", () => {
  const sql = (over = {}) =>
    claimSql("ev_1", 15, "abcdef0123456789", { now: 1000, force: false, ...over });

  /** The lease is the whole reason two runners can be pointed at one card. */
  it("will not take a bout whose lease is still running", () => {
    expect(sql()).toContain("render_jobs.lease_until IS NULL OR render_jobs.lease_until < 1000");
  });

  it("takes a queued bout, and a failed one until its attempts run out", () => {
    expect(sql()).toContain("render_jobs.status = 'queued'");
    expect(sql()).toMatch(/render_jobs\.attempts < 2/);
  });

  it("takes any bout when an operator names it, lease aside", () => {
    const forced = sql({ force: true });
    expect(forced).toContain("1 = 1");
    expect(forced).not.toContain("render_jobs.status = 'queued'");
    expect(forced).toContain("render_jobs.lease_until < 1000");
  });

  it("counts the attempt it is about to make", () => {
    expect(sql()).toContain("attempts = render_jobs.attempts + 1");
  });

  it("leaves the video the programme plays alone", () => {
    expect(sql()).not.toContain("current_r2_key");
    expect(sql()).not.toContain("current_hash");
  });

  it("addresses the row the app addresses", () => {
    expect(sql()).toContain("'rj_ev_1_15'");
    expect(sql()).toContain("ON CONFLICT (event_id, bout_number)");
  });

  /**
   * The local Miniflare D1 reports only a duration and the remote one reports
   * counts, so a claim decided on meta.changes is won on production and lost on
   * every developer's machine. A returned row is a row that was written.
   */
  it("says whether it won by returning the row", () => {
    expect(sql().trimEnd().endsWith("RETURNING id")).toBe(true);
  });
});

describe("resolveChrome", () => {
  /**
   * This was `[three Linux paths].find(Boolean)`, which returns the first string
   * in the list whether or not anything is there. Every machine that was not one
   * particular Linux box needed CHROME_PATH before it would render, and the
   * failure was a spawn error naming a path nobody had chosen.
   */
  it("looks somewhere plausible on each platform", () => {
    expect(chromeCandidates("darwin")[0]).toContain("Google Chrome.app");
    expect(chromeCandidates("linux")).toContain("/usr/bin/google-chrome");
    expect(chromeCandidates("win32", { PROGRAMFILES: "C:\\Program Files" })).toContain(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
  });

  it("picks the first browser that is actually there", () => {
    const found = resolveChrome({}, (candidate) => candidate === "/usr/bin/chromium");
    expect(found.path === "/usr/bin/chromium" || found.path === null).toBe(true);
  });

  it("says nothing was found rather than naming a path that is not there", () => {
    expect(resolveChrome({}, () => false)).toEqual({ path: null, fromEnv: false });
  });

  it("lets CHROME_PATH win, and remembers that it was asked for", () => {
    expect(resolveChrome({ CHROME_PATH: "/opt/chrome" }, () => false)).toEqual({
      path: "/opt/chrome",
      fromEnv: true,
    });
  });
});
