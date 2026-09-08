/**
 * Seed input for invite history on the demo card.
 *
 * Everything the promoter dashboard reads is now a real row written when
 * something really happened. This file only exists so that the seeded Cage
 * County 12 opens with the texture a card two weeks out actually has, rather
 * than with thirty identical never-sent invites, which would demonstrate
 * nothing. Once seeded, these values are never consulted again.
 *
 * The previous version of this file also carried a LAST_SHOW block of invented
 * attendance and sponsor-tap figures. Those are gone. The dashboard now counts
 * real interactions or shows nothing, because a number a promoter forwards to a
 * sponsor has to survive the sponsor checking it.
 */

export type SeedInviteOverride = {
  status: "not-sent" | "opened";
  lastOpenedAt?: boolean;
};

/**
 * Fighters whose situation is not obvious from their profile. Everyone else is
 * derived at seed time: finished profiles were submitted, part-filled ones were
 * opened, empty ones were merely sent.
 */
export const INVITE_OVERRIDES: Record<string, SeedInviteOverride> = {
  // Opened it, had a look, did nothing. These are the ones worth a nudge.
  "chloe-baines": { status: "opened", lastOpenedAt: true },
  "owen-pryce": { status: "opened", lastOpenedAt: true },
  "gary-boothroyd": { status: "opened", lastOpenedAt: true },
  "connor-slack": { status: "opened", lastOpenedAt: true },
  // No number for them yet — the promoter's own job, not the fighter's.
  "sam-whitlock": { status: "not-sent" },
  "amelia-kerr": { status: "not-sent" },
};
