import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/card";
import { GYM_TO_CONFIRM } from "@/lib/copy";
import type { Bout, Fighter } from "@/lib/types";
import { CONFIRMED_COPY, announcementOf, fitSize } from "./confirmed";

const FULL: Fighter = {
  id: "callum-reeves",
  name: "Callum Reeves",
  nickname: "The Hammer",
  gym: "Ironworks MMA",
  hometown: "Bolton",
  record: { w: 6, l: 1, d: 0 },
};
const DEBUT: Fighter = { id: "amelia-kerr", name: "Amelia Kerr", gym: "Rylands Gym", record: { w: 0, l: 0, d: 0 } };
const SILENT: Fighter = { id: "owen-pryce", name: "Owen Pryce", gym: GYM_TO_CONFIRM };

const BOUT: Bout = {
  number: 15,
  discipline: "MMA",
  weightKg: 84,
  classLabel: "Amateur",
  billing: "MAIN",
  rounds: 3,
  roundMinutes: 3,
  redId: FULL.id,
  blueId: DEBUT.id,
  sponsorId: "eventiq",
};

function card(red: Fighter, blue: Fighter, bout: Partial<Bout> = {}): { card: Card; bout: Bout } {
  const b = { ...BOUT, redId: red.id, blueId: blue.id, ...bout };
  return {
    bout: b,
    card: {
      event: {
        slug: "cage-county-12",
        name: "Cage County 12",
        date: "2026-10-31",
        doorsTime: "18:00",
        firstBellTime: "19:00",
        venue: "Winter Gardens",
        city: "Blackpool",
        promoter: { name: "Cage County" },
        showSponsorIds: [],
        bouts: [b],
      },
      fighters: { [red.id]: red, [blue.id]: blue },
      sponsors: { eventiq: { id: "eventiq", name: "EventIQ" } },
    },
  };
}

describe("announcementOf", () => {
  it("is about the corner it is asked for, facing the other one", () => {
    const { card: c, bout } = card(FULL, DEBUT);
    expect(announcementOf(c, bout, "red").surname).toBe("Reeves");
    expect(announcementOf(c, bout, "red").opponent).toBe("Amelia Kerr");
    expect(announcementOf(c, bout, "blue").surname).toBe("Kerr");
    expect(announcementOf(c, bout, "blue").opponent).toBe("Callum Reeves");
  });

  it("calls an explicit 0-0-0 a debut, and nothing else", () => {
    const { card: c, bout } = card(FULL, DEBUT);
    const debut = announcementOf(c, bout, "blue");
    expect(debut.debut).toBe(true);
    expect(debut.record).toBe("Debut");
    expect(announcementOf(c, bout, "red").record).toBe("6-1");
  });

  /** Silence is not evidence. A fighter who has not said gets no record line at all. */
  it("shows no record for a fighter who has not given one, and never a row of noughts", () => {
    const { card: c, bout } = card(FULL, SILENT);
    const silent = announcementOf(c, bout, "blue");
    expect(silent.record).toBeUndefined();
    expect(silent.debut).toBe(false);
    expect(silent.record ?? "").not.toMatch(/0-0/);
  });

  it("does not print the card editor's placeholder as a gym", () => {
    const { card: c, bout } = card(FULL, SILENT);
    expect(announcementOf(c, bout, "blue").gym).toBeUndefined();
  });

  it("names a billing only where the bout has one", () => {
    expect(announcementOf(card(FULL, DEBUT).card, card(FULL, DEBUT).bout, "red").billing).toBe("Main Event");
    const plain = card(FULL, DEBUT, { billing: undefined, number: 5 });
    expect(announcementOf(plain.card, plain.bout, "red").billing).toBeUndefined();
    expect(announcementOf(plain.card, plain.bout, "red").boutLabel).toBe("Bout 5");
  });

  /** The clip leaves the site; a code naming the origin that rendered it works for nobody. */
  it("points at the live programme, not at whatever rendered it", () => {
    const { card: c, bout } = card(FULL, DEBUT);
    const a = announcementOf(c, bout, "red");
    expect(a.programmeUrl).toMatch(/^https:\/\/[^/]+\/e\/cage-county-12$/);
    expect(a.programmeUrl).not.toContain("localhost");
    expect(a.programmeLabel).not.toMatch(/^https?:/);
    expect(a.venue).toBe("Winter Gardens, Blackpool");
    expect(a.sponsor?.name).toBe("EventIQ");
  });
});

describe("the clip's own words", () => {
  const lines = Object.values(CONFIRMED_COPY);

  it("never uses a gendered pronoun", () => {
    for (const line of lines) expect(line).not.toMatch(/\b(he|she|him|her|hers|his|himself|herself)\b/i);
  });

  it("is British English and states nothing nobody has counted", () => {
    for (const line of lines) {
      expect(line).not.toMatch(/program\b|\d/i);
    }
  });
});

describe("fitSize", () => {
  it("never exceeds the cap and shrinks a long name to fit", () => {
    expect(fitSize("KERR", 960, 230)).toBe(230);
    const long = fitSize("TUNNICLIFFE", 960, 230);
    expect(long).toBeLessThan(230);
    expect(long * 11 * 0.46).toBeLessThanOrEqual(960.5);
  });
});
