/**
 * The rule a reset link is held to.
 *
 * There is no email here and no SMS, so a reset is not something a promoter can
 * start on their own: an operator mints a link with
 * `npm run promoter -- reset-link` and hands it over by whatever channel they
 * already use — a phone call, a message, standing next to them. That channel is
 * not ours and cannot be assumed private, which is what decides both halves of
 * this: the link dies half an hour after it was made, and it works exactly once.
 *
 * Half an hour rather than a day because the honest use is somebody who has just
 * asked for it and is at their laptop now. Anything longer is a working password
 * sitting in a WhatsApp thread for the rest of the week.
 *
 * Pure, so both branches are testable without a database. lib/auth.ts holds the
 * digest, db/schema.ts the row, and the page under app/promoter/reset is what
 * spends one.
 */

/** Half an hour from minting, and no way to extend it short of a new link. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function resetExpiry(now: number): number {
  return now + RESET_TOKEN_TTL_MS;
}

export type ResetRow = {
  expiresAt: number;
  /** Null until it is spent. Non-null is the whole of "already used". */
  usedAt: number | null;
};

/**
 * Whether this link will still open the account.
 *
 * Expiry and use are checked together and answered as one boolean, because the
 * holder can do nothing different with the difference and the page says the same
 * sentence either way — a link that has expired and a link somebody else has
 * already spent both mean "ask for another".
 */
export function resetUsable(row: ResetRow, now: number): boolean {
  return row.usedAt === null && now < row.expiresAt;
}
