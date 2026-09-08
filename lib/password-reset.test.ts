import { describe, expect, it } from "vitest";
import { RESET_TOKEN_TTL_MS, resetExpiry, resetUsable } from "@/lib/password-reset";

/**
 * A reset link travels through a channel nobody here controls — a phone call, a
 * message, a note handed over — so the two bounds on it are the whole of its
 * security once it has left the operator's terminal. Both are pure, so both are
 * held here rather than only in a page nobody reads twice.
 */

const NOW = 1_700_000_000_000;

describe("how long a reset link lasts", () => {
  it("is half an hour, not a day", () => {
    expect(RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
    expect(resetExpiry(NOW)).toBe(NOW + RESET_TOKEN_TTL_MS);
  });

  it("opens the account while it is fresh", () => {
    const link = { expiresAt: resetExpiry(NOW), usedAt: null };
    expect(resetUsable(link, NOW)).toBe(true);
    expect(resetUsable(link, NOW + RESET_TOKEN_TTL_MS - 1)).toBe(true);
  });

  /**
   * The boundary is closed rather than open. A link that expires at exactly this
   * millisecond has expired: the cheaper mistake by far is the one where a link
   * stops working a millisecond early.
   */
  it("stops the moment it is due to", () => {
    const link = { expiresAt: resetExpiry(NOW), usedAt: null };
    expect(resetUsable(link, NOW + RESET_TOKEN_TTL_MS)).toBe(false);
    expect(resetUsable(link, NOW + RESET_TOKEN_TTL_MS + 1)).toBe(false);
  });
});

describe("spending a reset link", () => {
  it("works once, so a link forwarded twice sets one password", () => {
    const spent = { expiresAt: resetExpiry(NOW), usedAt: NOW + 1000 };
    expect(resetUsable(spent, NOW + 2000)).toBe(false);
  });

  /**
   * Being spent outlives being fresh. A link used a minute ago is dead for the
   * remaining twenty-nine, which is the case that matters: an attacker who sees
   * the link after the promoter has used it gets nothing.
   */
  it("stays spent for the rest of its half hour", () => {
    const spent = { expiresAt: resetExpiry(NOW), usedAt: NOW + 60_000 };
    expect(resetUsable(spent, NOW + 61_000)).toBe(false);
    expect(resetUsable(spent, NOW + RESET_TOKEN_TTL_MS - 1)).toBe(false);
  });

  /** Zero is a real timestamp in this scheme, and it means used. */
  it("does not mistake a falsy stamp for an unused link", () => {
    expect(resetUsable({ expiresAt: NOW + 1000, usedAt: 0 }, NOW)).toBe(false);
  });
});
