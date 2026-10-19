import { describe, expect, it } from "vitest";
import { slugsFrom } from "./render-slugs.mjs";

/**
 * The hourly run's list of shows. Every failure here used to come out as an
 * empty list, which the workflow reads as a quiet hour and reports green.
 */
describe("slugsFrom", () => {
  it("reads the slugs out of wrangler's answer", () => {
    const raw = JSON.stringify([
      { results: [{ slug: "cage-county-12" }, { slug: "budo-80" }], success: true, meta: {} },
    ]);
    expect(slugsFrom(raw)).toEqual(["cage-county-12", "budo-80"]);
  });

  it("answers an empty list for an hour with nothing in the window", () => {
    expect(slugsFrom(JSON.stringify([{ results: [], success: true }]))).toEqual([]);
  });

  it("refuses wrangler's error object rather than reading it as no shows", () => {
    const raw = JSON.stringify({ error: { text: "A request to the Cloudflare API failed.", notes: [] } });
    expect(() => slugsFrom(raw)).toThrow(/Cloudflare API failed/);
  });

  it("refuses an answer that is not JSON, or not the shape it should be", () => {
    expect(() => slugsFrom("")).toThrow(/not answer with JSON/);
    expect(() => slugsFrom("Please log in")).toThrow(/not answer with JSON/);
    expect(() => slugsFrom("[]")).toThrow(/not a list of results/);
    expect(() => slugsFrom(JSON.stringify([{ success: false, error: "D1_ERROR" }]))).toThrow(/query failed/);
    expect(() => slugsFrom(JSON.stringify([{ meta: {} }]))).toThrow(/no results list/);
    expect(() => slugsFrom(JSON.stringify([{ results: [{ name: "x" }] }]))).toThrow(/no slug/);
  });
});
