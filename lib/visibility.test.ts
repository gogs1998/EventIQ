import { describe, expect, it } from "vitest";
import { secretMatches } from "@/lib/auth";
import { renderableTo, visibleTo } from "@/lib/visibility";

const live = { published: true, promoterId: "cage-county" };
const draft = { published: false, promoterId: "cage-county" };

/**
 * The rule used to live inline in one page, which is how three other routes came
 * to be missing it: the printable table card had no publish check at all, and
 * both generateMetadata functions described any card that loaded. Every public
 * route now goes through loadVisibleCard, and this is the whole of what it
 * decides.
 */
describe("visibleTo", () => {
  it("lets anybody read a published show", () => {
    expect(visibleTo(live, null)).toBe(true);
    expect(visibleTo(live, "somebody-else")).toBe(true);
  });

  it("keeps a draft show to the promoter who owns it", () => {
    expect(visibleTo(draft, "cage-county")).toBe(true);
  });

  it("shows a draft to nobody else, signed in or not", () => {
    expect(visibleTo(draft, null)).toBe(false);
    expect(visibleTo(draft, undefined)).toBe(false);
    expect(visibleTo(draft, "another-promoter")).toBe(false);
  });

  it("does not treat an absent viewer as an absent owner", () => {
    expect(visibleTo({ published: false, promoterId: "" }, "")).toBe(false);
    expect(visibleTo({ published: false, promoterId: "" }, null)).toBe(false);
  });
});

/**
 * The capture page the mp4 renderer screenshots cannot use the rule above,
 * because it has to work on a card before it is published — that is what
 * rendering a card is for. It was therefore the one route reading any show
 * anybody could name, and a slug is the promoter's own show name, so an audit
 * pulled a draft's event name, venue, city, date, both fighters and their gyms
 * straight out of it while every other public route answered 404.
 *
 * The key half of the answer is `secretMatches`, which is exercised against real
 * Web Crypto in auth.test.ts; both halves are composed here, because the way
 * this goes wrong is a caller with no credential at all being let through.
 */
describe("renderableTo", () => {
  const card = { promoterId: "cage-county" };
  const KEY = "the-render-key";

  const asRenderer = async (presented: string | null, configured: string | undefined) =>
    renderableTo(card, { keyMatched: await secretMatches(presented, configured), viewerId: null });

  it("refuses a caller with no credential at all", async () => {
    expect(await asRenderer(null, KEY)).toBe(false);
    expect(renderableTo(card, { keyMatched: false })).toBe(false);
    expect(renderableTo(card, { keyMatched: false, viewerId: null })).toBe(false);
  });

  it("accepts the render key", async () => {
    expect(await asRenderer(KEY, KEY)).toBe(true);
  });

  it("refuses a wrong render key", async () => {
    expect(await asRenderer("not-the-render-key", KEY)).toBe(false);
    expect(await asRenderer(`${KEY} `, KEY)).toBe(false);
  });

  it("refuses everybody when no key is configured, rather than falling open", async () => {
    expect(await asRenderer(KEY, undefined)).toBe(false);
    expect(await asRenderer("", undefined)).toBe(false);
    expect(await asRenderer(null, undefined)).toBe(false);
  });

  it("accepts the promoter who owns the show, so they can watch their own render", () => {
    expect(renderableTo(card, { keyMatched: false, viewerId: "cage-county" })).toBe(true);
  });

  it("refuses another promoter's session", () => {
    expect(renderableTo(card, { keyMatched: false, viewerId: "another-promoter" })).toBe(false);
    expect(renderableTo({ promoterId: "" }, { keyMatched: false, viewerId: "" })).toBe(false);
  });
});
