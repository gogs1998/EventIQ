import { describe, expect, it } from "vitest";
import { RENDER_INPUT_FIELDS, renderFingerprint } from "../lib/renders.ts";
import { brokenImageMessage, claimSql, renderInputsFrom, sameOrigin } from "./render-tape.mjs";

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

/**
 * Which requests carry the render key.
 *
 * The key went out on every request, then on the document alone, and the second
 * of those broke every draft render: /media asks the same question the capture
 * page does, so the page's own portraits came back 404 and the bout rendered
 * empty. Same-origin is the boundary — the concern was a sponsor mark on
 * somebody else's host, and that is precisely what an origin test excludes.
 */
describe("sameOrigin", () => {
  const BASE = "https://eventiq.win";

  it("takes the capture page itself", () => {
    expect(sameOrigin(`${BASE}/render/budo-fighting-championship/6`, BASE)).toBe(true);
  });

  /** The bug: a draft show's cutouts are refused without the key. */
  it("takes the page's own /media requests", () => {
    expect(sameOrigin(`${BASE}/media/cutouts/owen-pryce-ab12.webp`, BASE)).toBe(true);
  });

  it("refuses somebody else's host", () => {
    expect(sameOrigin("https://cdn.example.com/sponsor-mark.svg", BASE)).toBe(false);
    // A prefix match on the base URL would have sent the key here.
    expect(sameOrigin("https://eventiq.win.example.com/mark.svg", BASE)).toBe(false);
  });

  /** Same host, no https: a header sent there goes out in the clear. */
  it("refuses the same host on another scheme", () => {
    expect(sameOrigin("http://eventiq.win/media/cutouts/a-b.webp", BASE)).toBe(false);
  });

  it("holds for a local render, port and all", () => {
    const local = "http://localhost:3402";
    expect(sameOrigin(`${local}/media/cutouts/a-b.webp`, local)).toBe(true);
    expect(sameOrigin("http://localhost:3000/media/cutouts/a-b.webp", local)).toBe(false);
  });

  it("refuses anything that is not an address", () => {
    expect(sameOrigin("data:image/png;base64,iVBORw0K", BASE)).toBe(false);
    expect(sameOrigin("", BASE)).toBe(false);
  });
});

describe("brokenImageMessage", () => {
  it("names the first broken source, because that is what gets curled", () => {
    expect(brokenImageMessage(["https://eventiq.win/media/cutouts/owen-ab12.webp"])).toContain(
      "/media/cutouts/owen-ab12.webp",
    );
  });

  it("counts the rest rather than listing a card's worth of them", () => {
    const message = brokenImageMessage(["/media/a.webp", "/media/b.webp", "/media/c.webp"]);
    expect(message).toContain("/media/a.webp");
    expect(message).toContain("and 2 other images");
    expect(message).not.toContain("/media/c.webp");
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

  /**
   * The first run from CI rendered the ten bouts with no row at all and reported
   * the five finished before the pipeline existed — `done`, with a key and no
   * current_hash — as left to another runner, and would have done so every hour
   * forever. A finished row that does not match the bout as it stands is stale,
   * which is what --stale selected it for. `IS NOT` rather than `<>`, because
   * `<>` against a NULL hash is NULL and a NULL is not a true.
   */
  it("takes a finished bout whose published video is not of this bout", () => {
    expect(sql()).toContain("render_jobs.status = 'done'");
    expect(sql()).toContain("render_jobs.current_hash IS NOT 'abcdef0123456789'");
    expect(sql()).not.toContain("current_hash <>");
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

  /**
   * Reading current_hash to decide whether a finished render is still of this
   * bout is not writing it: those two columns are the video the programme plays
   * and only a successful publish touches them, so this looks at what the
   * statement writes rather than at the whole of its text.
   */
  it("leaves the video the programme plays alone", () => {
    const written = sql().slice(0, sql().indexOf("WHERE (render_jobs.lease_until"));
    expect(written).not.toContain("current_r2_key");
    expect(written).not.toContain("current_hash");
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
