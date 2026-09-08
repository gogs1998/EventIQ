import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  eventVisibility,
  eventsOfPromoter,
  eventsShowingPortrait,
  inviteHoldsPortrait,
  loadCard,
  loadCardById,
  loadDashboardRows,
  inviteWasRevoked,
  loadInviteByToken,
  loadInvites,
  loadPromoterEvents,
  loadRenders,
  loadShowcase,
  renderKeysFor,
  trackRefsBelong,
  uniqueSlug,
} from "@/lib/db/queries";
import { INVITE_TTL_MS } from "@/lib/invite-token";
import { testDatabase } from "./harness";
import { plantPromoters, plantRenderKey, plantShow, plantSponsor } from "./fixtures";

/**
 * Every query with a where clause on ownership or publication, against a real
 * database with two promoters on it.
 *
 * The pure suite already holds the rules to account. What it cannot see is
 * whether the SQL actually says what the rule says, and that is where the
 * tenancy bugs in section 14 lived: a filter that reads correctly and selects
 * one row too many is invisible on an instance with one promoter, which is every
 * instance this has ever run on.
 */

const platform = testDatabase();

const eqEvent = (slug: string) => eq(schema.events.slug, slug);
const eqBout = (eventId: string, number: number) =>
  and(eq(schema.bouts.eventId, eventId), eq(schema.bouts.number, number));
const eqInvite = (eventId: string, fighterId: string) =>
  and(eq(schema.invites.eventId, eventId), eq(schema.invites.fighterId, fighterId));

/** Two promoters, a published show for one and a draft for the other. */
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
    bouts: 1,
  });
  return { db, published, draft };
}

describe("loadCard", () => {
  it("brings back the show, its promoter, its running order and its fighters", async () => {
    const { published } = await twoPromoters();

    const card = await loadCard(platform().db, "cage-county-12");

    expect(card?.eventId).toBe(published.eventId);
    expect(card?.promoterId).toBe("pr_cage");
    expect(card?.published).toBe(true);
    expect(card?.event.promoter.name).toBe("Cage County");
    expect(card?.event.bouts.map((bout) => bout.number)).toEqual([1, 2]);
    expect(Object.keys(card!.fighters).sort()).toEqual([...published.fighterIds].sort());
  });

  it("answers the same for a slug nobody has taken", async () => {
    await twoPromoters();
    expect(await loadCard(platform().db, "no-such-show")).toBeNull();
  });

  it("finds the same card by row id, so the queue and the dashboard agree", async () => {
    const { published } = await twoPromoters();

    const bySlug = await loadCard(platform().db, "cage-county-12");
    const byId = await loadCardById(platform().db, published.eventId);

    expect(byId).toEqual(bySlug);
  });

  it("carries only this promoter's sponsors, whoever else has one on their card", async () => {
    const { db } = await twoPromoters();
    await plantSponsor(db, { id: "sp_ours", promoterId: "pr_cage" });
    await plantSponsor(db, { id: "sp_theirs", promoterId: "pr_budo" });

    const card = await loadCard(db, "cage-county-12");

    expect(Object.keys(card!.sponsors)).toEqual(["sp_ours"]);
  });
});

describe("loadShowcase", () => {
  it("takes the named show when it is published", async () => {
    await twoPromoters();
    expect((await loadShowcase(platform().db, "cage-county-12"))?.event.slug).toBe(
      "cage-county-12",
    );
  });

  it("refuses a draft, so naming one here cannot publish it by the back door", async () => {
    await twoPromoters();
    expect(await loadShowcase(platform().db, "budo-79")).toBeNull();
  });

  it("answers nothing when the variable is unset", async () => {
    await twoPromoters();
    expect(await loadShowcase(platform().db, undefined)).toBeNull();
  });
});

describe("eventVisibility", () => {
  it("says who owns the show and whether it is published, without loading it", async () => {
    const { draft } = await twoPromoters();

    expect(await eventVisibility(platform().db, "budo-79")).toEqual({
      id: draft.eventId,
      published: false,
      promoterId: "pr_budo",
    });
  });

  it("is null for a slug that does not exist", async () => {
    await twoPromoters();
    expect(await eventVisibility(platform().db, "no-such-show")).toBeNull();
  });
});

