import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SHOW_TEMPLATES, showTemplate } from "@/components/sequence/show-templates";
import { FPS } from "@/lib/anim";
import type { Card } from "@/lib/card";
import { qrMatrix } from "@/lib/qr";
import { event, fighters, sponsors } from "@/data/event";

const card: Card = { event, fighters, sponsors };
const qr = qrMatrix("https://eventiq.win/e/cage-county-12");

/** A fixed instant, because "N days to go" is a prop rather than a clock read. */
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

const draw = (id: string, frame: number): string =>
  renderToStaticMarkup(
    createElement("div", null, showTemplate(id)!.render({ card, frame, now: NOW, qr })),
  );

describe("the show template registry", () => {
  it("answers to the id it is filed under", () => {
    for (const template of SHOW_TEMPLATES) {
      expect(showTemplate(template.id)).toBe(template);
    }
  });

  it("has an id nobody else has", () => {
    const ids = SHOW_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The capture page answers 404 for an id nobody has written a composition for,
   * which it can only do if the lookup says so rather than falling back to one.
   */
  it("does not quietly stand something in for an id it does not have", () => {
    expect(showTemplate("not-a-template")).toBeUndefined();
    expect(showTemplate("")).toBeUndefined();
    expect(showTemplate(undefined)).toBeUndefined();
  });

  it("gives every template a name, a note and a whole number of frames", () => {
    for (const template of SHOW_TEMPLATES) {
      expect(template.name).toBeTruthy();
      expect(template.note).toBeTruthy();
      expect(Number.isInteger(template.duration)).toBe(true);
      expect(template.duration).toBeGreaterThan(0);
      // A duration that is not whole seconds is a video that ends mid-beat, and
      // the renderer reads this straight out of window.__duration.
      expect(template.duration % FPS).toBe(0);
    }
  });

  it("carries the three a promoter is offered", () => {
    expect(SHOW_TEMPLATES.map((template) => template.id)).toEqual(["countdown", "card", "doors"]);
  });
});

/**
 * The rule the mp4 exporter depends on: frame n is the same picture every time
 * it is drawn.
 *
 * This is a smoke test and says so — identical markup is not identical pixels,
 * and HANDOVER section 11 has the perceptual check that covers the other half.
 * What it does catch is the thing that actually gets added by accident: a clock
 * read inside a composition, a random value, or a layer that remembers which
 * frame came before it. So each frame is drawn twice with a frame from
 * elsewhere in the sequence in between, because a component that only produces
 * the same markup when asked twice in a row is not a pure function of its props.
 */
describe("every composition is a pure function of its frame", () => {
  for (const template of SHOW_TEMPLATES) {
    it(`draws the same ${template.id} twice`, () => {
      const middle = Math.floor(template.duration / 2);

      for (const frame of [0, 1, middle, template.duration - 1]) {
        const first = draw(template.id, frame);
        draw(template.id, (frame + 37) % template.duration);
        expect(draw(template.id, frame)).toBe(first);
      }
    });

    it(`draws something at every beat of the ${template.id}`, () => {
      // A scene boundary that has drifted leaves a gap where the video is the
      // backdrop and nothing else, which no amount of comparing a frame with
      // itself would notice.
      for (let frame = 0; frame < template.duration; frame += 10) {
        expect(draw(template.id, frame).length).toBeGreaterThan(2000);
      }
    });
  }
});
