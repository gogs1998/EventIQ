import { describe, expect, it } from "vitest";
import { cachedTape } from "@/lib/record-import";

/**
 * The cache row holds a payload we wrote ourselves, which is exactly why nothing
 * was checking it. A truncated write or a row edited by hand answered a
 * fighter's pasted link with a 500 on the questionnaire; an unreadable payload
 * is a lookup to do again, not an error to show somebody.
 */
describe("cachedTape", () => {
  it("gives back a tape we stored", () => {
    const stored = JSON.stringify({
      source: "sherdog",
      record: { w: 3, l: 1, d: 0 },
      notCovered: ["Reach"],
    });
    expect(cachedTape(stored)?.record).toEqual({ w: 3, l: 1, d: 0 });
  });

  it("treats a payload that will not parse as no cache at all", () => {
    expect(cachedTape("{ truncated")).toBeUndefined();
    expect(cachedTape("")).toBeUndefined();
  });

  it("refuses something that parses but is not a tape", () => {
    expect(cachedTape('"sherdog"')).toBeUndefined();
    expect(cachedTape("null")).toBeUndefined();
    expect(cachedTape("{}")).toBeUndefined();
  });
});