describe("eventsOfPromoter", () => {
  it("is every show of theirs and none of anybody else's", async () => {
    const { db } = await twoPromoters();
    await plantShow(db, { promoterId: "pr_cage", slug: "cage-county-13", published: false });

    const events = await eventsOfPromoter(db, "pr_cage");

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.promoterId === "pr_cage")).toBe(true);
  });
});

describe("eventsShowingPortrait", () => {
  it("finds the shows a stored photograph is actually on", async () => {
    const { db, published } = await twoPromoters();
    const path = `/media/fighters/${published.fighterIds[0]}.jpg`;

    expect(await eventsShowingPortrait(db, path)).toEqual([
      { published: true, promoterId: "pr_cage" },
    ]);
  });

  it("finds nothing for an object no fighter row points at", async () => {
    const { db } = await twoPromoters();
    expect(await eventsShowingPortrait(db, "/media/fighters/nobody.jpg")).toEqual([]);
  });

  it("finds a fighter on two cards once for each", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    const second = await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-13",
      published: false,
    });
    // The same person, matched again on the second card: the fighters table is
    // deliberately global, so this is the ordinary case rather than an edge one.
    await db
      .update(schema.bouts)
      .set({ redId: fighterId })
      .where(eqBout(second.eventId, 1));

    const events = await eventsShowingPortrait(db, `/media/fighters/${fighterId}.jpg`);

    expect(events).toHaveLength(2);
    expect(events.filter((event) => event.published)).toHaveLength(1);
  });
});

describe("renderKeysFor", () => {
  it("brings back the unscoped keys and this promoter's, and nobody else's", async () => {
    const { db } = await twoPromoters();
    await plantRenderKey(db, { id: "rk_runner", key: "runner-key", promoterId: null });
    await plantRenderKey(db, { id: "rk_ours", key: "ours-key", promoterId: "pr_cage" });
    await plantRenderKey(db, { id: "rk_theirs", key: "theirs-key", promoterId: "pr_budo" });

    const keys = await renderKeysFor(db, ["pr_cage"]);

    expect(keys.map((key) => key.promoterId).sort()).toEqual([null, "pr_cage"]);
  });

  it("asks only about the runner's when there is no promoter to scope to", async () => {
    const { db } = await twoPromoters();
    await plantRenderKey(db, { id: "rk_runner", key: "runner-key", promoterId: null });
    await plantRenderKey(db, { id: "rk_ours", key: "ours-key", promoterId: "pr_cage" });

    expect(await renderKeysFor(db, [])).toHaveLength(1);
  });
});

describe("trackRefsBelong", () => {
  it("takes a bout, fighter and sponsor that are all on this show", async () => {
    const { db, published } = await twoPromoters();
    await plantSponsor(db, { id: "sp_ours", promoterId: "pr_cage" });
    await db
      .update(schema.bouts)
      .set({ sponsorId: "sp_ours" })
      .where(eqBout(published.eventId, 1));

    expect(
      await trackRefsBelong(db, published.eventId, {
        boutNumber: 1,
        fighterId: published.fighterIds[0],
        sponsorId: "sp_ours",
      }),
    ).toBe(true);
  });

  it("refuses a fighter who is on another show", async () => {
    const { db, published, draft } = await twoPromoters();

    expect(
      await trackRefsBelong(db, published.eventId, {
        boutNumber: null,
        fighterId: draft.fighterIds[0],
        sponsorId: null,
      }),
    ).toBe(false);
  });

  it("refuses a fighter who is on this show but not in the bout named beside them", async () => {
    const { db, published } = await twoPromoters();

    expect(
      await trackRefsBelong(db, published.eventId, {
        boutNumber: 1,
        fighterId: published.fighterIds[2],
        sponsorId: null,
      }),
    ).toBe(false);
  });

  it("refuses another promoter's sponsor", async () => {
    const { db, published } = await twoPromoters();
    await plantSponsor(db, { id: "sp_theirs", promoterId: "pr_budo" });

    expect(
      await trackRefsBelong(db, published.eventId, {
        boutNumber: null,
        fighterId: null,
        sponsorId: "sp_theirs",
      }),
    ).toBe(false);
  });
});

