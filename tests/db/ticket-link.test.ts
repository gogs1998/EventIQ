import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { POST as track } from "@/app/api/track/route";
import { setTicketLink } from "@/app/promoter/actions";
import { ACTION_ERRORS } from "@/lib/copy";
import { MAX_TICKET_URL } from "@/lib/ticket-link";
import { plantPromoters, plantShow } from "./fixtures";
import { signInAs, testDatabase } from "./harness";
import { revalidatedPaths } from "./next-cache";

/**
 * The ticket link, from the outside.
 *
 * `setTicketLink` is an endpoint like every other promoter action, so the form's
 * `type="url"` is a courtesy and the check that matters is the one in here: what
 * a signed-in promoter can post straight at it, past the form, and what ends up
 * in the row a spectator's phone will open. The counter half is the same idea
 * from the other side — `/api/track` takes no credential, so a ticket tap is
 * only written where the programme was actually showing a link to tap.
 */

const platform = testDatabase();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** A calendar day this many days from the real clock, which the route reads. */
function dayFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function ownShow(options: { published?: boolean; date?: string } = {}) {
  const db = platform().db;
  await plantPromoters(db, [{ id: "pr_cage", name: "Cage County" }]);
  const show = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: options.published ?? false,
    date: options.date ?? dayFromNow(14),
  });
  await signInAs("pr_cage");
  return { db, show };
}

async function storedLink(eventId: string): Promise<string | null> {
  const [row] = await platform()
    .db.select({ ticketUrl: schema.events.ticketUrl })
    .from(schema.events)
    .where(eq(schema.events.id, eventId));
  return row.ticketUrl;
}

describe("setTicketLink", () => {
  it("stores an https address as the browser will read it", async () => {
    const { show } = await ownShow();

    const result = await setTicketLink(
      show.slug,
      form({ ticketUrl: "  https://Tickets.Example.com/cage-county-12?ref=programme  " }),
    );

    expect(result).toEqual({
      ok: true,
      ticketUrl: "https://tickets.example.com/cage-county-12?ref=programme",
    });
    expect(await storedLink(show.eventId)).toBe(
      "https://tickets.example.com/cage-county-12?ref=programme",
    );
    expect(revalidatedPaths()).toContain(`/e/${show.slug}`);
  });

  /**
   * Each of these is something the form would have stopped or never sent, posted
   * straight at the action. The row has to be exactly as it was afterwards: a
   * refusal that wrote half of something is not a refusal.
   */
  it.each([
    ["plain http", "http://tickets.example.com/cc12", ACTION_ERRORS.ticketLinkNotHttps],
    ["no scheme at all", "tickets.example.com/cc12", ACTION_ERRORS.ticketLinkNotHttps],
    ["a script", "javascript:alert(document.cookie)", ACTION_ERRORS.ticketLinkNotHttps],
    ["a document", "data:text/html,<script>alert(1)</script>", ACTION_ERRORS.ticketLinkNotHttps],
    ["a host disguised by a userinfo", "https://eventiq.win@phish.example/", ACTION_ERRORS.ticketLinkUnreadable],
    ["the local network", "https://192.168.0.1/tickets", ACTION_ERRORS.ticketLinkUnreadable],
    ["a bare host", "https://localhost/tickets", ACTION_ERRORS.ticketLinkUnreadable],
    ["a space in the address", "https://tickets.example.com/cage county", ACTION_ERRORS.ticketLinkUnreadable],
    [
      "an address longer than any ticket page",
      `https://tickets.example.com/${"a".repeat(MAX_TICKET_URL)}`,
      ACTION_ERRORS.ticketLinkTooLong,
    ],
  ])("refuses %s and leaves the stored link alone", async (_case, typed, error) => {
    const { db, show } = await ownShow();
    await db
      .update(schema.events)
      .set({ ticketUrl: "https://tickets.example.com/before" })
      .where(eq(schema.events.id, show.eventId));

    expect(await setTicketLink(show.slug, form({ ticketUrl: typed }))).toEqual({ ok: false, error });
    expect(await storedLink(show.eventId)).toBe("https://tickets.example.com/before");
  });

  it("takes the link off when the box is emptied", async () => {
    const { db, show } = await ownShow();
    await db
      .update(schema.events)
      .set({ ticketUrl: "https://tickets.example.com/before" })
      .where(eq(schema.events.id, show.eventId));

    expect(await setTicketLink(show.slug, form({ ticketUrl: "   " }))).toEqual({
      ok: true,
      ticketUrl: null,
    });
    expect(await storedLink(show.eventId)).toBeNull();
  });

  /** A ticket link is in none of the videos, so changing one remakes none of them. */
  it("queues no render", async () => {
    const { db, show } = await ownShow();

    await setTicketLink(show.slug, form({ ticketUrl: "https://tickets.example.com/cc12" }));

    const jobs = await db
      .select()
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.eventId, show.eventId));
    expect(jobs).toEqual([]);
  });
});

