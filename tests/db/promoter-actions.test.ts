import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  addBout,
  createEvent,
  removeBout,
  setBoutOff,
  setPublished,
  updateBout,
  updateEvent,
  updateFighter,
} from "@/app/promoter/actions";
import { addSponsor } from "@/app/promoter/sponsor-actions";
import {
  markInviteSent,
  regenerateInvite,
  revokeInvite,
} from "@/app/promoter/invite-actions";
import { requestRender } from "@/app/promoter/render-actions";
import { logout } from "@/app/promoter/login/actions";
import type { ActionResult } from "@/lib/action-result";
import { ACTION_ERRORS } from "@/lib/copy";
import { currentPromoter } from "@/lib/session";
import { plantPromoters, plantShow, type PlantedShow } from "./fixtures";
import { cookiesCleared } from "./request";
import { redirectedTo } from "./next-navigation";
import { signInAs, testDatabase } from "./harness";

/**
 * The ownership boundary, from the outside.
 *
 * Every one of these is a server action: an endpoint anybody can post to with a
 * slug of their choosing. The slug is another promoter's show name and therefore
 * guessable, so what has to hold for all of them at once is that a promoter
 * signed in to their own account gets the same answer for somebody else's show
 * as for a show that does not exist, and that nothing on it moves.
 *
 * Table-driven on purpose. The rule is one function now — `loadOwnedCard` — but
 * the thing that has actually gone wrong here before is an action added later
 * that forgot to ask, and a list every action has to be in is what catches that.
 */

const platform = testDatabase();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Cage County holds the show. Budo is signed in and is not entitled to it. */
async function twoPromoters() {
  const db = platform().db;
  await plantPromoters(db, [
    { id: "pr_cage", name: "Cage County" },
    { id: "pr_budo", name: "Budo" },
  ]);
  const show = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: false,
    bouts: 3,
  });
  return { db, show };
}

/** Everything about a show that an action could move. */
async function snapshot(eventId: string): Promise<string> {
  const db = platform().db;
  const [events, bouts, invites, sponsors, jobs] = await db.batch([
    db.select().from(schema.events).where(eq(schema.events.id, eventId)),
    db.select().from(schema.bouts).where(eq(schema.bouts.eventId, eventId)),
    db.select().from(schema.invites).where(eq(schema.invites.eventId, eventId)),
    db.select().from(schema.sponsors),
    db.select().from(schema.renderJobs).where(eq(schema.renderJobs.eventId, eventId)),
  ]);
  const fighters = await db.select().from(schema.fighters);
  return JSON.stringify({ events, bouts, invites, sponsors, jobs, fighters });
}

const actions: { name: string; run: (show: PlantedShow) => Promise<ActionResult> }[] = [
  { name: "updateEvent", run: (show) => updateEvent(show.slug, form({ name: "Renamed" })) },
  { name: "setPublished", run: (show) => setPublished(show.slug, true) },
  {
    name: "addBout",
    run: (show) => addBout(show.slug, form({ redName: "Owen Pryce", blueName: "Dre Osei" })),
  },
  { name: "updateBout", run: (show) => updateBout(show.slug, 1, form({ rounds: "5" })) },
  { name: "setBoutOff", run: (show) => setBoutOff(show.slug, 1, true, "Weight") },
  { name: "removeBout", run: (show) => removeBout(show.slug, 1) },
  {
    name: "updateFighter",
    run: (show) => updateFighter(show.slug, show.fighterIds[0], form({ name: "Someone Else" })),
  },
  { name: "addSponsor", run: (show) => addSponsor(show.slug, form({ name: "Mouthguards.pro" })) },
  { name: "markInviteSent", run: (show) => markInviteSent(show.slug, show.fighterIds[0]) },
  { name: "regenerateInvite", run: (show) => regenerateInvite(show.slug, show.fighterIds[0]) },
  { name: "revokeInvite", run: (show) => revokeInvite(show.slug, show.fighterIds[0]) },
];

describe.each(actions)("$name", ({ run }) => {
  it("answers another promoter the way it answers a show that is not there", async () => {
    const { show } = await twoPromoters();
    await signInAs("pr_budo");
    const before = await snapshot(show.eventId);

    expect(await run(show)).toEqual({ ok: false, error: ACTION_ERRORS.noSuchShow });
    expect(await snapshot(show.eventId)).toBe(before);
  });

  it("tells a promoter whose session has run out, rather than reading as a crash", async () => {
    const { show } = await twoPromoters();
    const before = await snapshot(show.eventId);

    expect(await run(show)).toEqual({ ok: false, error: ACTION_ERRORS.signedOut });
    expect(await snapshot(show.eventId)).toBe(before);
  });

  it("goes through for the promoter who owns the show", async () => {
    const { show } = await twoPromoters();
    await signInAs("pr_cage");

    expect(await run(show)).toMatchObject({ ok: true });
  });
});

