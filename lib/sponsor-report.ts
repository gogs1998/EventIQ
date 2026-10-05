import { boutsTopDown, fighterOf, showSponsors, type Card } from "@/lib/card";
import { boutBillingLabel, lastName } from "@/lib/tape";
import type { AnalyticsKind, Bout, Fighter, Sponsor } from "@/lib/types";

/**
 * The page a promoter sends a sponsor after the show.
 *
 * Every figure on it is a sum of counted rows. Nothing is modelled, scaled or
 * filled in, and a placement nobody interacted with reads as zero — which is
 * the whole of what makes it worth sending. The counting itself is section 9;
 * this is only the arithmetic that turns it into one sponsor's page, so it is a
 * pure function of the card and the rows and touches no database.
 *
 * A sponsor is on a card in three ways, and each is measured by what a spectator
 * can actually do to it:
 *
 * - **The show strip** is a link, so it is measured in taps.
 * - **A bout** carries the sponsor's mark at the top of its tale of the tape.
 *   The mark is not a link — it sits inside the control that opens the bout — so
 *   the bout is measured by how often it was opened and its video played. Taps
 *   are still read for it, in case the mark becomes a link, and are zero today.
 * - **A fighter** lists the sponsor under "Backed by" on their bout and their
 *   own page, both links, so taps — and how often that page was opened.
 *
 * A tap is credited to a placement by what the row names, not by guessing: a
 * fighter id means the fighter's placement, a bout number alone means the bout's,
 * neither means the strip. A tap that names a placement the card no longer has
 * — a sponsor taken off a fighter after the show — is still a real tap and still
 * in the total, and is reported as such rather than reassigned or dropped.
 */

/** One grouped count, as the report query returns it from either table. */
export type ReportRow = {
  kind: string;
  boutNumber: number | null;
  fighterId: string | null;
  sponsorId: string | null;
  count: number;
};

/** The kinds the report breaks down. The query asks for these and no others. */
export const REPORT_KINDS = [
  "bout_expand",
  "tape_play",
  "sponsor_tap",
  "profile_view",
] as const satisfies readonly AnalyticsKind[];

/** Everything counted at one show, in the shape the report reads it. */
export type ReportCounts = {
  /** The programme as a whole: every open, and how many separate visits made them. */
  programme: { opens: number; visits: number };
  rows: readonly ReportRow[];
};

export type ShowPlacement = { kind: "show"; taps: number };

export type BoutPlacement = {
  kind: "bout";
  bout: Bout;
  label: string;
  matchup: string;
  withdrawn: boolean;
  /** Times the bout's tale of the tape was opened, which is where the mark sits. */
  opened: number;
  /** Times the bout's video was started. */
  played: number;
  taps: number;
};

export type FighterPlacement = {
  kind: "fighter";
  fighter: Fighter;
  /** The bout they are on, where they are on one. */
  bout?: Bout;
  taps: number;
  /** Times the fighter's own page was opened, which lists the sponsor. */
  profileViews: number;
};

export type Placement = ShowPlacement | BoutPlacement | FighterPlacement;

export type SponsorReport = {
  sponsor: Sponsor;
  placements: Placement[];
  /** Every tap on this sponsor at this show, wherever it came from. */
  taps: number;
  /** The part of `taps` that came from a placement this card no longer has. */
  unplacedTaps: number;
  programme: ReportCounts["programme"];
};

function count(row: ReportRow): number {
  // D1 hands `sum()` back as whatever SQLite had; a null sum is no rows.
  return Number(row.count ?? 0) || 0;
}

function sum(rows: readonly ReportRow[], match: (row: ReportRow) => boolean): number {
  let total = 0;
  for (const row of rows) if (match(row)) total += count(row);
  return total;
}

/** The bout a fighter is in on this card, if any. */
function boutOf(card: Card, fighterId: string): Bout | undefined {
  return card.event.bouts.find((bout) => bout.redId === fighterId || bout.blueId === fighterId);
}

/** The fighters on this card, in running order from the top, red corner first. */
function fightersTopDown(card: Card): Fighter[] {
  const seen = new Set<string>();
  const fighters: Fighter[] = [];
  for (const bout of boutsTopDown(card)) {
    for (const id of [bout.redId, bout.blueId]) {
      if (seen.has(id)) continue;
      seen.add(id);
      fighters.push(fighterOf(card, id));
    }
  }
  return fighters;
}