/** A beacon from a phone reading the programme, as the browser would send it. */
function beacon(body: Record<string, unknown>): Request {
  return new Request("https://eventiq.win/api/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-dest": "empty",
    },
    body: JSON.stringify(body),
  });
}

async function ticketTaps(eventId: string): Promise<number> {
  const rows = await platform()
    .db.select()
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.eventId, eventId));
  return rows.filter((row) => row.kind === "ticket_tap").length;
}

describe("counting a tap on the ticket link", () => {
  async function liveShow(date = dayFromNow(14), ticketUrl: string | null = "https://tickets.example.com/cc12") {
    const { db, show } = await ownShow({ published: true, date });
    await db.update(schema.events).set({ ticketUrl }).where(eq(schema.events.id, show.eventId));
    return show;
  }

  it("counts a tap on a published show that is showing a link", async () => {
    const show = await liveShow();

    expect((await track(beacon({ slug: show.slug, kind: "ticket_tap" }))).status).toBe(204);
    expect(await ticketTaps(show.eventId)).toBe(1);
  });

  it("still counts on the day of the show, when tickets are on the door", async () => {
    const show = await liveShow(dayFromNow(0));

    await track(beacon({ slug: show.slug, kind: "ticket_tap" }));
    expect(await ticketTaps(show.eventId)).toBe(1);
  });

  it("writes nothing for a show with no ticket link, since there was nothing to tap", async () => {
    const show = await liveShow(dayFromNow(14), null);

    expect((await track(beacon({ slug: show.slug, kind: "ticket_tap" }))).status).toBe(204);
    expect(await ticketTaps(show.eventId)).toBe(0);
  });

  it("writes nothing once the show has run and the programme has taken the link down", async () => {
    const show = await liveShow(dayFromNow(-2));

    await track(beacon({ slug: show.slug, kind: "ticket_tap" }));
    expect(await ticketTaps(show.eventId)).toBe(0);
  });

  it("writes nothing for a link planted by hand that the programme would refuse to draw", async () => {
    const show = await liveShow(dayFromNow(14), "http://tickets.example.com/cc12");

    await track(beacon({ slug: show.slug, kind: "ticket_tap" }));
    expect(await ticketTaps(show.eventId)).toBe(0);
  });

  it("writes nothing for a draft, whose programme nobody else can read", async () => {
    const { db, show } = await ownShow({ published: false });
    await db
      .update(schema.events)
      .set({ ticketUrl: "https://tickets.example.com/cc12" })
      .where(eq(schema.events.id, show.eventId));

    await track(beacon({ slug: show.slug, kind: "ticket_tap" }));
    expect(await ticketTaps(show.eventId)).toBe(0);
  });

  it("writes nothing for a ticket tap that names a bout, a fighter or a sponsor", async () => {
    const show = await liveShow();

    await track(beacon({ slug: show.slug, kind: "ticket_tap", boutNumber: 1 }));
    await track(beacon({ slug: show.slug, kind: "ticket_tap", fighterId: show.fighterIds[0] }));
    expect(await ticketTaps(show.eventId)).toBe(0);
  });
});
