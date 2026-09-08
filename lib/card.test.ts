import { describe, expect, it } from "vitest";
import { event, fighters, sponsors } from "@/data/event";
import {
  boutOf,
  boutsRunning,
  boutsTopDown,
  cardCompleteness,
  emptiestEntry,
  featuredBout,
  showSponsors,
  type Card,
} from "@/lib/card";
import { DONE_AT } from "@/lib/promoter";
import { boutBillingLabel, completeness } from "@/lib/tape";

const card: Card = { event, fighters, sponsors };

/**
 * A show that has been published before anybody typed the running order in.
 *
 * Reachable by ordinary use — creating a show and publishing it are two clicks
 * apart, and entering fifteen bouts is an afternoon — so every page that leads on
 * the top of the card has to survive it. It used to be a 500 on the pitch page,
 * which is to say a 500 on the front door for everybody.
 */
const boutless: Card = { event: { ...event, bouts: [] }, fighters: {}, sponsors };

describe("featuredBout", () => {
  it("leads on the main event", () => {
    expect(featuredBout(card)?.number).toBe(15);
  });

  /**
   * boutBillingLabel reads the billing and this read the bout number, so a
   * promoter who flagged a mid-card bout MAIN got one main event at the top of
   * the page and a different one wearing the label.
   */
  it("leads on the bout billed as the main event, wherever it sits on the card", () => {
    const mid: Card = {
      ...card,
      event: {
        ...event,
        bouts: event.bouts.map((bout) =>
          bout.number === 15
            ? { ...bout, billing: undefined }
            : bout.number === 9
              ? { ...bout, billing: "MAIN" as const }
              : bout,
        ),
      },
    };

    expect(featuredBout(mid)?.number).toBe(9);
    expect(boutBillingLabel(featuredBout(mid)!)).toBe("Main Event");
  });

  it("falls back to the top of the running order when nothing is billed main", () => {
    const unbilled: Card = {
      ...card,
      event: { ...event, bouts: event.bouts.map((bout) => ({ ...bout, billing: undefined })) },
    };

    expect(featuredBout(unbilled)?.number).toBe(15);
  });

  it("has nothing to lead on where there are no bouts", () => {
    expect(featuredBout(boutless)).toBeUndefined();
    expect(boutsTopDown(boutless)).toEqual([]);
  });
});

/**
 * A bout naming a fighter who is not on the card is a broken database, and
 * fighterOf still says so. What it must not do is take the show down with it:
 * one dangling id threw inside every page that walks the running order, so the
 * programme, the dashboard and every other bout on the card went with it. The
 * running order leaves that bout out instead, which is what a promoter would do
 * with a bout that has lost a corner.
 */
describe("a bout naming a fighter who is not on the card", () => {
  const dangling: Card = {
    ...card,
    event: {
      ...event,
      bouts: [...event.bouts, { ...event.bouts[0], number: 16, blueId: "nobody-at-all" }],
    },
  };

  it("leaves the bout out of the running order rather than throwing", () => {
    expect(boutsTopDown(dangling).map((bout) => bout.number)).not.toContain(16);
    expect(boutsTopDown(dangling).length).toBe(event.bouts.length);
  });

  it("does not let it become the bout the page leads on", () => {
    expect(featuredBout(dangling)?.number).toBe(15);
  });

  it("cannot be reached by number either", () => {
    expect(boutOf(dangling, 16)).toBeUndefined();
    expect(boutOf(dangling, 15)?.number).toBe(15);
  });

  it("scores the card on the bouts that are actually there", () => {
    expect(cardCompleteness(dangling, DONE_AT)).toEqual(cardCompleteness(card, DONE_AT));
  });
});

/**
 * A withdrawal keeps its place and stops counting.
 *
 * Both halves are the point. The programme still prints the bout — the number is
 * on a poster, in a message and on every analytics row for it, and a spectator
 * looking for bout eleven has to find it where it was — so the running order
 * still carries it. Everything that measures the card works from `boutsRunning`
 * instead, because a bout nobody is fighting is not a hole in the card and must
 * not be scored as one.
 */
describe("a bout that is off", () => {
  const off = (numbers: number[]): Card => ({
    ...card,
    event: {
      ...event,
      bouts: event.bouts.map((bout) =>
        numbers.includes(bout.number) ? { ...bout, cancelled: true } : bout,
      ),
    },
  });

  it("stays in the running order the programme prints", () => {
    expect(boutsTopDown(off([11])).map((bout) => bout.number)).toContain(11);
    expect(boutsTopDown(off([11])).length).toBe(event.bouts.length);
  });

  it("is not one of the bouts still going ahead", () => {
    expect(boutsRunning(off([11])).map((bout) => bout.number)).not.toContain(11);
    expect(boutsRunning(off([11])).length).toBe(event.bouts.length - 1);
  });

  /**
   * Bout 15 is the one billed MAIN, so taking it off has to move the billing as
   * well as the number. Two names under the show's own title for a bout nobody
   * is going to see is the one thing here a spectator would act on.
   */
  it("is not what the top of the programme leads on", () => {
    expect(featuredBout(card)?.number).toBe(15);
    expect(featuredBout(off([15]))?.number).toBe(14);
  });

  it("does not count towards how full the card is", () => {
    expect(cardCompleteness(off([15]), DONE_AT).total).toBe(
      cardCompleteness(card, DONE_AT).total - 2,
    );
  });

  it("is never the profile the questionnaire preview opens on", () => {
    const emptiest = emptiestEntry(card)!;
    expect(emptiestEntry(off([emptiest.bout.number]))?.fighter.id).not.toBe(emptiest.fighter.id);
  });

  it("leaves a wholly withdrawn card with no main event rather than a broken one", () => {
    const none = off(event.bouts.map((bout) => bout.number));
    expect(featuredBout(none)).toBeUndefined();
    expect(boutsRunning(none)).toEqual([]);
    expect(boutsTopDown(none).length).toBe(event.bouts.length);
    expect(cardCompleteness(none, DONE_AT)).toEqual({ score: 0, done: 0, total: 0 });
  });
});

describe("emptiestEntry", () => {
  it("opens the preview on the emptiest profile on the card", () => {
    const pick = emptiestEntry(card);
    expect(pick).toBeDefined();

    const lowest = Math.min(
      ...Object.values(event.bouts).flatMap((bout) => [
        completeness(fighters[bout.redId]).score,
        completeness(fighters[bout.blueId]).score,
      ]),
    );
    expect(completeness(pick!.fighter).score).toBe(lowest);
  });

  it("gives the preview the real opponent, from the same bout", () => {
    const pick = emptiestEntry(card)!;
    expect([pick.bout.redId, pick.bout.blueId]).toContain(pick.fighter.id);
    expect(pick.opponent.id).not.toBe(pick.fighter.id);
  });

  it("has nobody to pick where there are no bouts", () => {
    expect(emptiestEntry(boutless)).toBeUndefined();
  });
});

describe("a published show with no bouts", () => {
  it("scores as empty rather than dividing by nothing", () => {
    expect(cardCompleteness(boutless, DONE_AT)).toEqual({ score: 0, done: 0, total: 0 });
  });

  it("still carries the promoter's own sponsors", () => {
    expect(showSponsors(boutless).length).toBe(showSponsors(card).length);
  });
});
