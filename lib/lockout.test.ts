import { describe, expect, it } from "vitest";
import {
  LOCKOUT_ATTEMPTS,
  LOCKOUT_WINDOW_MS,
  NO_FAILURES,
  afterFailure,
  lockedOut,
} from "@/lib/lockout";

/**
 * The edge limiter counts callers. There is one promoter and one password, so
 * the guess worth defending against is the patient one spread across a lot of
 * addresses, and every one of those callers is inside their allowance. This is
 * the half that counts the account instead.
 */
const NOW = 1_700_000_000_000;

describe("lockedOut", () => {
  it("lets a promoter who has fumbled it a few times keep trying", () => {
    expect(lockedOut(NO_FAILURES, NOW)).toBe(false);
    expect(lockedOut({ failedLogins: 9, firstFailedLoginAt: NOW - 1000 }, NOW)).toBe(false);
  });

  it("closes the account on the tenth wrong password in the window", () => {
    expect(lockedOut({ failedLogins: LOCKOUT_ATTEMPTS, firstFailedLoginAt: NOW - 1000 }, NOW)).toBe(
      true,
    );
  });

  /**
   * The window is not extended by knocking, so an attacker cannot keep the
   * promoter out of their own dashboard on show night. There is nobody to ring
   * for a reset, and that outcome is worse than the guessing.
   */
  it("opens again once the window has passed, however many attempts there were", () => {
    const shut = { failedLogins: 400, firstFailedLoginAt: NOW - LOCKOUT_WINDOW_MS };
    expect(lockedOut(shut, NOW)).toBe(false);
    expect(lockedOut(shut, NOW - 1)).toBe(true);
  });

  it("treats a count with no window as nothing held, rather than as a lock", () => {
    expect(lockedOut({ failedLogins: 99, firstFailedLoginAt: null }, NOW)).toBe(false);
  });
});

describe("afterFailure", () => {
  it("opens a window on the first wrong password", () => {
    expect(afterFailure(NO_FAILURES, NOW)).toEqual({ failedLogins: 1, firstFailedLoginAt: NOW });
  });

  it("counts up inside the window without moving its start", () => {
    expect(afterFailure({ failedLogins: 3, firstFailedLoginAt: NOW - 60_000 }, NOW)).toEqual({
      failedLogins: 4,
      firstFailedLoginAt: NOW - 60_000,
    });
  });

  it("starts a fresh window when the last failure was long ago", () => {
    expect(
      afterFailure({ failedLogins: 9, firstFailedLoginAt: NOW - LOCKOUT_WINDOW_MS - 1 }, NOW),
    ).toEqual({ failedLogins: 1, firstFailedLoginAt: NOW });
  });

  it("takes ten failures in the window to shut the door, and no fewer", () => {
    let failures = NO_FAILURES;
    for (let attempt = 0; attempt < LOCKOUT_ATTEMPTS - 1; attempt += 1) {
      failures = afterFailure(failures, NOW);
      expect(lockedOut(failures, NOW)).toBe(false);
    }
    expect(lockedOut(afterFailure(failures, NOW), NOW)).toBe(true);
  });
});
