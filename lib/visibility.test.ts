import { describe, expect, it } from "vitest";
import { secretMatches } from "@/lib/auth";
import {
  inviteTokenFromReferrer,
  mediaVisibleTo,
  parseMediaKey,
  renderableTo,
  visibleTo,
} from "@/lib/visibility";

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

/**
 * `/media` served every object in the bucket to anybody who could name a key.
 * The keys carry a random suffix, so nothing was enumerable — which is the exact
 * argument that left the capture page open, and section 6c is what came of it. A
 * draft show's video and a photograph on a card nobody has published are the
 * same secret as the card, so they go behind the same rule.
 */
describe("parseMediaKey", () => {
  it("reads a portrait as the path the fighter row stores", () => {
    expect(parseMediaKey("fighters/owen-pryce-ab12.jpg")).toEqual({
      kind: "portrait",
      path: "/media/fighters/owen-pryce-ab12.jpg",
    });
    expect(parseMediaKey("cutouts/owen-pryce-cd34.webp")).toEqual({
      kind: "portrait",
      path: "/media/cutouts/owen-pryce-cd34.webp",
    });
  });

  it("reads a render as the show it is of", () => {
    expect(parseMediaKey("renders/cage-county-12/bout-15.mp4")).toEqual({
      kind: "render",
      slug: "cage-county-12",
    });
  });

  it("reads a sponsor's emblem as the promoter it belongs to", () => {
    expect(parseMediaKey("sponsors/pr_9aBc/sp_1dEf-0a1b2c3d.png")).toEqual({
      kind: "sponsor",
      promoterId: "pr_9aBc",
    });
  });

  it("refuses a key with no rule attached to it, rather than serving it", () => {
    expect(parseMediaKey("secrets/backup.sql")).toBeNull();
    expect(parseMediaKey("fighters")).toBeNull();
    expect(parseMediaKey("fighters/sub/dir.jpg")).toBeNull();
    expect(parseMediaKey("renders/cage-county-12")).toBeNull();
    expect(parseMediaKey("sponsors/pr_9aBc")).toBeNull();
    expect(parseMediaKey("sponsors/pr_9aBc/deeper/mark.png")).toBeNull();
    expect(parseMediaKey("")).toBeNull();
  });

  it("refuses traversal and anything that is not a plain key", () => {
    expect(parseMediaKey("fighters/../secrets.sql")).toBeNull();
    expect(parseMediaKey("../fighters/a.jpg")).toBeNull();
    expect(parseMediaKey("/fighters/a.jpg")).toBeNull();
    expect(parseMediaKey("fighters/a b.jpg")).toBeNull();
    expect(parseMediaKey("fighters/a%2f.jpg")).toBeNull();
  });
});

describe("mediaVisibleTo", () => {
  const stranger = { keyMatched: false, viewerId: null };
  const live = [{ published: true, promoterId: "cage-county" }];
  const draft = [{ published: false, promoterId: "cage-county" }];

  it("serves anything on a published show to anybody, and lets it be cached", () => {
    expect(mediaVisibleTo({ events: live }, stranger)).toEqual({ visible: true, public: true });
  });

  it("refuses a draft show's object to a stranger", () => {
    expect(mediaVisibleTo({ events: draft }, stranger)).toEqual({ visible: false, public: false });
    expect(mediaVisibleTo({ events: draft }, { keyMatched: false })).toEqual({
      visible: false,
      public: false,
    });
  });

  /**
   * The one this exists for. `/render/probe-gate-2/1` was closed and the mp4 it
   * produced was not: the video of an unpublished show is the show.
   */
  it("refuses a draft show's rendered video to a stranger who names the key", () => {
    expect(mediaVisibleTo({ events: draft }, stranger).visible).toBe(false);
  });

  it("gives the owning promoter their own draft, privately", () => {
    expect(mediaVisibleTo({ events: draft }, { keyMatched: false, viewerId: "cage-county" })).toEqual(
      { visible: true, public: false },
    );
  });

  it("refuses another promoter's session", () => {
    expect(
      mediaVisibleTo({ events: draft }, { keyMatched: false, viewerId: "another-promoter" }).visible,
    ).toBe(false);
  });

  it("accepts the render key, which is what the exporter holds", () => {
    expect(mediaVisibleTo({ events: draft }, { keyMatched: true, viewerId: null })).toEqual({
      visible: true,
      public: false,
    });
  });

  /**
   * A fighter is shown their own photograph back in the questionnaire, and on a
   * draft card they hold none of the credentials above — only the token that is
   * their whole authorisation, in the address of the page the image is on.
   */
  it("shows a fighter their own photograph on a card that is not published", () => {
    expect(mediaVisibleTo({ events: draft, heldByInvite: true }, stranger)).toEqual({
      visible: true,
      public: false,
    });
  });

  it("refuses an object that hangs off no show at all", () => {
    expect(mediaVisibleTo({ events: [] }, stranger).visible).toBe(false);
    expect(mediaVisibleTo({ events: [] }, { keyMatched: false, viewerId: "cage-county" }).visible).toBe(
      false,
    );
  });

  /**
   * A sponsor's emblem belongs to the promoter rather than to one card, and it
   * exists from the moment it is uploaded — which can be before that promoter
   * has published anything at all. Without the owner it would be an object
   * hanging off no show, refused above, and the promoter would not be able to
   * see the artwork they had just sent.
   */
  it("shows a promoter their own emblem before any of their shows is published", () => {
    const emblem = { events: draft, ownerId: "cage-county" };
    expect(mediaVisibleTo(emblem, { keyMatched: false, viewerId: "cage-county" })).toEqual({
      visible: true,
      public: false,
    });
    expect(mediaVisibleTo({ events: [], ownerId: "cage-county" }, { keyMatched: false, viewerId: "cage-county" }).visible).toBe(
      true,
    );
  });

  it("keeps another promoter's emblem out of reach on a draft, and lets it go once a show is live", () => {
    expect(
      mediaVisibleTo({ events: draft, ownerId: "cage-county" }, { keyMatched: false, viewerId: "another-promoter" })
        .visible,
    ).toBe(false);
    expect(mediaVisibleTo({ events: draft, ownerId: "cage-county" }, stranger).visible).toBe(false);
    expect(mediaVisibleTo({ events: live, ownerId: "cage-county" }, stranger)).toEqual({
      visible: true,
      public: true,
    });
  });

  it("takes one published show out of several as enough", () => {
    expect(mediaVisibleTo({ events: [...draft, ...live] }, stranger)).toEqual({
      visible: true,
      public: true,
    });
  });
});

describe("inviteTokenFromReferrer", () => {
  const token = "Vv8xQ2h1oQm7cJ0Nl4pRt6yWz3sB9dFgHjKlMnOpQrS";

  it("finds the token the questionnaire was opened with", () => {
    expect(inviteTokenFromReferrer(`https://eventiq.win/f/${token}`)).toBe(token);
    expect(inviteTokenFromReferrer(`https://eventiq.win/f/${token}?saved=1`)).toBe(token);
  });

  it("finds nothing anywhere else, so no other page can lend its address", () => {
    expect(inviteTokenFromReferrer("https://eventiq.win/e/cage-county-12")).toBeNull();
    expect(inviteTokenFromReferrer("https://eventiq.win/f/short")).toBeNull();
    expect(inviteTokenFromReferrer(null)).toBeNull();
    expect(inviteTokenFromReferrer(undefined)).toBeNull();
  });
});
