/**
 * Promoter-side demo data: the things a promoter knows that a spectator does
 * not. Kept out of event.ts because none of it is published.
 *
 * The date is pinned rather than using the real clock, so the demo always reads
 * as fourteen days out from the show — which is the moment this product is
 * actually useful, and the moment a promoter recognises.
 */

export const AS_OF = "2026-10-31";

export type InviteStatus =
  /** No phone number for them yet, so nothing has gone out. */
  | "not-sent"
  /** Link sent, never opened. */
  | "sent"
  /** Opened it and walked away. The warmest lead on the list. */
  | "opened"
  /** Finished. */
  | "submitted";

export type Invite = {
  status: InviteStatus;
  sentAt?: string;
  lastOpenedAt?: string;
};

/**
 * Overrides for fighters whose situation is not obvious from their profile.
 * Everyone else is derived: finished profiles are submitted, part-filled ones
 * were opened, empty ones were merely sent.
 */
export const INVITE_OVERRIDES: Record<string, Invite> = {
  // Opened it, had a look, did nothing. These are the ones worth a nudge.
  "chloe-baines": { status: "opened", sentAt: "2026-10-21", lastOpenedAt: "2026-10-24" },
  "owen-pryce": { status: "opened", sentAt: "2026-10-21", lastOpenedAt: "2026-10-29" },
  "gary-boothroyd": { status: "opened", sentAt: "2026-10-22", lastOpenedAt: "2026-10-23" },
  "connor-slack": { status: "opened", sentAt: "2026-10-22", lastOpenedAt: "2026-10-27" },
  // No number for them yet — the promoter's own job, not the fighter's.
  "sam-whitlock": { status: "not-sent" },
  "amelia-kerr": { status: "not-sent" },
};

/**
 * Numbers from the previous show. This is the panel that turns a sponsor
 * conversation from a favour into a transaction, so it is the evidence a
 * promoter would actually want in their hand.
 */
export const LAST_SHOW = {
  name: "Cage County 11",
  date: "2026-08-15",
  ticketsSold: 604,
  programmeOpens: 812,
  boutExpands: 2140,
  tapePlays: 736,
  sponsorTaps: 96,
  medianSecondsOnPage: 214,
  fighterVideoShares: 23,
};
