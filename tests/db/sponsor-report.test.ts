import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { loadOwnedReport } from "@/lib/db/sponsor-report";
import { sponsorReport } from "@/lib/sponsor-report";
import { plantPromoters, plantShow, plantSponsor } from "./fixtures";
import { signInAs, testDatabase } from "./harness";

/**
 * The sponsor report, against a real database with two promoters on it.
 *
 * The arithmetic is held to account in lib/sponsor-report.test.ts. What this
 * covers is the half a pure test cannot: that the counts are only ever read
 * after the card has come through the ownership gate, and that a tap the
 * programme wrote — live or folded — arrives on the right line of the right
 * sponsor's page.
 */

const platform = testDatabase();

async function twoPromoters() {
  const db = platform().db;
  await plantPromoters(db, [
    { id: "pr_cage", name: "Cage County" },
    { id: "pr_budo", name: "Budo" },
  ]);
  const published = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: true,
    bouts: 2,
  });
  const draft = await plantShow(db, {
    promoterId: "pr_budo",
    slug: "budo-79",
    published: false,
  });

  await plantSponsor(db, { id: "sp_strip", promoterId: "pr_cage" });
  await plantSponsor(db, { id: "sp_bout", promoterId: "pr_cage" });
  await plantSponsor(db, { id: "sp_corner", promoterId: "pr_cage" });
  await plantSponsor(db, { id: "sp_budo", promoterId: "pr_budo" });

  await db.insert(schema.eventSponsors).values([
    { eventId: published.eventId, sponsorId: "sp_strip", position: 0 },
    { eventId: draft.eventId, sponsorId: "sp_budo", position: 0 },
  ]);
  await db
    .update(schema.bouts)
    .set({ sponsorId: "sp_bout" })
    .where(
      and(
        eq(schema.bouts.eventId, published.eventId),
        eq(schema.bouts.number, 2),
      ),
    );
  await db
    .insert(schema.fighterSponsors)
    .values({
      fighterId: published.fighterIds[0],
      sponsorId: "sp_corner",
      position: 0,
    });

  return { db, published, draft };
}

describe("loadOwnedReport", () => {
  it("hands a promoter the report for their own show", async () => {
    const { db } = await twoPromoters();
    const report = await loadOwnedReport(db, "cage-county-12", "pr_cage");
    expect(report?.card.event.slug).toBe("cage-county-12");
  });

  it("refuses another promoter's show, published or not, exactly as a missing one", async () => {
    const { db } = await twoPromoters();
    expect(await loadOwnedReport(db, "cage-county-12", "pr_budo")).toBeNull();
    expect(await loadOwnedReport(db, "budo-79", "pr_cage")).toBeNull();
    expect(await loadOwnedReport(db, "no-such-show", "pr_cage")).toBeNull();
  });

  it("asks nothing of the session, so a signed-in promoter cannot borrow one", async () => {
    const { db } = await twoPromoters();
    await signInAs("pr_cage");
    expect(await loadOwnedReport(db, "budo-79", "pr_budo")).not.toBeNull();
    expect(await loadOwnedReport(db, "budo-79", "pr_cage")).toBeNull();
  });

  it("hands a promoter their own draft, with every figure a nought", async () => {
    const { db } = await twoPromoters();
    const loaded = await loadOwnedReport(db, "budo-79", "pr_budo");
    expect(loaded?.card.published).toBe(false);
    const report = sponsorReport(loaded!.card, loaded!.counts, "sp_budo");
    expect(report?.taps).toBe(0);
    expect(report?.programme).toEqual({ opens: 0, visits: 0 });
  });

  it("will not write a page for a sponsor from another promoter's book", async () => {
    const { db } = await twoPromoters();
    const loaded = await loadOwnedReport(db, "cage-county-12", "pr_cage");
    expect(sponsorReport(loaded!.card, loaded!.counts, "sp_budo")).toBeNull();
  });

  it("credits live and folded counts to the placement they came from", async () => {
    const { db, published, draft } = await twoPromoters();
    const [red] = published.fighterIds;
    const now = Date.now();
    const live = (
      row: Partial<typeof schema.analyticsEvents.$inferInsert>,
    ) => ({
      eventId: published.eventId,
      kind: "sponsor_tap",
      sessionId: "s1",
      createdAt: now,
      ...row,
    });

    await db.insert(schema.analyticsEvents).values([
      live({ kind: "programme_open", sessionId: "s1" }),
      live({ kind: "programme_open", sessionId: "s2" }),
      live({ sponsorId: "sp_strip" }),
      live({ sponsorId: "sp_corner", boutNumber: 1, fighterId: red }),
      live({ kind: "bout_expand", boutNumber: 2 }),
      live({ kind: "tape_play", boutNumber: 2 }),
      live({ kind: "profile_view", fighterId: red }),
      // Another show's tap on a sponsor of the same name is not this show's.
      { ...live({ sponsorId: "sp_budo" }), eventId: draft.eventId },
    ]);
    await db.insert(schema.analyticsDaily).values([
      {
        eventId: published.eventId,
        day: "2026-11-14",
        kind: "sponsor_tap",
        sponsorId: "sp_strip",
        count: 4,
        distinctSessions: 3,
      },
      {
        eventId: published.eventId,
        day: "2026-11-14",
        kind: "bout_expand",
        boutNumber: 2,
        count: 9,
        distinctSessions: 7,
      },
      {
        eventId: published.eventId,
        day: "2026-11-14",
        kind: "programme_open",
        count: 20,
        distinctSessions: 12,
      },
    ]);

    const loaded = await loadOwnedReport(db, "cage-county-12", "pr_cage");
    const { card, counts } = loaded!;

    expect(counts.programme).toEqual({ opens: 22, visits: 14 });

    expect(sponsorReport(card, counts, "sp_strip")).toMatchObject({
      taps: 5,
      unplacedTaps: 0,
      placements: [{ kind: "show", taps: 5 }],
    });
    expect(sponsorReport(card, counts, "sp_bout")?.placements).toMatchObject([
      { kind: "bout", opened: 10, played: 1, taps: 0 },
    ]);
    expect(sponsorReport(card, counts, "sp_corner")?.placements).toMatchObject([
      { kind: "fighter", taps: 1, profileViews: 1 },
    ]);
  });
});
