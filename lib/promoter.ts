import { event } from "@/data/event";
import { AS_OF, INVITE_OVERRIDES, type Invite, type InviteStatus } from "@/data/promoter";
import {
  boutBillingLabel,
  completeness,
  firstName,
  formatEventDateShort,
  getFighter,
  getSponsor,
  tapeGapsBehind,
} from "@/lib/tape";
import type { Bout, Corner, Fighter } from "@/lib/types";

/** A profile is "done" at this score. Below it, the card has visible holes. */
export const DONE_AT = 70;

export function daysUntilShow(): number {
  const from = new Date(`${AS_OF}T00:00:00Z`).getTime();
  const to = new Date(`${event.date}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/**
 * Fields the promoter already holds from their own entry and matchmaking
 * paperwork. Their presence says nothing about whether the fighter has been
 * near the link.
 */
function onlyPromoterKnows(fighter: Fighter): boolean {
  const self =
    fighter.photo ??
    fighter.nickname ??
    fighter.bio ??
    fighter.instagram ??
    fighter.walkoutSong ??
    fighter.heightCm ??
    fighter.reachCm ??
    fighter.sponsorIds?.length;
  return !self;
}

/**
 * Where a fighter's invite stands.
 *
 * Deliberately not derived from the completeness score. A fighter with a record
 * and an age has a score above zero, but those came off the promoter's own entry
 * form, so scoring it that way had twenty-one people who had never touched the
 * link reading as "opened, unfinished" — which destroys the one distinction the
 * promoter is here for. Same principle as isDebut: absence is not evidence.
 */
export function inviteFor(fighter: Fighter): Invite {
  const override = INVITE_OVERRIDES[fighter.id];
  if (override) return override;

  const { score } = completeness(fighter);
  if (score >= DONE_AT) return { status: "submitted", sentAt: "2026-10-21" };
  if (onlyPromoterKnows(fighter)) return { status: "sent", sentAt: "2026-10-21" };
  return { status: "opened", sentAt: "2026-10-21", lastOpenedAt: "2026-10-26" };
}

export const INVITE_LABEL: Record<InviteStatus, string> = {
  "not-sent": "No number",
  sent: "Not opened",
  opened: "Opened, unfinished",
  submitted: "Done",
};

export type ChaseRow = {
  fighter: Fighter;
  bout: Bout;
  corner: Corner;
  opponent: Fighter;
  invite: Invite;
  score: number;
  missing: string[];
  /** Lines their opponent has answered and they have not. */
  behind: string[];
};

function rowFor(bout: Bout, corner: Corner): ChaseRow {
  const fighter = getFighter(corner === "red" ? bout.redId : bout.blueId);
  const opponent = getFighter(corner === "red" ? bout.blueId : bout.redId);
  const { score, missing } = completeness(fighter);

  return {
    fighter,
    bout,
    corner,
    opponent,
    invite: inviteFor(fighter),
    score,
    missing,
    behind: tapeGapsBehind(fighter, opponent),
  };
}

export function allRows(): ChaseRow[] {
  return event.bouts.flatMap((bout) => [rowFor(bout, "red"), rowFor(bout, "blue")]);
}

/**
 * Who to chase, best first.
 *
 * Ordered by where they sit on the card rather than by how empty they are,
 * because a hole in the main event costs more than a hole in bout two, and
 * because that is the order a promoter already thinks in.
 */
export function chaseList(): ChaseRow[] {
  return allRows()
    .filter((row) => row.score < DONE_AT)
    .sort((a, b) => b.bout.number - a.bout.number || a.score - b.score);
}

export function eventProgress(): {
  done: number;
  total: number;
  percent: number;
  averageScore: number;
} {
  const rows = allRows();
  const done = rows.filter((row) => row.score >= DONE_AT).length;
  return {
    done,
    total: rows.length,
    percent: Math.round((done / rows.length) * 100),
    averageScore: Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length),
  };
}

export type BoutReadiness = {
  bout: Bout;
  red: ChaseRow;
  blue: ChaseRow;
  /** Both done, one done, or neither. */
  state: "ready" | "lopsided" | "empty";
};

/**
 * Bout-level readiness, because a bout with one finished fighter and one blank
 * is the worst-looking thing on the card — worse than two blanks, which at
 * least looks consistent.
 */
export function boutReadiness(): BoutReadiness[] {
  return event.bouts
    .map((bout) => {
      const red = rowFor(bout, "red");
      const blue = rowFor(bout, "blue");
      const done = [red, blue].filter((row) => row.score >= DONE_AT).length;
      return {
        bout,
        red,
        blue,
        state: done === 2 ? "ready" : done === 1 ? "lopsided" : "empty",
      } as BoutReadiness;
    })
    .sort((a, b) => b.bout.number - a.bout.number);
}

export type SponsorInventory = {
  sold: Bout[];
  unsold: Bout[];
  /** Distinct sponsors holding at least one bout. */
  sponsorCount: number;
};

export function sponsorInventory(): SponsorInventory {
  const sold = event.bouts.filter((bout) => bout.sponsorId);
  const unsold = event.bouts.filter((bout) => !bout.sponsorId);
  const distinct = new Set(sold.map((bout) => bout.sponsorId));
  return { sold, unsold, sponsorCount: distinct.size };
}

/**
 * A message the promoter can paste straight into WhatsApp.
 *
 * Specific rather than nagging: it names the bout, the opponent, and — when it
 * is true — that the opponent has already sent theirs, which is the line that
 * actually works. It never claims that when it is not the case.
 */
export function nudgeMessage(row: ChaseRow, baseUrl: string): string {
  const { fighter, opponent, bout, behind } = row;
  const link = `${baseUrl}/f/demo`;

  const lines = [
    `Alright ${firstName(fighter)} — you're on ${boutBillingLabel(bout).toLowerCase()} at ${event.name}, ${formatEventDateShort(event.date)}, against ${opponent.name} out of ${opponent.gym}.`,
  ];

  if (behind.length >= 2) {
    lines.push(
      `Your programme profile is still light and ${firstName(opponent)} has already sent theirs. Everyone in the room reads this on the night, so right now it's their name with the detail next to it and yours without.`,
    );
  } else {
    lines.push(
      `Your programme profile isn't finished yet. Everyone in the room reads this on the night.`,
    );
  }

  lines.push(
    `Four minutes, no login, and you get a video of your own tale of the tape to post. Your gym and sponsors go on it: ${link}`,
  );

  return lines.join("\n\n");
}

export function sponsorFor(bout: Bout) {
  return getSponsor(bout.sponsorId);
}