describe("requestRender", () => {
  it("refuses another promoter's card", async () => {
    const { show } = await twoPromoters();
    await signInAs("pr_budo");

    await expect(requestRender(show.slug, "all")).rejects.toThrow("No such show");
    expect(await platform().db.select().from(schema.renderJobs)).toEqual([]);
  });

  it("queues the card for the promoter who owns it", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");

    await requestRender(show.slug, "all");

    expect(await db.select().from(schema.renderJobs)).toHaveLength(3);
  });
});

describe("what the owning promoter's actions actually do", () => {
  it("renames the show and leaves the fields the form did not carry", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");

    await updateEvent(show.slug, form({ name: "Cage County 12: Redemption", venue: "" }));

    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, show.eventId));
    expect(event.name).toBe("Cage County 12: Redemption");
    expect(event.venue).toBe("Town Hall");
  });

  it("puts a new bout on top of the running order, with both corners and both links", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");

    await addBout(show.slug, form({ redName: "Owen Pryce", blueName: "Dre Osei" }));

    const bouts = await db
      .select()
      .from(schema.bouts)
      .where(eq(schema.bouts.eventId, show.eventId))
      .orderBy(schema.bouts.number);
    expect(bouts.map((bout) => bout.number)).toEqual([1, 2, 3, 4]);
    expect(bouts[3].redId).toBe("owen-pryce");

    const invites = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.eventId, show.eventId));
    expect(invites).toHaveLength(8);
    // Sealed, never in the clear, whichever door issued it.
    expect(invites.every((invite) => invite.token === null && invite.tokenDigest)).toBe(true);
  });

  it("closes the gap in the running order while the show is a draft", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");

    await removeBout(show.slug, 2);

    const bouts = await db
      .select()
      .from(schema.bouts)
      .where(eq(schema.bouts.eventId, show.eventId))
      .orderBy(schema.bouts.number);
    expect(bouts.map((bout) => bout.number)).toEqual([1, 2]);
  });

  it("pulls the link of a corner it leaves on no other bout", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");
    const [red, blue] = show.fighterIds;

    await removeBout(show.slug, 1);

    const invites = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.eventId, show.eventId));
    const revoked = invites.filter((invite) => invite.revokedAt !== null);
    expect(revoked.map((invite) => invite.fighterId).sort()).toEqual([red, blue].sort());
    // The rows are still there: a revoked invite records that the fighter was
    // asked, and the removal has to be visible afterwards.
    expect(invites).toHaveLength(6);
  });

  it("leaves the profile itself alone, because a bout removed in error is a click", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");
    const red = show.fighterIds[0];
    await db
      .update(schema.fighters)
      .set({ recordW: 4, recordL: 1, recordD: 0, hometown: "Falkirk" })
      .where(eq(schema.fighters.id, red));

    await removeBout(show.slug, 1);

    const [fighter] = await db.select().from(schema.fighters).where(eq(schema.fighters.id, red));
    // Clearing this is `npm run retention` and the fighter's own control, never
    // a promoter's mis-click. See section 6g.
    expect(fighter).toMatchObject({ recordW: 4, hometown: "Falkirk" });
  });

  it("leaves a fighter still on another bout of the same show their link", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");
    const red = show.fighterIds[0];
    // The same person matched twice on one card, which happens on a smoker.
    await db
      .update(schema.bouts)
      .set({ redId: red })
      .where(eq(schema.bouts.id, `bo_${show.slug}_3`));

    await removeBout(show.slug, 1);

    const invites = await db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.eventId, show.eventId));
    expect(invites.find((invite) => invite.fighterId === red)?.revokedAt).toBeNull();
    // Their opponent has nothing left on the card, so theirs goes.
    expect(invites.find((invite) => invite.fighterId === show.fighterIds[1])?.revokedAt).not.toBeNull();
  });

  it("does not ask for a video for the bout that has gone", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");
    await requestRender(show.slug, "all");

    await removeBout(show.slug, 3);

    const jobs = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.eventId, show.eventId));
    expect(jobs.map((job) => job.boutNumber).sort()).toEqual([1, 2]);
  });

  it("skips the number instead once spectators are reading the card", async () => {
    const { db, show } = await twoPromoters();
    await signInAs("pr_cage");
    await setPublished(show.slug, true);

    await removeBout(show.slug, 2);

    const bouts = await db
      .select()
      .from(schema.bouts)
      .where(eq(schema.bouts.eventId, show.eventId))
      .orderBy(schema.bouts.number);
    expect(bouts.map((bout) => bout.number)).toEqual([1, 3]);
  });

  it("refuses a sponsor from another promoter's book on a bout", async () => {
    const { db, show } = await twoPromoters();
    // A sponsor id is not a secret and the programme sets a sponsor's name in
    // its own typography, so an id typed into the form would have published one
    // promoter's client on another's card.
    await db.insert(schema.sponsors).values({
      id: "sp_budo",
      promoterId: "pr_budo",
      name: "Somebody else's client",
      createdAt: Date.now(),
    });

    await signInAs("pr_cage");
    expect(await updateBout(show.slug, 1, form({ sponsorId: "sp_budo" }))).toEqual({
      ok: false,
      error: ACTION_ERRORS.noSuchSponsor,
    });
  });
});

