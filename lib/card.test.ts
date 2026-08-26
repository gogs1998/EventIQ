import { describe, expect, it } from "vitest";
import { event, fighters, sponsors } from "@/data/event";
import {
  boutsTopDown,
  cardCompleteness,
  emptiestEntry,
  featuredBout,
  showSponsors,
  type Card,
} from "@/lib/card";
import { DONE_AT } from "@/lib/promoter";
import { completeness } from "@/lib/tape";

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

  it("has nothing to lead on where there are no bouts", () => {
    expect(featuredBout(boutless)).toBeUndefined();
    expect(boutsTopDown(boutless)).toEqual([]);
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
