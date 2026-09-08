import { describe, expect, it } from "vitest";
import { boutFingerprints } from "@/lib/db/render-jobs";
import type { LoadedCard } from "@/lib/db/queries";
import { renderFingerprint } from "@/lib/renders";
// The renderer itself, imported on purpose: this file exists to hold the two
// sides to the same digest, so it has to call the renderer's own code.
import { renderInputsFrom } from "../../scripts/render-tape.mjs";

/**
 * The dashboard now works out which videos are out of date from the card it has
 * already loaded, rather than reading the bouts, the fighters and the sponsors a
 * second time. That is only safe while the digest it produces is the digest
 * scripts/render-tape.mjs produces from its own SQL row — the renderer publishes
 * the hash it computed, and the dashboard compares against the hash it computed,
 * so one character of difference makes every video on every card read as stale
 * forever and re-render every hour.
 *
 * lib/renders.ts already refuses an input object with a missing or spare field.
 * What it cannot see is the two sides putting different *values* in the same
 * field, which is what this asserts: one bout, built from a database row on one
 * side and from a loaded card on the other, hashing to the same thing.
 */

/** One row of the renderer's own query, and the card the app builds for it. */
const ROW = {
  number: 15,
  discipline: "MMA",
  weight_kg: 77,
  class_label: "C CLASS",
  title_label: "Cage County lightweight title",
  billing: "MAIN",
  womens: 0,
  rounds: 3,
  round_minutes: 3,
  sponsor_id: "spn_mouthguards",
  red_id: "callum-reeves",
  blue_id: "dre-osei",
  event_name: "Cage County 12",
  event_date: "2026-09-19",
  event_venue: "Grangemouth Town Hall",
  event_city: "Grangemouth",
  event_backdrop: "/backdrops/hall.webp",
  promoter_name: "Cage County",
  promoter_mark: "/marks/cage-county.svg",
  red_updated: 1_700_000_000_000,
  blue_updated: 1_700_000_000_001,
  red_photo: "/media/photos/callum-1.jpg",
  red_cutout: "/media/cutouts/callum-1.webp",
  blue_photo: null,
  blue_cutout: null,
};

const LOCKUP = "spn_mouthguards|Mouthguards.pro|Custom fit|/marks/mg.svg";

function card(over: Partial<LoadedCard> = {}): LoadedCard {
  return {
    eventId: "ev_cage-county-12",
    promoterId: "pr_cage-county",
    published: true,
    fighterUpdatedAt: {
      "callum-reeves": ROW.red_updated,
      "dre-osei": ROW.blue_updated,
    },
    event: {
      slug: "cage-county-12",
      name: ROW.event_name,
      date: ROW.event_date,
      doorsTime: "18:00",
      firstBellTime: "19:00",
      venue: ROW.event_venue,
      city: ROW.event_city,
      promoter: { name: ROW.promoter_name, mark: ROW.promoter_mark },
      backdrop: ROW.event_backdrop,
      showSponsorIds: ["spn_eventiq"],
      bouts: [
        {
          number: ROW.number,
          discipline: "MMA",
          weightKg: ROW.weight_kg,
          classLabel: ROW.class_label,
          titleLabel: ROW.title_label,
          billing: "MAIN",
          rounds: ROW.rounds,
          roundMinutes: ROW.round_minutes,
          redId: ROW.red_id,
          blueId: ROW.blue_id,
          sponsorId: ROW.sponsor_id,
        },
      ],
    },
    fighters: {
      "callum-reeves": {
        id: "callum-reeves",
        name: "Callum Reeves",
        gym: "Riverside MMA",
        photo: ROW.red_photo,
        cutout: ROW.red_cutout,
      },
      "dre-osei": { id: "dre-osei", name: "Dre Osei", gym: "Kirkby Fight Club" },
    },
    sponsors: {
      spn_mouthguards: {
        id: "spn_mouthguards",
        name: "Mouthguards.pro",
        qualifier: "Custom fit",
        mark: "/marks/mg.svg",
      },
      // On the show's strip and in no video, so it must not reach the digest.
      spn_eventiq: { id: "spn_eventiq", name: "EventIQ" },
    },
    ...over,
  };
}

describe("boutFingerprints", () => {
  it("agrees with the renderer about what this bout is made of", async () => {
    const fromTheRow = await renderFingerprint(renderInputsFrom(ROW, [LOCKUP]));
    expect(await boutFingerprints(card())).toEqual({ 15: fromTheRow });
  });

  it("moves when the card moves", async () => {
    const before = await boutFingerprints(card());
    const moved = card();
    moved.event.venue = "Grangemouth Sports Centre";
    expect(await boutFingerprints(moved)).not.toEqual(before);
  });

  /**
   * A fighter's row is touched by the cutout step minutes after the render, so
   * the timestamp is carried on the card rather than left out of it. Losing it
   * would leave a bout reading as current through a change nobody could see.
   */
  it("carries the fighter timestamps the card itself has no room for", async () => {
    const touched = card();
    touched.fighterUpdatedAt["dre-osei"] = ROW.blue_updated + 1;
    expect(await boutFingerprints(touched)).not.toEqual(await boutFingerprints(card()));
  });

  it("leaves out a bout naming a fighter who is not on the card", async () => {
    const broken = card();
    delete broken.fighters["dre-osei"];
    expect(await boutFingerprints(broken)).toEqual({});
  });
});
