import { describe, expect, it } from "vitest";
import { RENDER_KEY_HEADER } from "@/lib/auth";
import { loadInviteByToken } from "@/lib/db/queries";
import {
  loadInvitedCard,
  loadOwnedCard,
  loadRenderableCard,
  loadVisibleCard,
  mediaVisibility,
} from "@/lib/visibility";
import { setEnv } from "./bindings";
import { plantPromoters, plantRenderKey, plantShow, plantSponsor } from "./fixtures";
import { signInAs, testDatabase } from "./harness";
import { setRequestHeaders } from "./request";

/**
 * The gate, against two promoters, a draft show and a published one.
 *
 * The pure suite holds the rules — `visibleTo`, `renderableTo`, `mediaVisibleTo`
 * — to account with a stubbed loader. This one runs the same functions over the
 * real queries and a real session cookie, which is the half that could not be
 * checked before: bug 27 was not a rule that read wrongly, it was a route
 * reaching a card the rule was never asked about.
 */

const platform = testDatabase();

/** Cage County's show is published; Budo's is a draft nobody has seen. */
async function twoShows() {
  const db = platform().db;
  await plantPromoters(db, [
    { id: "pr_cage", name: "Cage County" },
    { id: "pr_budo", name: "Budo" },
  ]);
  const published = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: true,
  });
  const draft = await plantShow(db, {
    promoterId: "pr_budo",
    slug: "budo-79",
    published: false,
    bouts: 2,
  });
  return { db, published, draft };
}

function withRenderKey(key: string) {
  setRequestHeaders({ [RENDER_KEY_HEADER]: key });
}

describe("loadVisibleCard", () => {
  it("hands a published programme to anybody", async () => {
    const { db } = await twoShows();
    expect(await loadVisibleCard(db, "cage-county-12")).not.toBeNull();
  });

  it("refuses a draft to a caller with no session", async () => {
    const { db } = await twoShows();
    expect(await loadVisibleCard(db, "budo-79")).toBeNull();
  });

  it("hands a draft to the promoter who owns it", async () => {
    const { db } = await twoShows();
    await signInAs("pr_budo");
    expect(await loadVisibleCard(db, "budo-79")).not.toBeNull();
  });

  it("refuses a draft to the other promoter, exactly as to a stranger", async () => {
    const { db } = await twoShows();
    await signInAs("pr_cage");
    expect(await loadVisibleCard(db, "budo-79")).toBeNull();
  });

  it("answers the same for a show that does not exist", async () => {
    const { db } = await twoShows();
    await signInAs("pr_cage");
    expect(await loadVisibleCard(db, "no-such-show")).toBeNull();
  });

  it("refuses a session naming a generation the account has moved past", async () => {
    const { db } = await twoShows();
    // What changing a password does: the cookie still verifies and is a version
    // behind, so it is not a session any more.
    await signInAs("pr_budo", 3);
    expect(await loadVisibleCard(db, "budo-79")).toBeNull();
  });
});

describe("loadOwnedCard", () => {
  it("hands a promoter their own draft", async () => {
    const { db } = await twoShows();
    expect(await loadOwnedCard(db, "budo-79", "pr_budo")).not.toBeNull();
  });

  it("refuses another promoter's show, published or not, exactly as a missing one", async () => {
    const { db } = await twoShows();
    expect(await loadOwnedCard(db, "budo-79", "pr_cage")).toBeNull();
    expect(await loadOwnedCard(db, "cage-county-12", "pr_budo")).toBeNull();
    expect(await loadOwnedCard(db, "no-such-show", "pr_cage")).toBeNull();
  });

  it("asks nothing of the session, so a signed-in promoter cannot borrow one", async () => {
    const { db } = await twoShows();
    await signInAs("pr_budo");
    expect(await loadOwnedCard(db, "budo-79", "pr_cage")).toBeNull();
  });
});

