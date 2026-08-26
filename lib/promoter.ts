import { boutsTopDown, cornersOf, fighterOf, sponsorOf, type Card } from "@/lib/card";
import {
  boutBillingLabel,
  completeness,
  firstName,
  formatEventDateShort,
  tapeGapsBehind,
} from "@/lib/tape";
import type { Bout, Corner, FightEvent, Fighter, Invite, InviteStatus } from "@/lib/types";

/**
 * The promoter's half of the product.
 *
 * Everything here is derived from the same rows the programme reads, so the
 * dashboard and the card cannot disagree. Nothing is stored twice.
 */

/** A profile is "done" at this score. Below it, the card has visible holes. */
export const DONE_AT = 70;

/**
 * Whole days between today and the show. Takes the date rather than the event
 * so the shows list can call it without loading thirty fighters to find out how
 * long is left, and takes `now` so a test does not depend on the clock.
 */
export function daysUntilShow(date: string, now = new Date()): number {
  const to = new Date(`${date}T00:00:00Z`).getTime();
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((to - from) / 86_400_000);
}

/**
 * Where a fighter's invite stands, read off the timestamps rather than guessed.
 *
 * An earlier version derived this from the completeness score, which had
 * twenty-one fighters who had never touched their link reading as "opened,
 * unfinished" — because a record and an age come off the promoter's own entry
 * form, not from the fighter. That erased the one distinction the dashboard
 * exists to draw. Now the database records when a link is actually opened and
 * this only reports it. Same principle as isDebut: absence is not evidence.
 */
export function inviteStatus(invite: Invite | undefined): InviteStatus {
  if (!invite?.sentAt) return "not-sent";
  if (invite.submittedAt) return "submitted";
  if (invite.lastOpenedAt) return "opened";
  return "sent";
}

export const INVITE_LABEL: Record<InviteStatus, string> = {
  "not-sent": "Not sent",
  sent: "Not opened",
  opened: "Opened, unfinished",
  submitted: "Done",
};

export type ChaseRow = {
  fighter: Fighter;
  bout: Bout;
  corner: Corner;
  opponent: Fighter;
  invite?: Invite;
  status: InviteStatus;
  score: number;
  missing: string[];
  /** Lines their opponent has answered and they have not. */
  behind: string[];
};

export type Invites = Record<string, Invite>;

function rowFor(card: Card, invites: Invites, bout: Bout, corner: Corner): ChaseRow {
  const fighter = fighterOf(card, corner === "red" ? bout.redId : bout.blueId);
  const opponent = fighterOf(card, corner === "red" ? bout.blueId : bout.redId);
  const { score, missing } = completeness(fighter);
  const invite = invites[fighter.id];

  return {
    fighter,
    bout,
    corner,
    opponent,
    invite,
    status: inviteStatus(invite),
    score,
    missing,
    behind: tapeGapsBehind(fighter, opponent),
  };
}

export function allRows(card: Card, invites: Invites): ChaseRow[] {
  return card.event.bouts.flatMap((bout) => [
    rowFor(card, invites, bout, "red"),
    rowFor(card, invites, bout, "blue"),
  ]);
}

/**
 * Who to chase, best first.
 *
 * Ordered by where they sit on the card rather than by how empty they are,
 * because a hole in the main event costs more than a hole in bout two, and
 * because that is the order a promoter already thinks in.
 */
export function chaseList(card: Card, invites: Invites): ChaseRow[] {
  return allRows(card, invites)
    .filter((row) => row.score < DONE_AT)
    .sort((a, b) => b.bout.number - a.bout.number || a.score - b.score);
}

export function eventProgress(card: Card, invites: Invites) {
  const rows = allRows(card, invites);
  const done = rows.filter((row) => row.score >= DONE_AT).length;
  return {
    done,
    total: rows.length,
    percent: rows.length ? Math.round((done / rows.length) * 100) : 0,
    averageScore: rows.length
      ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
      : 0,
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
export function boutReadiness(card: Card, invites: Invites): BoutReadiness[] {
  return boutsTopDown(card).map((bout) => {
    const red = rowFor(card, invites, bout, "red");
    const blue = rowFor(card, invites, bout, "blue");
    const done = [red, blue].filter((row) => row.score >= DONE_AT).length;
    return {
      bout,
      red,
      blue,
      state: done === 2 ? "ready" : done === 1 ? "lopsided" : "empty",
    } as BoutReadiness;
  });
}

export type SponsorInventory = {
  sold: Bout[];
  unsold: Bout[];
  /** Distinct sponsors holding at least one bout. */
  sponsorCount: number;
};

export function sponsorInventory(card: Card): SponsorInventory {
  const sold = card.event.bouts.filter((bout) => bout.sponsorId);
  const unsold = card.event.bouts.filter((bout) => !bout.sponsorId);
  return { sold, unsold, sponsorCount: new Set(sold.map((bout) => bout.sponsorId)).size };
}

/**
 * A message the promoter can paste straight into WhatsApp.
 *
 * Specific rather than nagging: it names the bout, the opponent, and — when it
 * is true — that the opponent has already sent theirs, which is the line that
 * actually works. It never claims that when it is not the case.
 *
 * The competitive fact stays because it is what gets the form filled in, but it
 * is pitched as an invitation rather than a telling-off: the fighter is offered
 * a place alongside their opponent rather than shown a list of what they have
 * failed to do. A promoter writing to their own fighter can be warm, so this
 * reads as a person rather than a system, without reading as a wind-up.
 *
 * The link is the fighter's own invite, so the message is the whole job rather
 * than a prompt to go and find the link afterwards.
 */
export function nudgeMessage(row: ChaseRow, event: FightEvent, baseUrl: string): string {
  const { fighter, opponent, bout, behind, invite } = row;
  const link = invite ? `${baseUrl}/f/${invite.token}` : `${baseUrl}/f/demo`;

  const lines = [
    `Hi ${firstName(fighter)} — you're on ${boutBillingLabel(bout).toLowerCase()} at ${event.name}, ${formatEventDateShort(event.date)}, against ${opponent.name} out of ${opponent.gym}.`,
  ];

  if (behind.length >= 2) {
    lines.push(
      `${firstName(opponent)} has already sent their programme profile over. Send yours and the two of you go up side by side, line for line — everyone in the room reads this on the night.`,
    );
  } else {
    lines.push(
      `Your programme profile is still to come, and everyone in the room reads this on the night.`,
    );
  }

  lines.push(
    `No account and no login. You get a video of your own tale of the tape to post, with your gym and your sponsors on it: ${link}`,
  );

  return lines.join("\n\n");
}

export function sponsorFor(card: Card, bout: Bout) {
  return sponsorOf(card, bout.sponsorId);
}

export { cornersOf };
