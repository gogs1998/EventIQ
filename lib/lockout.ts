/**
 * The bound on guessing one promoter's password.
 *
 * The limiter at the edge counts callers, which is the right shape for a flood
 * and the wrong shape for the attack that actually matters here: there is one
 * promoter and one password, so a patient guess from a thousand addresses is a
 * thousand callers each well inside their allowance. The account has to hold a
 * count of its own for that to be caught at all.
 *
 * It is a window rather than a running total, and the window is not extended by
 * attempts made while the account is locked. That is deliberate. A lockout that
 * an attacker can keep renewing is a way of keeping the promoter out of their
 * own dashboard on show night, which is a worse outcome than the guessing —
 * there is nobody to ring for a reset. So the door opens again fifteen minutes
 * after the window began, whatever anyone does in the meantime, and a guess of
 * any real size is still cut to forty attempts an hour.
 *
 * Pure, so every branch of it is testable without a database. The columns it
 * reads and returns live on the promoter row; lib/session.ts is what writes
 * them.
 */

/** Ten wrong passwords in the window locks the account. */
export const LOCKOUT_ATTEMPTS = 10;

/** And it stays locked until fifteen minutes after the first of them. */
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export type LoginFailures = {
  failedLogins: number;
  firstFailedLoginAt: number | null;
};

/** Nothing held against this account: what a successful sign-in restores. */
export const NO_FAILURES: LoginFailures = { failedLogins: 0, firstFailedLoginAt: null };

function withinWindow(failures: LoginFailures, now: number): boolean {
  return failures.firstFailedLoginAt !== null && now - failures.firstFailedLoginAt < LOCKOUT_WINDOW_MS;
}

/** Whether this account is closed to any password at all just now. */
export function lockedOut(failures: LoginFailures, now: number): boolean {
  return failures.failedLogins >= LOCKOUT_ATTEMPTS && withinWindow(failures, now);
}

/**
 * The counters after one more wrong password. A failure outside the window opens
 * a new one, so an old attempt from a month ago is not half a lockout.
 */
export function afterFailure(failures: LoginFailures, now: number): LoginFailures {
  if (!withinWindow(failures, now)) return { failedLogins: 1, firstFailedLoginAt: now };
  return { failedLogins: failures.failedLogins + 1, firstFailedLoginAt: failures.firstFailedLoginAt };
}
