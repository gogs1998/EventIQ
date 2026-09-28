import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { publicFighterAddresses, publishedShows } from "@/lib/visibility";
import { plantBout, plantFighter, plantPromoters, plantShow } from "./fixtures";
import { signInAs, testDatabase } from "./harness";

/**
 * Public discovery: who is on the list at `/shows`.
 *
 * Both answer about the whole instance rather than about one show, which is a
 * wider blast radius than anything else here has: a draft that leaks onto a
 * programme leaks to somebody who guessed a slug, and a draft that leaks onto
 * this list is announced to everybody who opens the front door, and then to a
 * search engine. So the rule is stricter than `loadVisibleCard`'s rather than
 * looser — there is no viewer in it at all, not even the promoter whose draft
 * it is.
 */

const platform = testDatabase();

/** Two promoters, four shows: two on, one still to be announced, one long run. */
async function twoPromotions() {
  const db = platform().db;
  await plantPromoters(db, [
    { id: "pr_cage", name: "Cage County Promotions" },
    { id: "pr_budo", name: "Budo" },
  ]);

  const live = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    name: "Cage County 12",
    published: true,
    bouts: 3,
    date: "2026-11-14",
    venue: "Grangemouth Town Hall",
    city: "Grangemouth",
  });
  const draft = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-13",
    name: "Cage County 13",
    published: false,
    bouts: 2,
    date: "2027-03-20",
    city: "Falkirk",
  });
  const rival = await plantShow(db, {
    promoterId: "pr_budo",
    slug: "budo-79",
    name: "Budo 79",
    published: true,
    bouts: 1,
    date: "2026-06-20",
    city: "Falkirk",
  });

  return { db, live, draft, rival };
}

describe("publishedShows", () => {
  it("is every published card, with the promoter, the hall and the bout count", async () => {
    const { db } = await twoPromotions();
    const shows = await publishedShows(db);

    expect(shows.map((show) => show.slug).sort()).toEqual(["budo-79", "cage-county-12"]);
    expect(shows.find((show) => show.slug === "cage-county-12")).toMatchObject({
      name: "Cage County 12",
      date: "2026-11-14",
      venue: "Grangemouth Town Hall",
      city: "Grangemouth",
      promoter: "Cage County Promotions",
      bouts: 3,
    });
  });

  /** The whole gate, and the one thing this file exists to hold. */
  it("never lists a draft", async () => {
    const { db } = await twoPromotions();
    expect((await publishedShows(db)).map((show) => show.slug)).not.toContain("cage-county-13");
  });

  /**
   * Not even for the promoter who owns it. `loadVisibleCard` softens for them
   * because a programme is their own working copy of one card; a public list of
   * what is on has no such reading, and a draft they can see on an address
   * anybody opens is a draft they may reasonably believe is on it.
   */
  it("does not soften for the promoter whose draft it is", async () => {
    const { db } = await twoPromotions();
    await signInAs("pr_cage");
    expect((await publishedShows(db)).map((show) => show.slug)).toEqual([
      "cage-county-12",
      "budo-79",
    ]);
  });

  it("brings a show onto the list the moment it is published", async () => {
    const { db, draft } = await twoPromotions();
    await db
      .update(schema.events)
      .set({ published: true })
      .where(eq(schema.events.id, draft.eventId));

    expect((await publishedShows(db)).map((show) => show.slug)).toContain("cage-county-13");
  });

  /**
   * A card published before its running order goes in is ordinary use, and the
   * count that comes back has to be a real zero rather than a missing row —
   * `listedBoutCount` is what decides to say nothing about it.
   */
  it("counts a published card with nothing on it as none, and still lists it", async () => {
    const db = platform().db;
    await plantPromoters(db, [{ id: "pr_cage", name: "Cage County Promotions" }]);
    await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-14",
      published: true,
      bouts: 0,
    });

    const shows = await publishedShows(db);
    expect(shows).toHaveLength(1);
    expect(shows[0].bouts).toBe(0);
  });

  it("says nothing at all on an instance with nothing published", async () => {
    const db = platform().db;
    await plantPromoters(db, [{ id: "pr_cage", name: "Cage County Promotions" }]);
    await plantShow(db, { promoterId: "pr_cage", slug: "draft", published: false });
    expect(await publishedShows(db)).toEqual([]);
  });
});

describe("publicFighterAddresses", () => {
  it("is everybody on a published bout, once each", async () => {
    const { db, live, rival } = await twoPromotions();
    const ids = await publicFighterAddresses(db);

    expect([...ids].sort()).toEqual([...live.fighterIds, ...rival.fighterIds].sort());
  });

  /** The same fact `loadPublicFighter` refuses a page on, asked of the table. */
  it("leaves out a fighter who has only ever been on a draft", async () => {
    const { db, draft } = await twoPromotions();
    const ids = await publicFighterAddresses(db);
    for (const id of draft.fighterIds) expect(ids).not.toContain(id);
  });

  /** One row, two published cards, one address. */
  it("names a fighter on two cards once", async () => {
    const { db, live, rival } = await twoPromotions();
    await plantFighter(db, { id: "owen-pryce", name: "Owen Pryce" });
    await plantBout(db, {
      eventId: live.eventId,
      number: 9,
      redId: "owen-pryce",
      blueId: live.fighterIds[0],
    });
    await plantBout(db, {
      eventId: rival.eventId,
      number: 9,
      redId: "owen-pryce",
      blueId: rival.fighterIds[0],
    });

    const ids = await publicFighterAddresses(db);
    expect(ids.filter((id) => id === "owen-pryce")).toHaveLength(1);
  });
});
