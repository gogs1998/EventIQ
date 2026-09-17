import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/card";
import { GYM_TO_CONFIRM } from "@/lib/copy";
import type { Bout, Fighter } from "@/lib/types";
import { DEFAULT_TEMPLATE, TEMPLATE_IDS, TEMPLATES, templateOf } from "./templates";

/**
 * The registry, and the one property every composition in it has to keep.
 *
 * A composition is a pure function of a frame number. That is not a style
 * preference: the mp4 exporter screenshots frame *n* and expects the same
 * picture every time it asks for it, so anything that reads a clock, holds state
 * or animates in CSS produces a video that judders rather than a test that
 * fails. Nothing in the unit suite can see a picture — that is what the golden
 * frames are for — but it can see the same frame rendering to two different
 * strings, which is what every one of those mistakes looks like from here.
 */

const RED: Fighter = {
  id: "callum-reeves",
  name: "Callum Reeves",
  nickname: "The Hammer",
  gym: "Ironworks MMA",
  hometown: "Bolton",
  age: 28,
  heightCm: 185,
  reachCm: 191,
  stance: "Orthodox",
  photo: "/fighters/callum-reeves.webp",
  cutout: "/fighters/callum-reeves-cutout.webp",
  record: { w: 6, l: 1, d: 0 },
  finishes: { ko: 4, sub: 1 },
  sponsorIds: ["mouthguards"],
};

const BLUE: Fighter = {
  id: "dre-osei",
  name: "Dre Osei",
  gym: "Vanguard MMA",
  hometown: "Manchester",
  record: { w: 5, l: 0, d: 1 },
  photo: "/fighters/dre-osei.webp",
};

/**
 * The ordinary state of most of an amateur card: a name, a gym the promoter has
 * not been given yet, and nothing else. Every template has to look deliberate
 * for this fighter, and none of them may print the placeholder as a fact.
 */
const BARE: Fighter = {
  id: "chloe-baines",
  name: "Chloe Baines",
  gym: GYM_TO_CONFIRM,
};

const BOUT: Bout = {
  number: 15,
  discipline: "MMA",
  weightKg: 84,
  classLabel: "Amateur",
  titleLabel: "Cage County Amateur Middleweight Title",
  billing: "MAIN",
  rounds: 3,
  roundMinutes: 3,
  redId: RED.id,
  blueId: BLUE.id,
  sponsorId: "eventiq",
};

function cardWith(red: Fighter, blue: Fighter): Card {
  return {
    event: {
      slug: "cage-county-12",
      name: "Cage County 12",
      date: "2026-10-03",
      doorsTime: "18:00",
      firstBellTime: "19:00",
      venue: "Grangemouth Town Hall",
      city: "Grangemouth",
      promoter: { name: "Cage County", mark: "/marks/cage-county.svg" },
      backdrop: "/backdrops/hall.webp",
      showSponsorIds: [],
      bouts: [{ ...BOUT, redId: red.id, blueId: blue.id }],
    },
    fighters: { [red.id]: red, [blue.id]: blue },
    sponsors: {
      eventiq: { id: "eventiq", name: "EventIQ", qualifier: "Digital programmes", mark: "/marks/eventiq.svg" },
      mouthguards: { id: "mouthguards", name: "Mouthguards.pro", mark: "/marks/mouthguards.svg" },
    },
  };
}

const CARD = cardWith(RED, BLUE);
const BARE_CARD = cardWith(BARE, { ...BARE, id: "sam-quaye", name: "Sam Quaye" });

function draw(id: string, card: Card, frame: number): string {
  const Composition = TEMPLATES[id].component;
  const bout = card.event.bouts[0];
  return renderToStaticMarkup(
    <Composition card={card} bout={bout} frame={frame} corner="red" />,
  );
}

describe("the template registry", () => {
  it("carries the tale of the tape as the default", () => {
    expect(TEMPLATES[DEFAULT_TEMPLATE]).toBe(TEMPLATES.tape);
    expect(templateOf(undefined)).toBe(TEMPLATES.tape);
  });

  it("gives every template a component, a label and a length", () => {
    expect(TEMPLATE_IDS.length).toBeGreaterThan(1);
    for (const id of TEMPLATE_IDS) {
      const template = TEMPLATES[id];
      expect(typeof template.component, id).toBe("function");
      expect(template.label.trim(), id).not.toBe("");
      expect(template.frames, id).toBeGreaterThan(0);
    }
  });

  /**
   * Undefined rather than the default, because falling back would mean a
   * mistyped id capturing a different composition of a different length with
   * nothing anywhere saying so.
   */
  it("does not answer for an id it does not carry", () => {
    expect(templateOf("facoff")).toBeUndefined();
    expect(templateOf("")).toBeUndefined();
  });
});

describe("every template", () => {
  for (const id of TEMPLATE_IDS) {
    const { frames } = TEMPLATES[id];
    // Two frames rather than one, and neither of them the first: frame 0 of most
    // of these is one scene with nothing else committed yet, so a template could
    // be wrong for its whole length and still open identically.
    const [middle, last] = [Math.floor(frames * 0.4), frames - 1];

    it(`draws ${id} identically for the same frame`, () => {
      for (const frame of [middle, last]) {
        expect(draw(id, CARD, frame)).toBe(draw(id, CARD, frame));
      }
    });

    it(`draws ${id} differently for different frames`, () => {
      // Otherwise the check above is satisfied by a composition that has stopped
      // reading `frame` at all.
      expect(draw(id, CARD, middle)).not.toBe(draw(id, CARD, last));
    });

    it(`draws ${id} for a card of names and gyms`, () => {
      for (const frame of [middle, last]) {
        expect(draw(id, BARE_CARD, frame).length).toBeGreaterThan(0);
      }
    });
  }
});

/**
 * The tape is not in here.
 *
 * It sets `fighter.gym` as given, which is the behaviour five published videos
 * were made with, and changing it is a change to the composition rather than to
 * the promos. The three templates added beside it go through `stated`, so the
 * prompt a promoter's card editor writes reads as the blank it is.
 */
describe("the promo templates", () => {
  for (const id of TEMPLATE_IDS.filter((each) => each !== DEFAULT_TEMPLATE)) {
    it(`never prints "${GYM_TO_CONFIRM}" as a fact in ${id}`, () => {
      const { frames } = TEMPLATES[id];
      for (let frame = 0; frame < frames; frame += 5) {
        expect(draw(id, BARE_CARD, frame)).not.toContain(GYM_TO_CONFIRM);
      }
    });
  }
});
