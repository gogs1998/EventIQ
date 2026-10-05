import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/card";
import {
  reportableSponsors,
  reportTimestamp,
  sponsorReport,
  type ReportCounts,
  type ReportRow,
} from "@/lib/sponsor-report";
import type { Bout, Fighter } from "@/lib/types";

/**
 * A card small enough to hold in your head: two bouts, one sponsor on the strip,
 * one on bout 2, one backing a fighter in bout 1, one in the promoter's book and
 * on nothing, and one that sponsors everything at once.
 */
function fighter(id: string, sponsorIds?: string[]): Fighter {
  return { id, name: `First ${id}`, gym: "Bryn Athletic", sponsorIds };
}

function bout(number: number, redId: string, blueId: string, extra: Partial<Bout> = {}): Bout {
  return { number, discipline: "MMA", weightKg: 70, rounds: 3, roundMinutes: 3, redId, blueId, ...extra };
}

const card: Card = {
  event: {
    slug: "cage-county-12",
    name: "Cage County 12",
    date: "2026-11-14",
    doorsTime: "18:00",
    firstBellTime: "19:00",
    venue: "Town Hall",
    city: "Grangemouth",
    promoter: { name: "Cage County" },
    showSponsorIds: ["strip", "all"],
    bouts: [
      bout(1, "lowe", "mclay"),
      bout(2, "baines", "oner", { sponsorId: "bouts", billing: "MAIN" }),
    ],
  },
  fighters: {
    lowe: fighter("lowe", ["corner", "all"]),
    mclay: fighter("mclay"),
    baines: fighter("baines", ["all"]),
    oner: fighter("oner"),
  },
  sponsors: {
    strip: { id: "strip", name: "Mouthguards.pro" },
    bouts: { id: "bouts", name: "FightIQ.win" },
    corner: { id: "corner", name: "Bryn Hire" },
    all: { id: "all", name: "EventIQ" },
    shelf: { id: "shelf", name: "Never Placed" },
  },
};

function row(kind: string, refs: Partial<ReportRow>, count: number): ReportRow {
  return { kind, boutNumber: null, fighterId: null, sponsorId: null, ...refs, count };
}

const NOTHING: ReportCounts = { programme: { opens: 0, visits: 0 }, rows: [] };

describe("reportableSponsors", () => {
  it("lists everybody placed on the card, in the order the programme shows them", () => {
    expect(reportableSponsors(card, NOTHING).map((s) => s.id)).toEqual([
      "strip",
      "all",
      "bouts",
      "corner",
    ]);
  });

  it("leaves out a sponsor in the promoter's book who is on nothing at this show", () => {
    expect(reportableSponsors(card, NOTHING).map((s) => s.id)).not.toContain("shelf");
    expect(sponsorReport(card, NOTHING, "shelf")).toBeNull();
  });

  it("keeps a sponsor who was tapped at this show and has since come off the card", () => {
    const counts = { ...NOTHING, rows: [row("sponsor_tap", { sponsorId: "shelf" }, 2)] };
    expect(reportableSponsors(card, counts).map((s) => s.id)).toContain("shelf");
  });

  it("does not let a tap row name a sponsor into somebody else's book", () => {
    const counts = { ...NOTHING, rows: [row("sponsor_tap", { sponsorId: "rival" }, 9)] };
    expect(reportableSponsors(card, counts).map((s) => s.id)).not.toContain("rival");
    expect(sponsorReport(card, counts, "rival")).toBeNull();
  });
});