describe("createEvent", () => {
  it("refuses a caller with no session before it writes anything", async () => {
    await twoPromoters();

    expect(await createEvent(null, form({ name: "Budo 79", date: "2026-12-05" }))).toEqual({
      ok: false,
      error: ACTION_ERRORS.signedOut,
    });
    expect(await platform().db.select().from(schema.events)).toHaveLength(1);
  });

  it("creates a show nobody can read yet, and goes to it", async () => {
    const { db } = await twoPromoters();
    await signInAs("pr_budo");

    const went = await redirectedTo(() =>
      createEvent(null, form({ name: "Budo 79", date: "2026-12-05" })),
    );

    expect(went).toBe("/promoter/e/budo-79");
    const [event] = await db.select().from(schema.events).where(eq(schema.events.slug, "budo-79"));
    expect(event.promoterId).toBe("pr_budo");
    expect(event.published).toBe(false);
  });

  it("refuses a name with no address in it", async () => {
    await twoPromoters();
    await signInAs("pr_budo");

    expect(await createEvent(null, form({ name: "!!!", date: "2026-12-05" }))).toEqual({
      ok: false,
      error: ACTION_ERRORS.showNameNeedsCharacters,
    });
  });

  it("suffixes the address rather than saying whose show is already at it", async () => {
    const { db } = await twoPromoters();
    await signInAs("pr_budo");

    // Cage County's show is at cage-county-12 and Budo cannot see it. Refusing
    // here would tell them it exists, which is the one fact every other answer
    // on this path is written to withhold.
    const went = await redirectedTo(() =>
      createEvent(null, form({ name: "Cage County 12", date: "2026-12-05" })),
    );

    expect(went).toBe("/promoter/e/cage-county-12-2");
    const [event] = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.slug, "cage-county-12-2"));
    expect(event.promoterId).toBe("pr_budo");
    expect(event.name).toBe("Cage County 12");
  });

  it("says so where the promoter already has a show at that address", async () => {
    await twoPromoters();
    await signInAs("pr_cage");

    expect(await createEvent(null, form({ name: "cage county 12", date: "2026-12-05" }))).toEqual({
      ok: false,
      error: ACTION_ERRORS.addressTaken,
    });
  });

  it("says so for a suffixed address of their own too, rather than making a third", async () => {
    await twoPromoters();
    await signInAs("pr_budo");
    // Budo's first "Cage County 12" landed at -2 because Cage County holds the
    // plain one. Typing the same name again is the same show twice, and they
    // can see the one they already have.
    await redirectedTo(() =>
      createEvent(null, form({ name: "Cage County 12", date: "2026-12-05" })),
    );

    expect(await createEvent(null, form({ name: "Cage County 12", date: "2027-01-09" }))).toEqual({
      ok: false,
      error: ACTION_ERRORS.addressTaken,
    });
  });

  it("still takes a differently named show that starts the same way", async () => {
    await twoPromoters();
    await signInAs("pr_cage");

    const went = await redirectedTo(() =>
      createEvent(null, form({ name: "Cage County 12 Rematch", date: "2027-01-09" })),
    );

    expect(went).toBe("/promoter/e/cage-county-12-rematch");
  });
});

/**
 * Signing out, from the outside.
 *
 * The first of these is what anybody would write and it passed throughout bug 44,
 * because a jar in a test forgets a cookie whenever it is asked to. A browser
 * does not: it matches the header expiring a cookie against the one it holds, and
 * under a `__Host-` name it refuses the header outright unless it is Secure and at
 * the root. So the second is the one that would have caught it — the promoter
 * stayed signed in on staging while every local run of this suite and of the
 * walkthrough said sign-out worked.
 */
describe("signing out", () => {
  it("leaves the caller holding nothing the gate accepts", async () => {
    await twoPromoters();
    await signInAs("pr_cage");
    expect(await currentPromoter()).not.toBeNull();

    expect(await redirectedTo(() => logout())).toBe("/");

    expect(await currentPromoter()).toBeNull();
  });

  it("expires the __Host- name with the attributes that name demands", async () => {
    await twoPromoters();
    await signInAs("pr_cage");
    await redirectedTo(() => logout());

    const prefixed = cookiesCleared().filter((cookie) => cookie.name.startsWith("__Host-"));
    expect(prefixed.length).toBeGreaterThan(0);
    for (const cookie of prefixed) {
      expect(cookie.secure).toBe(true);
      expect(cookie.path).toBe("/");
      // The third thing the prefix requires, and the one that is an absence.
      expect(cookie.domain).toBeUndefined();
    }
  });

  it("clears the plain name too, so neither side of the https line lingers", async () => {
    await twoPromoters();
    await signInAs("pr_cage");
    await redirectedTo(() => logout());

    expect(cookiesCleared().map((cookie) => cookie.name)).toContain("eventiq_session");
  });
});
