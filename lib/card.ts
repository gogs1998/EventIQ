import { buildHooks, buildTape, completeness, isRunning, type TapeRow } from "@/lib/tape";
import type { Bout, Corner, FightEvent, Fighter, Sponsor } from "@/lib/types";

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

/**
 * Both corners resolve to a fighter this card actually carries.
 *
 * fighterOf still throws on a dangling id, because that is a broken database and
 * it should be loud. What it must not be is fatal to everything else: one bout
 * naming a fighter who is not there used to take down the programme, the
 * dashboard and every other bout on the card, because every page walks the
 * running order. So the running order leaves that bout out, which is what a
 * promoter does with a bout that has lost a corner, and the rest of the show
 * carries on.
 */
function bothCorners(card: Card, bout: Bout): boolean {
  return !!card.fighters[bout.redId] && !!card.fighters[bout.blueId];
}

export function boutOf(card: Card, numberOrSlug: number | string): Bout | undefined {
  const n = Number(numberOrSlug);
  return card.event.bouts.find((bout) => bout.number === n && bothCorners(card, bout));
}

/**
 * Running order runs openers first; the programme lists the main event first.
 *
 * A withdrawn bout is still in here, because the programme still prints it — see
 * `boutsRunning` for the list everything that measures the card works from.
 */
export function boutsTopDown(card: Card): Bout[] {
  return card.event.bouts
    .filter((bout) => bothCorners(card, bout))
    .sort((a, b) => b.number - a.number);
}

/**
 * The bouts still going ahead, main event first.
 *
 * Everything that asks how ready a card is asks this rather than the running
 * order: a bout that came off is not a hole in the card, and counting it as one
 * would have the dashboard chase two fighters who are no longer fighting and
 * report a show as less ready the more honest the promoter had been about it.
 */
export function boutsRunning(card: Card): Bout[] {
  return boutsTopDown(card).filter(isRunning);
}

/**
 * The bout the top of a page leads on, or nothing.
 *
 * A promoter can publish a show the minute they have created it and add the
 * running order afterwards, so a published card with no bouts on it is ordinary
 * use rather than a broken database. Anything leading on the main event has to
 * cope with there not being one yet: this returns undefined and the caller
 * leaves the space out, rather than handing an absent bout to something that
 * will read a number off it.
 *
 * The billing decides it, because boutBillingLabel already does: this used to
 * take the highest number instead, so a promoter who flagged a mid-card bout as
 * the main event got one bout at the top of the page and a different one wearing
 * the words "Main Event". The number is only the fallback, for the ordinary card
 * where nobody has billed anything.
 */
export function featuredBout(card: Card): Bout | undefined {
  // The bouts still going ahead. Leading the programme on a bout that is off
  // would put two names under the show's title that nobody is going to see.
  const running = boutsRunning(card);
  return running.find((bout) => bout.billing === "MAIN") ?? running[0];
}

export function cornersOf(card: Card, bout: Bout): { red: Fighter; blue: Fighter } {
  return { red: fighterOf(card, bout.redId), blue: fighterOf(card, bout.blueId) };
}

/** Where one fighter stands on the card: the bout, and the corner they are in. */
export type Entry = { bout: Bout; corner: Corner };

/**
 * Which bout is a fighter's, asked in exactly one place.
 *
 * Two surfaces ask it — the fighter's public profile and the fighter's own
 * questionnaire — and they used to ask it differently. The profile walked
 * `card.event.bouts` from the openers upwards and the questionnaire walked
 * `boutsTopDown` from the main event down, so a fighter appearing twice on one
 * card was shown one bout on their profile and a different one on their form,
 * and the profile would also claim a bout that had lost a corner and that the
 * programme therefore does not print.
 *
 * The order is the programme's own, main event first, so where a fighter is on
 * two bouts both surfaces name the one the card gives the most prominence.
 */
function entryIn(bouts: Bout[], fighterId: string): Entry | undefined {
  const bout = bouts.find((b) => b.redId === fighterId || b.blueId === fighterId);
  if (!bout) return undefined;
  return { bout, corner: bout.redId === fighterId ? "red" : "blue" };
}

/**
 * A fighter's bout as the programme prints it, a withdrawal included.
 *
 * What the questionnaire asks. A fighter whose bout has come off still holds a
 * working link, because the bout can go back on and because the control for
 * asking for their details back lives on that page.
 */
export function entryOf(card: Card, fighterId: string): Entry | undefined {
  return entryIn(boutsTopDown(card), fighterId);
}

/**
 * The bout a fighter is still fighting, or nothing.
 *
 * What the public profile asks. A withdrawn bout keeps its number and its
 * sponsor on the programme, where it is struck through and labelled, but it is
 * not what anything leads on — and a profile heading a fighter's page with a
 * bout nobody is going to see is exactly that. The page already has a state for
 * a fighter with no bout, so it shows that rather than inventing a second way of
 * saying a bout is off.
 */
export function runningEntryOf(card: Card, fighterId: string): Entry | undefined {
  return entryIn(boutsRunning(card), fighterId);
}

export function tapeFor(card: Card, bout: Bout): TapeRow[] {
  const { red, blue } = cornersOf(card, bout);
  return buildTape(red, blue);
}

export function hooksFor(card: Card, bout: Bout): string[] {
  const { red, blue } = cornersOf(card, bout);
  return buildHooks(bout, red, blue);
}

/**
 * The emptiest profile on the card, with the bout and the opponent around it.
 *
 * The questionnaire preview opens on this so that it opens on a blank form, the
 * way a fighter's own link does, rather than on somebody else's finished one.
 * Undefined where there is no bout to pick from.
 */
export function emptiestEntry(
  card: Card,
): { bout: Bout; fighter: Fighter; opponent: Fighter } | undefined {
  const entries = boutsRunning(card).flatMap((bout) => {
    const { red, blue } = cornersOf(card, bout);
    return [
      { bout, fighter: red, opponent: blue },
      { bout, fighter: blue, opponent: red },
    ];
  });

  return entries.reduce<{ bout: Bout; fighter: Fighter; opponent: Fighter } | undefined>(
    (emptiest, entry) =>
      !emptiest || completeness(entry.fighter).score < completeness(emptiest.fighter).score
        ? entry
        : emptiest,
    undefined,
  );
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
  const fighters = boutsRunning(card).flatMap((bout) => [
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