describe("loadInvitedCard", () => {
  it("brings back the show the link was issued for, with no session anywhere", async () => {
    const { db, draft } = await twoShows();
    const fighterId = draft.fighterIds[0];

    const row = await loadInviteByToken(db, draft.tokens[fighterId]);
    const card = await loadInvitedCard(db, row!.invite);

    // A draft card, reached with nothing but the token. That is the whole of the
    // authorisation and it has already been spent by the lookup above.
    expect(card?.eventId).toBe(draft.eventId);
    expect(card?.published).toBe(false);
    expect(card?.event.bouts).toHaveLength(2);
  });
});

describe("loadRenderableCard", () => {
  it("refuses a draft to a caller holding nothing", async () => {
    const { db } = await twoShows();
    expect(await loadRenderableCard(db, "budo-79")).toBeNull();
  });

  it("refuses a published show to a caller holding nothing, like every other card", async () => {
    const { db } = await twoShows();
    expect(await loadRenderableCard(db, "cage-county-12")).toBeNull();
  });

  it("hands a draft to the promoter who owns it, so they can see the video", async () => {
    const { db } = await twoShows();
    await signInAs("pr_budo");
    expect(await loadRenderableCard(db, "budo-79")).not.toBeNull();
  });

  it("hands a draft to a key scoped to that promoter", async () => {
    const { db } = await twoShows();
    await plantRenderKey(db, { id: "rk_budo", key: "budo-key", promoterId: "pr_budo" });
    withRenderKey("budo-key");
    expect(await loadRenderableCard(db, "budo-79")).not.toBeNull();
  });

  it("refuses another promoter's card to a scoped key, as a stranger is refused", async () => {
    const { db } = await twoShows();
    await plantRenderKey(db, { id: "rk_cage", key: "cage-key", promoterId: "pr_cage" });
    withRenderKey("cage-key");
    expect(await loadRenderableCard(db, "budo-79")).toBeNull();
  });

  it("hands any card to the runner's unscoped key, because it renders what is queued", async () => {
    const { db } = await twoShows();
    await plantRenderKey(db, { id: "rk_runner", key: "runner-key", promoterId: null });
    withRenderKey("runner-key");
    expect(await loadRenderableCard(db, "budo-79")).not.toBeNull();
    expect(await loadRenderableCard(db, "cage-county-12")).not.toBeNull();
  });

  it("refuses an expired key and a revoked one alike", async () => {
    const { db } = await twoShows();
    await plantRenderKey(db, {
      id: "rk_old",
      key: "old-key",
      promoterId: "pr_budo",
      expiresAt: Date.now() - 1000,
    });
    await plantRenderKey(db, {
      id: "rk_pulled",
      key: "pulled-key",
      promoterId: "pr_budo",
      revokedAt: Date.now() - 1000,
    });

    withRenderKey("old-key");
    expect(await loadRenderableCard(db, "budo-79")).toBeNull();
    withRenderKey("pulled-key");
    expect(await loadRenderableCard(db, "budo-79")).toBeNull();
  });

  it("still accepts the one shared secret, which is the migration path", async () => {
    const { db } = await twoShows();
    setEnv("RENDER_KEY", "the-old-shared-secret");
    withRenderKey("the-old-shared-secret");
    expect(await loadRenderableCard(db, "budo-79")).not.toBeNull();
  });

  it("refuses everybody when that secret is unset, rather than falling open", async () => {
    const { db } = await twoShows();
    withRenderKey("the-old-shared-secret");
    expect(await loadRenderableCard(db, "budo-79")).toBeNull();
  });
});