/**
 * Every placement a sponsor has on this card, top of the page first: the strip,
 * then the bouts from the main event down, then the fighters in the same order.
 * Counts are zero here and filled in by `sponsorReport`.
 */
function placementsOf(card: Card, sponsorId: string): Placement[] {
  const placements: Placement[] = [];

  if (card.event.showSponsorIds.includes(sponsorId)) placements.push({ kind: "show", taps: 0 });

  for (const bout of boutsTopDown(card)) {
    if (bout.sponsorId !== sponsorId) continue;
    placements.push({
      kind: "bout",
      bout,
      label: boutBillingLabel(bout),
      matchup: `${lastName(fighterOf(card, bout.redId))} v ${lastName(fighterOf(card, bout.blueId))}`,
      withdrawn: Boolean(bout.cancelled),
      opened: 0,
      played: 0,
      taps: 0,
    });
  }

  for (const fighter of fightersTopDown(card)) {
    if (!(fighter.sponsorIds ?? []).includes(sponsorId)) continue;
    placements.push({
      kind: "fighter",
      fighter,
      bout: boutOf(card, fighter.id),
      taps: 0,
      profileViews: 0,
    });
  }

  return placements;
}

/**
 * The sponsors a report can be written for, in the order the programme shows
 * them: anybody with a placement on this card, and anybody who was tapped at
 * this show and has since been taken off it — their taps happened, and the
 * promoter may well still owe them the page.
 *
 * Only sponsors in the promoter's own book: `card.sponsors` is every sponsor the
 * promoter has, so a tap row naming an id outside it is not one of theirs.
 */
export function reportableSponsors(card: Card, counts: ReportCounts): Sponsor[] {
  const ids: string[] = [];
  const add = (id: string | null | undefined) => {
    if (id && card.sponsors[id] && !ids.includes(id)) ids.push(id);
  };

  for (const sponsor of showSponsors(card)) add(sponsor.id);
  for (const bout of boutsTopDown(card)) add(bout.sponsorId);
  for (const fighter of fightersTopDown(card)) for (const id of fighter.sponsorIds ?? []) add(id);
  for (const row of counts.rows) if (row.kind === "sponsor_tap" && count(row) > 0) add(row.sponsorId);

  return ids.map((id) => card.sponsors[id]);
}

/**
 * One sponsor's page, or null for a sponsor this card has no report for — not
 * in the promoter's book, or never on this show and never tapped at it.
 */
export function sponsorReport(
  card: Card,
  counts: ReportCounts,
  sponsorId: string,
): SponsorReport | null {
  const sponsor = reportableSponsors(card, counts).find((s) => s.id === sponsorId);
  if (!sponsor) return null;

  const rows = counts.rows;
  const taps = rows.filter((row) => row.kind === "sponsor_tap" && row.sponsorId === sponsorId);

  const placements = placementsOf(card, sponsorId).map((placement): Placement => {
    switch (placement.kind) {
      case "show":
        return {
          ...placement,
          taps: sum(taps, (row) => row.fighterId === null && row.boutNumber === null),
        };
      case "bout": {
        const number = placement.bout.number;
        return {
          ...placement,
          opened: sum(rows, (row) => row.kind === "bout_expand" && row.boutNumber === number),
          played: sum(rows, (row) => row.kind === "tape_play" && row.boutNumber === number),
          taps: sum(taps, (row) => row.fighterId === null && row.boutNumber === number),
        };
      }
      case "fighter": {
        const id = placement.fighter.id;
        return {
          ...placement,
          taps: sum(taps, (row) => row.fighterId === id),
          profileViews: sum(rows, (row) => row.kind === "profile_view" && row.fighterId === id),
        };
      }
    }
  });

  const total = sum(taps, () => true);
  const placed = placements.reduce((acc, placement) => acc + placement.taps, 0);

  return {
    sponsor,
    placements,
    taps: total,
    unplacedTaps: total - placed,
    programme: counts.programme,
  };
}

/**
 * When the figures were read, in the time the shows are on.
 *
 * London rather than UTC because a sponsor reading "21:40" about a show that
 * started at seven should not have to know what UTC is. The counts themselves
 * are not split by hour anywhere, so this is the only clock on the page.
 */
export function reportTimestamp(at: Date): string {
  return at.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