describe("loadPromoterEvents", () => {
  it("is their own shows, latest first", async () => {
    const { db } = await twoPromoters();
    await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-13",
      published: false,
      date: "2026-12-05",
    });

    const events = await loadPromoterEvents(db, "pr_cage");

    expect(events.map((event) => event.slug)).toEqual(["cage-county-13", "cage-county-12"]);
  });
});

describe("uniqueSlug", () => {
  it("gives the address the name makes where nothing holds it", async () => {
    const { db } = await twoPromoters();
    expect(await uniqueSlug(db, "Cage County 13", "pr_cage")).toEqual({ slug: "cage-county-13" });
  });

  it("suffixes around another promoter's show rather than naming it", async () => {
    const { db } = await twoPromoters();
    expect(await uniqueSlug(db, "Cage County 12", "pr_budo")).toEqual({
      slug: "cage-county-12-2",
    });
  });

  it("is null where the promoter already has that address, which they can see", async () => {
    const { db } = await twoPromoters();
    expect(await uniqueSlug(db, "Cage County 12", "pr_cage")).toBeNull();
  });

  it("is null for a numbered form of their own address as well", async () => {
    const { db } = await twoPromoters();
    await plantShow(db, { promoterId: "pr_budo", slug: "cage-county-12-2", published: false });
    expect(await uniqueSlug(db, "Cage County 12", "pr_budo")).toBeNull();
  });

  it("does not treat a longer name of theirs as the same address", async () => {
    const { db } = await twoPromoters();
    await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-13-rematch",
      published: false,
    });
    expect(await uniqueSlug(db, "Cage County 13", "pr_cage")).toEqual({ slug: "cage-county-13" });
  });
});

describe("loadInvites and loadDashboardRows", () => {
  it("gives the dashboard the link back, decrypted", async () => {
    const { db, published } = await twoPromoters();

    const invites = await loadInvites(db, published.eventId);

    for (const fighterId of published.fighterIds) {
      expect(invites[fighterId].token).toBe(published.tokens[fighterId]);
    }
  });

  it("decrypts them in the dashboard's batch too, where a second mapping used to forget", async () => {
    const { db, published } = await twoPromoters();

    const rows = await loadDashboardRows(db, published.eventId, "pr_cage", "2026-11-14");

    expect(Object.keys(rows.invites)).toHaveLength(4);
    expect(rows.invites[published.fighterIds[0]].token).toBe(
      published.tokens[published.fighterIds[0]],
    );
  });

  it("reads a row that is still in the clear, so a half-migrated card still works", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ token: "plaintext-token", tokenDigest: null, tokenCipher: null })
      .where(eqInvite(published.eventId, fighterId));

    const invites = await loadInvites(db, published.eventId);

    expect(invites[fighterId].token).toBe("plaintext-token");
  });

  it("counts nothing for a promoter's first show, rather than filling the space", async () => {
    const { db, published } = await twoPromoters();

    const rows = await loadDashboardRows(db, published.eventId, "pr_cage", "2026-11-14");

    expect(rows.previous).toBeNull();
    expect(rows.analytics.totals.programme_open).toBe(0);
  });

  it("names the promoter's own last show and counts it, not another promoter's", async () => {
    const { db, published } = await twoPromoters();
    // Budo's show is earlier than Cage County's and is not Cage County's last
    // show, however the dates fall.
    await db
      .update(schema.events)
      .set({ date: "2026-01-10" })
      .where(eqEvent("budo-79"));
    const earlier = await plantShow(db, {
      promoterId: "pr_cage",
      slug: "cage-county-11",
      published: true,
      date: "2026-03-07",
    });
    await db.insert(schema.analyticsEvents).values({
      eventId: earlier.eventId,
      kind: "programme_open",
      sessionId: "s1",
      createdAt: Date.now(),
    });

    const rows = await loadDashboardRows(db, published.eventId, "pr_cage", "2026-11-14");

    expect(rows.previous?.slug).toBe("cage-county-11");
    expect(rows.previousAnalytics.totals.programme_open).toBe(1);
    expect(rows.previousAnalytics.totals.spectators).toBe(1);
  });
});

