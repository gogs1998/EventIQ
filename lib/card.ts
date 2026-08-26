import { buildHooks, buildTape, completeness, type TapeRow } from "@/lib/tape";
import type { Bout, FightEvent, Fighter, Sponsor } from "@/lib/types";

/**
 * One show, loaded whole.
 *
 * Everything that renders a programme needs the event, both fighters in every
 * bout and the sponsors attached to each, and it needs them to agree with each
 * other. Fetching them together and passing this object down means a page cannot
 * accidentally issue thirty queries, and it means every derivation stays a pure
 * function of data the caller already has. That is what keeps lib/tape.ts
 * testable without a database.
 */
export type Card = {
  event: FightEvent;
  fighters: Record<string, Fighter>;
  sponsors: Record<string, Sponsor>;
};

/**
 * Throws rather than returning undefined. A bout naming a fighter who is not on
 * the card is a broken database, not a fighter who has told us nothing, and the
 * two must not produce the same blank-looking page.
 */
export function fighterOf(card: Card, id: string): Fighter {
  const fighter = card.fighters[id];
  if (!fighter) throw new Error(`Unknown fighter: ${id}`);
  return fighter;
}

export function sponsorOf(card: Card, id: string | undefined | null): Sponsor | undefined {
  return id ? card.sponsors[id] : undefined;
}

export function boutOf(card: Card, numberOrSlug: number | string): Bout | undefined {
  const n = Number(numberOrSlug);
  return card.event.bouts.find((bout) => bout.number === n);
}

/** Running order runs openers first; the programme lists the main event first. */
export function boutsTopDown(card: Card): Bout[] {
  return [...card.event.bouts].sort((a, b) => b.number - a.number);
}

export function cornersOf(card: Card, bout: Bout): { red: Fighter; blue: Fighter } {
  return { red: fighterOf(card, bout.redId), blue: fighterOf(card, bout.blueId) };
}

export function tapeFor(card: Card, bout: Bout): TapeRow[] {
  const { red, blue } = cornersOf(card, bout);
  return buildTape(red, blue);
}

export function hooksFor(card: Card, bout: Bout): string[] {
  const { red, blue } = cornersOf(card, bout);
  return buildHooks(bout, red, blue);
}

export function showSponsors(card: Card): Sponsor[] {
  return card.event.showSponsorIds
    .map((id) => card.sponsors[id])
    .filter((sponsor): sponsor is Sponsor => !!sponsor);
}

export function fighterSponsors(card: Card, fighter: Fighter): Sponsor[] {
  return (fighter.sponsorIds ?? [])
    .map((id) => card.sponsors[id])
    .filter((sponsor): sponsor is Sponsor => !!sponsor);
}

/**
 * How full the card is overall. The gap between the top of the bill and the
 * openers is the argument the pitch page makes, so it is measured rather than
 * asserted: if the seeded card changes, the sentence on the page changes with it.
 */
export function cardCompleteness(card: Card, doneAt: number) {
  const fighters = card.event.bouts.flatMap((bout) => [
    fighterOf(card, bout.redId),
    fighterOf(card, bout.blueId),
  ]);
  if (!fighters.length) return { score: 0, done: 0, total: 0 };

  const scores = fighters.map((fighter) => completeness(fighter).score);
  return {
    score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    done: scores.filter((score) => score >= doneAt).length,
    total: scores.length,
  };
}