describe("sponsorReport", () => {
  it("reports every placement as an explicit zero before anybody has looked", () => {
    const report = sponsorReport(card, NOTHING, "all")!;
    expect(report.taps).toBe(0);
    expect(report.unplacedTaps).toBe(0);
    expect(report.placements.map((p) => p.kind)).toEqual(["show", "fighter", "fighter"]);
    for (const placement of report.placements) {
      expect(placement.taps).toBe(0);
      if (placement.kind === "fighter") expect(placement.profileViews).toBe(0);
    }
  });

  it("orders fighter placements from the main event down", () => {
    const report = sponsorReport(card, NOTHING, "all")!;
    const fighters = report.placements.flatMap((p) => (p.kind === "fighter" ? [p.fighter.id] : []));
    expect(fighters).toEqual(["baines", "lowe"]);
  });

  it("credits each tap to the placement its row names, and nowhere else", () => {
    const counts: ReportCounts = {
      programme: { opens: 40, visits: 31 },
      rows: [
        row("sponsor_tap", { sponsorId: "all" }, 5),
        row("sponsor_tap", { sponsorId: "all", boutNumber: 1, fighterId: "lowe" }, 3),
        row("sponsor_tap", { sponsorId: "all", boutNumber: 2, fighterId: "baines" }, 2),
        // The same sponsor tapped from the strip a second time, from the folded table.
        row("sponsor_tap", { sponsorId: "all" }, 1),
        // Somebody else's taps on the same fighter.
        row("sponsor_tap", { sponsorId: "corner", boutNumber: 1, fighterId: "lowe" }, 7),
        row("profile_view", { fighterId: "lowe" }, 11),
      ],
    };
    const report = sponsorReport(card, counts, "all")!;
    expect(report.taps).toBe(11);
    expect(report.unplacedTaps).toBe(0);
    const [show, baines, lowe] = report.placements;
    expect(show).toMatchObject({ kind: "show", taps: 6 });
    expect(baines).toMatchObject({ kind: "fighter", taps: 2, profileViews: 0 });
    expect(lowe).toMatchObject({ kind: "fighter", taps: 3, profileViews: 11 });
    expect(report.programme).toEqual({ opens: 40, visits: 31 });
  });

  it("measures a bout placement by the bout being opened and played", () => {
    const counts: ReportCounts = {
      programme: { opens: 40, visits: 31 },
      rows: [
        row("bout_expand", { boutNumber: 2 }, 14),
        row("bout_expand", { boutNumber: 2 }, 4),
        row("bout_expand", { boutNumber: 1 }, 9),
        row("tape_play", { boutNumber: 2 }, 6),
      ],
    };
    const [placement] = sponsorReport(card, counts, "bouts")!.placements;
    expect(placement).toMatchObject({
      kind: "bout",
      label: "Main Event",
      matchup: "baines v oner",
      opened: 18,
      played: 6,
      taps: 0,
      withdrawn: false,
    });
  });

  it("keeps a withdrawn bout's placement and says so", () => {
    const withdrawn: Card = {
      ...card,
      event: {
        ...card.event,
        bouts: card.event.bouts.map((b) => (b.number === 2 ? { ...b, cancelled: true } : b)),
      },
    };
    const [placement] = sponsorReport(withdrawn, NOTHING, "bouts")!.placements;
    expect(placement).toMatchObject({ kind: "bout", withdrawn: true });
  });

  it("counts taps from a placement the card no longer has, and says they are unplaced", () => {
    const counts: ReportCounts = {
      ...NOTHING,
      rows: [
        // Tapped under McLay's name, who no longer lists this sponsor.
        row("sponsor_tap", { sponsorId: "corner", boutNumber: 1, fighterId: "mclay" }, 4),
        row("sponsor_tap", { sponsorId: "corner", boutNumber: 1, fighterId: "lowe" }, 1),
      ],
    };
    const report = sponsorReport(card, counts, "corner")!;
    expect(report.taps).toBe(5);
    expect(report.unplacedTaps).toBe(4);
    expect(report.placements).toHaveLength(1);
    expect(report.placements[0].taps).toBe(1);
  });

  it("never reports more placed taps than there were taps", () => {
    const counts: ReportCounts = {
      ...NOTHING,
      rows: [
        row("sponsor_tap", { sponsorId: "all" }, 2),
        row("sponsor_tap", { sponsorId: "all", boutNumber: 1, fighterId: "lowe" }, 2),
        row("sponsor_tap", { sponsorId: "all", boutNumber: 2 }, 3),
      ],
    };
    const report = sponsorReport(card, counts, "all")!;
    const placed = report.placements.reduce((acc, p) => acc + p.taps, 0);
    expect(placed + report.unplacedTaps).toBe(report.taps);
    expect(report.unplacedTaps).toBeGreaterThanOrEqual(0);
  });

  it("reads a count D1 handed back as text or null as the number it is", () => {
    const counts: ReportCounts = {
      ...NOTHING,
      rows: [
        row("sponsor_tap", { sponsorId: "strip" }, "3" as unknown as number),
        row("sponsor_tap", { sponsorId: "strip" }, null as unknown as number),
      ],
    };
    expect(sponsorReport(card, counts, "strip")!.taps).toBe(3);
  });

  it("answers for a card with no bouts on it, which is ordinary", () => {
    const empty: Card = { ...card, event: { ...card.event, bouts: [] } };
    expect(reportableSponsors(empty, NOTHING).map((s) => s.id)).toEqual(["strip", "all"]);
    expect(sponsorReport(empty, NOTHING, "bouts")).toBeNull();
  });
});

describe("reportTimestamp", () => {
  it("says the time in London rather than in UTC", () => {
    // 20:40 UTC in November is 20:40 in London; in July it is 21:40.
    expect(reportTimestamp(new Date("2026-11-14T20:40:00Z"))).toContain("20:40");
    expect(reportTimestamp(new Date("2026-07-14T20:40:00Z"))).toContain("21:40");
    expect(reportTimestamp(new Date("2026-11-14T20:40:00Z"))).toContain("14 November 2026");
  });
});