describe("loadRenders", () => {
  it("plays the video a successful publish recorded, whatever the job is doing now", async () => {
    const { db, published } = await twoPromoters();
    await db.insert(schema.renderJobs).values({
      id: "rj_1",
      eventId: published.eventId,
      boutNumber: 1,
      status: "running",
      currentR2Key: "renders/cage-county-12/1-abc.mp4",
      requestedAt: Date.now(),
    });

    expect(await loadRenders(db, published.eventId)).toEqual({
      1: "/media/renders/cage-county-12/1-abc.mp4",
    });
  });

  it("offers nothing for a job that has never published one", async () => {
    const { db, published } = await twoPromoters();
    await db.insert(schema.renderJobs).values({
      id: "rj_1",
      eventId: published.eventId,
      boutNumber: 1,
      status: "queued",
      requestedAt: Date.now(),
    });

    expect(await loadRenders(db, published.eventId)).toEqual({});
  });
});

describe("loadInviteByToken", () => {
  it("finds the fighter, the show and the invite from an encrypted row", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];

    const row = await loadInviteByToken(db, published.tokens[fighterId]);

    expect(row?.fighter.id).toBe(fighterId);
    expect(row?.event.slug).toBe("cage-county-12");
  });

  it("finds a row still holding a plaintext token, so a fighter does not lose their form", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ token: "plaintext-token", tokenDigest: null, tokenCipher: null })
      .where(eqInvite(published.eventId, fighterId));

    expect((await loadInviteByToken(db, "plaintext-token"))?.fighter.id).toBe(fighterId);
  });

  it("is null for an expired link", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ expiresAt: Date.now() - 1 })
      .where(eqInvite(published.eventId, fighterId));

    expect(await loadInviteByToken(db, published.tokens[fighterId])).toBeNull();
  });

  it("is null for a revoked link, exactly as for a token nobody issued", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ revokedAt: Date.now() })
      .where(eqInvite(published.eventId, fighterId));

    expect(await loadInviteByToken(db, published.tokens[fighterId])).toBeNull();
    expect(await loadInviteByToken(db, "a-token-nobody-issued")).toBeNull();
  });

  /**
   * The one place a revoked link is told apart from a made-up one: the page
   * that says the fighter's details were removed. It has to find a sealed row
   * by its digest, because after the migration there is no plaintext to match
   * and every fighter's link is a sealed one (bug 42).
   */
  it("still knows a sealed link was revoked, and not a made-up one", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ revokedAt: Date.now() })
      .where(eqInvite(published.eventId, fighterId));

    expect(await inviteWasRevoked(db, published.tokens[fighterId])).toBe(true);
    expect(await inviteWasRevoked(db, published.tokens[published.fighterIds[1]])).toBe(false);
    expect(await inviteWasRevoked(db, "a-token-nobody-issued")).toBe(false);
  });

  it("is live where a row carries no expiry at all, which is what a migration leaves", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ expiresAt: null })
      .where(eqInvite(published.eventId, fighterId));

    expect(await loadInviteByToken(db, published.tokens[fighterId])).not.toBeNull();
  });

  it("still opens the day before the ninety days are up", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    const token = published.tokens[fighterId];

    expect(await loadInviteByToken(db, token, Date.now() + INVITE_TTL_MS - 1000)).not.toBeNull();
    expect(await loadInviteByToken(db, token, Date.now() + INVITE_TTL_MS + 1000)).toBeNull();
  });
});

describe("inviteHoldsPortrait", () => {
  it("lets a fighter's own live link reach their own photograph", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];

    expect(
      await inviteHoldsPortrait(db, published.tokens[fighterId], `/media/fighters/${fighterId}.jpg`),
    ).toBe(true);
  });

  it("does not let it reach anybody else's", async () => {
    const { db, published } = await twoPromoters();
    const [mine, theirs] = published.fighterIds;

    expect(
      await inviteHoldsPortrait(db, published.tokens[mine], `/media/fighters/${theirs}.jpg`),
    ).toBe(false);
  });

  it("stops the moment the link is revoked, so the credential cannot outlive it", async () => {
    const { db, published } = await twoPromoters();
    const fighterId = published.fighterIds[0];
    await db
      .update(schema.invites)
      .set({ revokedAt: Date.now() })
      .where(eqInvite(published.eventId, fighterId));

    expect(
      await inviteHoldsPortrait(db, published.tokens[fighterId], `/media/fighters/${fighterId}.jpg`),
    ).toBe(false);
  });
});