describe("mediaVisibility", () => {
  it("serves a rendered video of a published show to anybody, and cacheably", async () => {
    const { db } = await twoShows();
    expect(await mediaVisibility(db, "renders/cage-county-12/1-abc.mp4", new Headers())).toEqual({
      visible: true,
      public: true,
    });
  });

  it("refuses the video of a draft show", async () => {
    const { db } = await twoShows();
    expect(await mediaVisibility(db, "renders/budo-79/1-abc.mp4", new Headers())).toEqual({
      visible: false,
      public: false,
    });
  });

  it("serves it to the promoter who owns the draft, but never as public", async () => {
    const { db } = await twoShows();
    await signInAs("pr_budo");
    expect(await mediaVisibility(db, "renders/budo-79/1-abc.mp4", new Headers())).toEqual({
      visible: true,
      public: false,
    });
  });

  it("serves it to a render key for that promoter, on the same rule as the card", async () => {
    const { db } = await twoShows();
    await plantRenderKey(db, { id: "rk_budo", key: "budo-key", promoterId: "pr_budo" });
    const headers = new Headers({ [RENDER_KEY_HEADER]: "budo-key" });

    expect(await mediaVisibility(db, "renders/budo-79/1-abc.mp4", headers)).toEqual({
      visible: true,
      public: false,
    });
  });

  it("serves a photograph on a published card to anybody", async () => {
    const { db, published } = await twoShows();
    const path = `fighters/${published.fighterIds[0]}.jpg`;

    expect(await mediaVisibility(db, path, new Headers())).toEqual({
      visible: true,
      public: true,
    });
  });

  it("refuses a photograph on a card nobody has published", async () => {
    const { db, draft } = await twoShows();
    const path = `fighters/${draft.fighterIds[0]}.jpg`;

    expect(await mediaVisibility(db, path, new Headers())).toEqual({
      visible: false,
      public: false,
    });
  });

  it("lets a fighter see their own photograph back through their own link", async () => {
    const { db, draft } = await twoShows();
    const fighterId = draft.fighterIds[0];
    const headers = new Headers({ referer: `https://eventiq.win/f/${draft.tokens[fighterId]}` });

    expect(await mediaVisibility(db, `fighters/${fighterId}.jpg`, headers)).toEqual({
      visible: true,
      public: false,
    });
  });

  it("does not let one fighter's link reach the other corner's photograph", async () => {
    const { db, draft } = await twoShows();
    const [mine, theirs] = draft.fighterIds;
    const headers = new Headers({ referer: `https://eventiq.win/f/${draft.tokens[mine]}` });

    expect(await mediaVisibility(db, `fighters/${theirs}.jpg`, headers)).toEqual({
      visible: false,
      public: false,
    });
  });

  it("refuses an object no row points at, which is a fighter taken off every card", async () => {
    const { db } = await twoShows();
    expect(await mediaVisibility(db, "fighters/nobody-at-all.jpg", new Headers())).toEqual({
      visible: false,
      public: false,
    });
  });

  it("refuses a key shape nothing has written a rule for", async () => {
    const { db } = await twoShows();
    expect(await mediaVisibility(db, "backups/2026-09-07.sql", new Headers())).toEqual({
      visible: false,
      public: false,
    });
    expect(await mediaVisibility(db, "renders/../secrets.mp4", new Headers())).toEqual({
      visible: false,
      public: false,
    });
  });

  it("serves a sponsor's emblem as publicly as the promoter's cards are", async () => {
    const { db } = await twoShows();
    await plantSponsor(db, { id: "sp_cage", promoterId: "pr_cage" });

    expect(await mediaVisibility(db, "sponsors/pr_cage/sp_cage-ab12.png", new Headers())).toEqual({
      visible: true,
      public: true,
    });
  });

  it("shows a promoter their own emblem before they have published anything", async () => {
    const { db } = await twoShows();
    await plantSponsor(db, { id: "sp_budo", promoterId: "pr_budo" });

    expect(await mediaVisibility(db, "sponsors/pr_budo/sp_budo-ab12.png", new Headers())).toEqual({
      visible: false,
      public: false,
    });

    await signInAs("pr_budo");
    expect(await mediaVisibility(db, "sponsors/pr_budo/sp_budo-ab12.png", new Headers())).toEqual({
      visible: true,
      public: false,
    });
  });
});
