import { describe, expect, it } from "vitest";
import {
  FETCHES_PER_HOUR,
  PARSER_VERSION,
  UNATTRIBUTED_SCOPE,
  cacheKeyFor,
  cachedTape,
  eventScope,
  promoterScope,
  withinFetchBudget,
} from "@/lib/record-import";

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

/**
 * The cache holds what the parser made of a page rather than the page, so a
 * parser fix fixes nothing for anybody whose row is already there — and the
 * person most likely to press the button again is the one whose page did not
 * read properly the first time. The version in the key makes a parser change a
 * different row rather than a week of payloads nobody can clear.
 */
describe("the cache key", () => {
  it("carries the parser version, so a fix does not wait a week", () => {
    const key = cacheKeyFor("https://www.sherdog.com/fighter/owen-pryce-1");
    expect(key).toContain("https://www.sherdog.com/fighter/owen-pryce-1");
    expect(key).toBe(`https://www.sherdog.com/fighter/owen-pryce-1#p${PARSER_VERSION}`);
  });

  it("keeps two fighters apart within one version", () => {
    expect(cacheKeyFor("https://www.sherdog.com/fighter/a-1")).not.toBe(
      cacheKeyFor("https://www.sherdog.com/fighter/a-2"),
    );
  });
});

/**
 * The hourly ceiling used to be counted across everybody, which made it a way
 * for one busy promoter to pause every other promoter's lookups — and the
 * promoter working down an undercard is the person this feature is for. The
 * scopes are what it is counted against now.
 */
describe("the fetch budget", () => {
  it("tells a promoter, a show and an unattributed caller apart", () => {
    expect(promoterScope("pr_1")).not.toBe(promoterScope("pr_2"));
    expect(promoterScope("x")).not.toBe(eventScope("x"));
    expect(eventScope("ev_1")).not.toBe(UNATTRIBUTED_SCOPE);
  });

  it("stops at the ceiling rather than one past it", () => {
    expect(withinFetchBudget(FETCHES_PER_HOUR - 1)).toBe(true);
    expect(withinFetchBudget(FETCHES_PER_HOUR)).toBe(false);
  });

  /** Two full fifteen-bout cards, which is more than a promoter needs in an hour. */
  it("is generous enough for a whole card and then some", () => {
    expect(FETCHES_PER_HOUR).toBeGreaterThanOrEqual(60);
  });
});
