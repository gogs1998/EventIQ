import { describe, expect, it } from "vitest";
import { countableRequest, parseTrackBody } from "@/lib/track";

/**
 * /api/track takes no credential, because the beacon is sent as the page goes.
 * So the only thing standing between a stranger and the numbers a promoter hands
 * a sponsor is what this will accept, and it answers 204 either way — a caller
 * must not be able to learn from it which shows exist.
 */
const open = { slug: "cage-county-12", kind: "programme_open" };

describe("parseTrackBody", () => {
  it("takes a programme open with nothing else on it", () => {
    expect(parseTrackBody(open)).toEqual({
      slug: "cage-county-12",
      kind: "programme_open",
      boutNumber: null,
      fighterId: null,
      sponsorId: null,
      sessionId: null,
    });
  });

  it("takes the tap that names all three", () => {
    expect(
      parseTrackBody({
        slug: "cage-county-12",
        kind: "sponsor_tap",
        boutNumber: 15,
        fighterId: "nadia-farrukh",
        sponsorId: "mouthguards-pro",
        sessionId: "0b9c1f2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
      }),
    ).toEqual({
      slug: "cage-county-12",
      kind: "sponsor_tap",
      boutNumber: 15,
      fighterId: "nadia-farrukh",
      sponsorId: "mouthguards-pro",
      sessionId: "0b9c1f2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
    });
  });

  it("refuses a kind that is not one of the five", () => {
    expect(parseTrackBody({ ...open, kind: "sponsor_purchase" })).toBeNull();
    expect(parseTrackBody({ ...open, kind: "" })).toBeNull();
    expect(parseTrackBody({ slug: "cage-county-12" })).toBeNull();
  });

  it("refuses anything that is not a slug in the slug", () => {
    expect(parseTrackBody({ ...open, slug: "Cage County 12" })).toBeNull();
    expect(parseTrackBody({ ...open, slug: "../../etc" })).toBeNull();
    expect(parseTrackBody({ ...open, slug: "a".repeat(65) })).toBeNull();
    expect(parseTrackBody({ ...open, slug: "" })).toBeNull();
    expect(parseTrackBody({ ...open, slug: 12 })).toBeNull();
  });

  it("refuses a body that is not an object at all", () => {
    expect(parseTrackBody(null)).toBeNull();
    expect(parseTrackBody("programme_open")).toBeNull();
    expect(parseTrackBody([])).toBeNull();
  });

  /**
   * Absent is allowed and malformed is not. A programme open carries no bout
   * number; a bout number that is not one is a caller doing something other than
   * reading a programme.
   */
  it("refuses a bout number that is not a place in a running order", () => {
    expect(parseTrackBody({ ...open, boutNumber: 0 })).toBeNull();
    expect(parseTrackBody({ ...open, boutNumber: -1 })).toBeNull();
    expect(parseTrackBody({ ...open, boutNumber: 1.5 })).toBeNull();
    expect(parseTrackBody({ ...open, boutNumber: 1000 })).toBeNull();
    expect(parseTrackBody({ ...open, boutNumber: "15" })).toBeNull();
    expect(parseTrackBody({ ...open, boutNumber: null })?.boutNumber).toBeNull();
  });

  it("refuses an id that is not shaped like one of ours", () => {
    expect(parseTrackBody({ ...open, fighterId: "nadia farrukh" })).toBeNull();
    expect(parseTrackBody({ ...open, fighterId: "a".repeat(65) })).toBeNull();
    expect(parseTrackBody({ ...open, sponsorId: { id: "x" } })).toBeNull();
    expect(parseTrackBody({ ...open, sponsorId: "" })?.sponsorId).toBeNull();
  });

  /**
   * Bounded rather than parsed. It only has to be distinct within one show, so
   * there is no reason to keep more of a value than the count requires — and no
   * reason to let a caller choose how much of it there is.
   */
  it("bounds the session id", () => {
    expect(parseTrackBody({ ...open, sessionId: "x".repeat(37) })).toBeNull();
    expect(parseTrackBody({ ...open, sessionId: "short" })).toBeNull();
    expect(parseTrackBody({ ...open, sessionId: "<script>alert(1)</script>" })).toBeNull();
    expect(parseTrackBody({ ...open, sessionId: "0b9c1f2e-3a4b-4c5d-8e6f-7a8b" })?.sessionId).toBe(
      "0b9c1f2e-3a4b-4c5d-8e6f-7a8b",
    );
  });

  it("takes what the programme itself sends, which is the point of the bounds", () => {
    const sessionId = crypto.randomUUID();
    expect(parseTrackBody({ ...open, kind: "bout_expand", boutNumber: 3, sessionId })).toEqual({
      slug: "cage-county-12",
      kind: "bout_expand",
      boutNumber: 3,
      fighterId: null,
      sponsorId: null,
      sessionId,
    });
  });
});

/**
 * The other half of the same argument. `parseTrackBody` decides whether a body
 * describes an interaction; this decides whether the caller is a person having
 * one. The guess falls towards not counting, which is the opposite direction
 * from lib/bots.ts and for the opposite reason — see countableRequest.
 */
const beacon = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  secFetchMode: "no-cors",
  secFetchSite: "same-origin",
  secFetchDest: "empty",
};

describe("countableRequest", () => {
  it("counts a spectator's beacon", () => {
    expect(countableRequest(beacon)).toBe(true);
    // A fetch() rather than sendBeacon, which is the fallback in lib/analytics.
    expect(countableRequest({ ...beacon, secFetchMode: "cors" })).toBe(true);
    expect(countableRequest({ ...beacon, secFetchSite: "same-site" })).toBe(true);
  });

  it("drops the fetchers and the crawlers", () => {
    for (const userAgent of [
      "WhatsApp/2.24.9.78 A",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
      "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    ]) {
      expect(countableRequest({ ...beacon, userAgent }), userAgent).toBe(false);
    }
  });

  /**
   * The browser walkthrough is real Chrome and writes as it goes. Its taps are a
   * test run rather than a spectator, and they must not reach a sponsor's
   * report — which is why the headless list is separate from the unfurler one.
   */
  it("drops a headless browser and a scripted client", () => {
    for (const userAgent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
      "curl/8.7.1",
      "python-requests/2.32.3",
      "Go-http-client/2.0",
      "okhttp/4.12.0",
      "PostmanRuntime/7.39.0",
    ]) {
      expect(countableRequest({ ...beacon, userAgent }), userAgent).toBe(false);
    }
  });

  it("drops a caller with no agent at all", () => {
    expect(countableRequest({ ...beacon, userAgent: null })).toBe(false);
    expect(countableRequest({ ...beacon, userAgent: "" })).toBe(false);
  });

  /**
   * Every browser that can send a beacon sends these. A POST carrying none of
   * them is something holding an HTTP client, whatever its agent claims.
   */
  it("drops a request with none of the headers a browser sends", () => {
    expect(
      countableRequest({ ...beacon, secFetchMode: null, secFetchSite: null, secFetchDest: null }),
    ).toBe(false);
    // Any one of the three is enough, because they arrive together or not at all.
    expect(countableRequest({ ...beacon, secFetchMode: null, secFetchDest: null })).toBe(true);
  });

  it("drops a post from somewhere that is not the programme", () => {
    expect(countableRequest({ ...beacon, secFetchSite: "cross-site" })).toBe(false);
    // Typed into an address bar, or sent by something with no page behind it.
    expect(countableRequest({ ...beacon, secFetchSite: "none" })).toBe(false);
    expect(countableRequest({ ...beacon, secFetchSite: "Cross-Site" })).toBe(false);
  });
});
