import { describe, expect, it } from "vitest";
import { parseTrackBody } from "@/lib/track";

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
