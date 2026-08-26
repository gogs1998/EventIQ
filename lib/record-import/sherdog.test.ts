import { describe, expect, it } from "vitest";
import { SHERDOG_AMATEUR_ONLY, SHERDOG_PROFILE } from "@/lib/record-import/fixtures/sherdog-profile";
import { parseSherdog } from "@/lib/record-import/sherdog";

/** Fixed, so the age assertions do not start failing on somebody's birthday. */
const NOW = new Date("2026-08-26T00:00:00Z");

describe("parseSherdog", () => {
  it("reads the fields a fighter would otherwise type in by hand", () => {
    const profile = parseSherdog(SHERDOG_PROFILE, NOW)!;

    expect(profile.name).toBe("Conor McGregor");
    expect(profile.nickname).toBe("Notorious");
    expect(profile.gym).toBe("SBG Ireland");
    expect(profile.heightCm).toBe(173);
  });

  it("works out the age from the date of birth, not the printed number", () => {
    // Born 14 July 1988, so 38 on this date and 37 a month earlier. Sherdog
    // prints 38 either way once its own cache is stale.
    expect(parseSherdog(SHERDOG_PROFILE, NOW)!.age).toBe(38);
    expect(parseSherdog(SHERDOG_PROFILE, new Date("2026-06-01T00:00:00Z"))!.age).toBe(37);
  });

  it("prefers the amateur table over the professional headline record", () => {
    const profile = parseSherdog(SHERDOG_PROFILE, NOW)!;

    // The page says 22-7 as a professional and holds one amateur win. Everyone
    // on one of these cards is an amateur, so the small number is the right one.
    expect(profile.record).toEqual({ w: 1, l: 0, d: 0 });
    expect(profile.recordKind).toBe("amateur");
  });

  it("counts wins, losses and draws off the amateur rows", () => {
    const profile = parseSherdog(SHERDOG_AMATEUR_ONLY, NOW)!;
    expect(profile.record).toEqual({ w: 2, l: 1, d: 1 });
  });

  it("counts a finish only where the method says it ended early", () => {
    // Two wins: one by TKO, one by decision. The submission on the page is a
    // loss, so it must not turn up in this fighter's finishes.
    expect(parseSherdog(SHERDOG_AMATEUR_ONLY, NOW)!.finishes).toEqual({ ko: 1, sub: 0 });
  });

  it("falls back to the professional record and says that is what it is", () => {
    const withoutAmateur = SHERDOG_PROFILE.replace("FIGHT HISTORY - AMATEUR", "FIGHT HISTORY - PRO");
    const profile = parseSherdog(withoutAmateur, NOW)!;

    expect(profile.record).toEqual({ w: 22, l: 7, d: 0 });
    expect(profile.finishes).toEqual({ ko: 19, sub: 1 });
    expect(profile.recordKind).toBe("professional");
  });

  it("does not turn a no contest into a win, a loss or a draw", () => {
    // A no contest is none of the three, and inventing a bucket for it here
    // would put a number on the card that the fighter's own record does not
    // contain. Sherdog marks them with the same final_result class.
    const withNoContest = SHERDOG_AMATEUR_ONLY.replace(
      '<span class="final_result draw">draw</span>',
      '<span class="final_result nc">NC</span>',
    );
    expect(parseSherdog(withNoContest, NOW)!.record).toEqual({ w: 2, l: 1, d: 0 });
  });

  it("returns null for a page it does not recognise", () => {
    expect(parseSherdog("<html><body>Page not found</body></html>", NOW)).toBeNull();
  });

  it("returns a profile with no record rather than nothing when there are no fights", () => {
    // A fighter with a page and no bouts on it is common and is not an error.
    // It must not come back as a debut either: an empty page is silence.
    const profile = parseSherdog(
      '<h1 itemprop="name"><span class="fn">New Starter</span></h1>',
      NOW,
    )!;
    expect(profile.name).toBe("New Starter");
    expect(profile.record).toBeUndefined();
  });

  it("never reports a fighter as reachable when the page is a bot challenge", () => {
    expect(parseSherdog("<title>Just a moment...</title>", NOW)).toBeNull();
  });
});
