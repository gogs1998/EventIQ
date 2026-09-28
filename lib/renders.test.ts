import { describe, expect, it } from "vitest";
import {
  MAX_RENDER_ATTEMPTS,
  PUBLISHED_TEMPLATES,
  RENDER_INPUT_FIELDS,
  RENDER_LEASE_MS,
  type RenderInputs,
  type RenderJobState,
  claimable,
  isPublishedTemplate,
  mp4For,
  renderFingerprint,
  renderKeyFor,
  renderState,
  renderUrl,
  sponsorFingerprint,
  sponsorMark,
} from "@/lib/renders";

/**
 * The renderer imports this same module — Node strips the types — so these
 * cover both halves of the pipeline at once. What they are really protecting is
 * that the app's idea of "this video is out of date" and the renderer's cannot
 * come apart, because the two are the same function.
 */

const INPUTS: RenderInputs = Object.fromEntries(
  RENDER_INPUT_FIELDS.map((field) => [field, `${field}-value`]),
);

describe("renderFingerprint", () => {
  it("is the same digest for the same bout, whatever order it was built in", async () => {
    const reversed = Object.fromEntries(Object.entries(INPUTS).reverse());
    expect(await renderFingerprint(reversed)).toBe(await renderFingerprint(INPUTS));
  });

  it("moves when anything on screen moves", async () => {
    const base = await renderFingerprint(INPUTS);
    for (const field of RENDER_INPUT_FIELDS) {
      const changed = await renderFingerprint({ ...INPUTS, [field]: "different" });
      expect(changed, `${field} is not in the fingerprint`).not.toBe(base);
    }
  });

  /**
   * The dashboard builds these from Drizzle and the renderer from a SQL row.
   * A field one of them forgets would leave every video reading as current
   * forever, which is exactly the failure that is invisible until a promoter
   * posts last week's record.
   */
  it("refuses an input object that does not match the field list", async () => {
    const missing = { ...INPUTS };
    delete missing.number;
    await expect(renderFingerprint(missing)).rejects.toThrow(/missing "number"/);
    // Cast because the type already refuses this; the check is for the renderer,
    // which is plain Node and has only the runtime guard.
    const spare = { ...INPUTS, gym: "x" } as RenderInputs;
    await expect(renderFingerprint(spare)).rejects.toThrow(/unknown fields: gym/);
  });

  it("treats an absent field and a null one as the same thing", async () => {
    const withNull = await renderFingerprint({ ...INPUTS, titleLabel: null });
    const withUndefined = await renderFingerprint({ ...INPUTS, titleLabel: undefined });
    expect(withNull).toBe(withUndefined);
  });

  /**
   * The template is the largest thing on screen: the tape and the promo are
   * sixteen and twelve seconds of the same two people, drawn entirely
   * differently. Two compositions sharing a digest would mean one bout, one key
   * and one of them quietly published over the other.
   */
  it("gives the two compositions of one bout different digests", async () => {
    const tape = await renderFingerprint({ ...INPUTS, template: "tape" });
    const faceoff = await renderFingerprint({ ...INPUTS, template: "faceoff" });
    expect(tape).not.toBe(faceoff);
  });

  it("names the show, the promoter and the sponsors, not only the fighters", () => {
    for (const field of ["eventName", "eventDate", "eventVenue", "eventBackdrop"]) {
      expect(RENDER_INPUT_FIELDS).toContain(field);
    }
    expect(RENDER_INPUT_FIELDS).toContain("promoterName");
    expect(RENDER_INPUT_FIELDS).toContain("promoterMark");
    expect(RENDER_INPUT_FIELDS).toContain("sponsors");
  });

  it("is short enough to read in a table and long enough not to collide", async () => {
    expect(await renderFingerprint(INPUTS)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("sponsorFingerprint", () => {
  it("carries everything the lockup draws", () => {
    const sponsor = { id: "s1", name: "Mouthguards.pro", qualifier: "Custom fit", mark: "/m.svg" };
    expect(sponsorFingerprint(sponsor)).toBe("s1|Mouthguards.pro|Custom fit|/m.svg");
    expect(sponsorFingerprint({ id: "s1", name: "Mouthguards.pro" })).toBe("s1|Mouthguards.pro||");
  });

  /**
   * The emblem the composition draws, not the columns it was drawn from. An
   * uploaded mark replacing a curated one changes every video that sponsor
   * appears in, and hashing the raw `mark` column would leave those videos
   * reading as current with the old artwork still on them.
   */
  it("moves when a promoter's own emblem replaces the curated one", () => {
    const curated = { id: "s1", name: "Anvil", mark: "/sponsors/anvil.webp" };
    expect(sponsorFingerprint({ ...curated, markKey: "sponsors/pr_1/s1-abcd.png" })).not.toBe(
      sponsorFingerprint(curated),
    );
  });
});

describe("sponsorMark", () => {
  it("prefers the promoter's own upload and falls back to the curated artwork", () => {
    expect(sponsorMark({ mark: "/sponsors/anvil.webp", markKey: "sponsors/pr_1/s1-abcd.png" })).toBe(
      "/media/sponsors/pr_1/s1-abcd.png",
    );
    expect(sponsorMark({ mark: "/sponsors/anvil.webp" })).toBe("/sponsors/anvil.webp");
  });

  it("is absent rather than empty where a sponsor has no emblem at all", () => {
    expect(sponsorMark({})).toBeUndefined();
    expect(sponsorMark({ mark: null, markKey: null })).toBeUndefined();
  });
});

describe("renderKeyFor", () => {
  /**
   * /media answers with a year of immutable caching, so the key has to change
   * when the video does or a phone that has played the bout once keeps the old
   * one until the cache turns over.
   */
  it("puts the fingerprint in the key", () => {
    expect(renderKeyFor("cage-county-12", 15, "tape", "abcdef0123456789")).toBe(
      "renders/cage-county-12/bout-15-tape-abcdef01.mp4",
    );
  });

  it("gives a re-rendered bout a different key", () => {
    expect(renderKeyFor("cage-county-12", 15, "tape", "1111111111111111")).not.toBe(
      renderKeyFor("cage-county-12", 15, "tape", "2222222222222222"),
    );
  });

  /**
   * The two videos of one bout are two objects. They were one key before there
   * was a template, so a promo publishing over the tale of the tape would have
   * been silent: the dashboard would have called it current and the programme
   * would have played twelve seconds of promo where the tape used to be.
   */
  it("keeps a bout's two videos apart even at the same fingerprint", () => {
    expect(renderKeyFor("cage-county-12", 15, "faceoff", "abcdef0123456789")).not.toBe(
      renderKeyFor("cage-county-12", 15, "tape", "abcdef0123456789"),
    );
  });

  it("is served from the bucket rather than as a committed file", () => {
    expect(renderUrl(renderKeyFor("cage-county-12", 15, "tape", "abcdef01"))).toBe(
      "/media/renders/cage-county-12/bout-15-tape-abcdef01.mp4",
    );
    // The five renders that predate the bucket are still static assets.
    expect(renderUrl("/renders/bout-15.mp4")).toBe("/renders/bout-15.mp4");
    // And a key minted before the template was in it is still an object in the
    // bucket, still served, and is not renamed by anything here.
    expect(renderUrl("renders/cage-county-12/bout-15-abcdef01.mp4")).toBe(
      "/media/renders/cage-county-12/bout-15-abcdef01.mp4",
    );
  });
});

const NOW = 1_700_000_000_000;

function job(over: Partial<RenderJobState> = {}): RenderJobState {
  return {
    status: "done",
    attempts: 0,
    leaseUntil: null,
    currentR2Key: "renders/cage-county-12/bout-15-abcdef01.mp4",
    currentHash: "abcdef0123456789",
    error: null,
    ...over,
  };
}

/** What the bout hashes to now. job()'s published render is of this one. */
const LIVE = "abcdef0123456789";
/** The same bout after a fighter sent a photograph. */
const MOVED = "0000000000000000";

describe("claimable", () => {
  it("takes a bout nothing has ever rendered", () => {
    expect(claimable(null, LIVE, NOW)).toBe(true);
  });

  it("takes a queued bout and leaves a finished, current one alone", () => {
    expect(claimable(job({ status: "queued" }), LIVE, NOW)).toBe(true);
    expect(claimable(job({ status: "done" }), LIVE, NOW)).toBe(false);
  });

  /**
   * The failure the first hourly run showed: ten bouts with no row rendered,
   * and the five finished before the pipeline existed — `done`, with a key and
   * no hash — reported as somebody else's and never made again. A finished row
   * that does not match the bout as it stands is stale, and a --stale run is
   * the thing that exists to take it.
   */
  it("takes a finished bout whose video is no longer of this bout", () => {
    expect(claimable(job({ status: "done" }), MOVED, NOW)).toBe(true);
    expect(claimable(job({ status: "done", currentHash: null }), LIVE, NOW)).toBe(true);
  });

  /** Two runners must never render the same bout. */
  it("will not take a bout another runner still holds", () => {
    const held = job({ status: "running", leaseUntil: NOW + RENDER_LEASE_MS });
    expect(claimable(held, LIVE, NOW)).toBe(false);
    expect(claimable(held, MOVED, NOW)).toBe(false);
    expect(claimable(held, LIVE, NOW, { force: true })).toBe(false);
    // A stale finished row is still somebody's while the lease runs.
    const heldDone = job({ status: "done", currentHash: null, leaseUntil: NOW + RENDER_LEASE_MS });
    expect(claimable(heldDone, LIVE, NOW)).toBe(false);
  });

  /** A runner killed by a CI timeout leaves the row saying "running" forever. */
  it("takes a bout whose runner died", () => {
    expect(claimable(job({ status: "running", leaseUntil: NOW - 1 }), LIVE, NOW)).toBe(true);
  });

  it("retries a failure up to the attempt ceiling and then stops", () => {
    expect(claimable(job({ status: "failed", attempts: 1 }), LIVE, NOW)).toBe(true);
    expect(claimable(job({ status: "failed", attempts: MAX_RENDER_ATTEMPTS }), LIVE, NOW)).toBe(
      false,
    );
  });

  /** An operator naming a bout means it, even one that is already current. */
  it("takes a current bout when it is asked for by name", () => {
    expect(claimable(job(), LIVE, NOW, { force: true })).toBe(true);
    expect(claimable(job({ status: "failed", attempts: 9 }), LIVE, NOW, { force: true })).toBe(true);
  });

  /**
   * The two halves of the pipeline have to agree: anything the dashboard calls
   * stale is something an unattended run can pick up, or it sits there saying so
   * forever, and anything it calls current is left alone.
   */
  it("takes exactly what the dashboard reports as stale", () => {
    for (const state of [job({ status: "done" }), job({ status: "done", currentHash: null })]) {
      for (const hash of [LIVE, MOVED]) {
        expect(claimable(state, hash, NOW)).toBe(renderState(state, hash, NOW) === "stale");
      }
    }
  });

  /**
   * A bout is two jobs, and they are decided one at a time.
   *
   * This is the property the whole template column exists for. A promo that has
   * never been made must not make a current tape claimable; a promo another
   * runner is holding must not hold the tape with it; and a promo that has
   * failed twice must not stop the tape being remade. Every one of those would
   * be invisible — a video that is quietly never made again.
   */
  it("decides a bout's two videos separately", () => {
    // The tape is current and the promo has never been made.
    expect(claimable(job({ status: "done" }), LIVE, NOW)).toBe(false);
    expect(claimable(null, LIVE, NOW)).toBe(true);

    // A runner holds the promo. The tape is nobody's and is out of date.
    const heldPromo = job({ status: "running", leaseUntil: NOW + RENDER_LEASE_MS });
    expect(claimable(heldPromo, LIVE, NOW)).toBe(false);
    expect(claimable(job({ status: "done" }), MOVED, NOW)).toBe(true);

    // The promo has failed its way out of the queue. The tape is untouched.
    const spentPromo = job({ status: "failed", attempts: MAX_RENDER_ATTEMPTS });
    expect(claimable(spentPromo, LIVE, NOW)).toBe(false);
    expect(claimable(job({ status: "queued" }), LIVE, NOW)).toBe(true);
  });
});

describe("PUBLISHED_TEMPLATES", () => {
  /**
   * The programme carries these two and nothing else. A walkout is one video per
   * corner and the job row has no corner, so publishing one would replace a
   * bout's promo and read as current afterwards — which is why the renderer
   * refuses it and why that refusal is decided by this list rather than by a
   * name typed into a condition somewhere.
   */
  it("is the tape and the promo, and says so about an id nobody publishes", () => {
    expect([...PUBLISHED_TEMPLATES]).toEqual(["tape", "faceoff"]);
    expect(isPublishedTemplate("tape")).toBe(true);
    expect(isPublishedTemplate("faceoff")).toBe(true);
    expect(isPublishedTemplate("walkout")).toBe(false);
    expect(isPublishedTemplate("social")).toBe(false);
  });
});

describe("mp4For", () => {
  const renders = { 15: { tape: "/media/a.mp4", faceoff: "/media/b.mp4" }, 14: { tape: "/c.mp4" } };

  it("answers per bout and per template, and defaults to the tape", () => {
    expect(mp4For(renders, 15)).toBe("/media/a.mp4");
    expect(mp4For(renders, 15, "faceoff")).toBe("/media/b.mp4");
    // A bout whose promo has not been made yet has no promo, rather than the
    // tale of the tape offered under the promo's name.
    expect(mp4For(renders, 14, "faceoff")).toBeUndefined();
    expect(mp4For(renders, 1)).toBeUndefined();
  });
});

describe("renderState", () => {
  it("is current only when the published video is of the bout as it stands", () => {
    expect(renderState(job(), "abcdef0123456789", NOW)).toBe("current");
    expect(renderState(job(), "0000000000000000", NOW)).toBe("stale");
  });

  it("has nothing to say about a bout with no job", () => {
    expect(renderState(null, "abcdef0123456789", NOW)).toBe("missing");
  });

  it("reports a job in flight whatever is published", () => {
    const running = job({ status: "running", leaseUntil: NOW + 1000 });
    expect(renderState(running, "abcdef0123456789", NOW)).toBe("running");
    expect(renderState(job({ status: "queued" }), "abcdef0123456789", NOW)).toBe("queued");
  });

  /**
   * A promoter watching "rendering now" on a runner that died an hour ago would
   * sit and wait on it. Once the lease has lapsed it is queued again in
   * everything but name, and it says so.
   */
  it("stops calling a dead runner's job running", () => {
    const dead = job({ status: "running", leaseUntil: NOW - 1, attempts: 1 });
    expect(renderState(dead, "abcdef0123456789", NOW)).toBe("queued");
    const spent = job({ status: "running", leaseUntil: NOW - 1, attempts: MAX_RENDER_ATTEMPTS });
    expect(renderState(spent, "abcdef0123456789", NOW)).toBe("failed");
  });

  /** The point of the split: a failure never takes a working video off the card. */
  it("reports a failure without pretending the last video is gone", () => {
    const failed = job({ status: "failed", attempts: 2, error: "ffmpeg exited 1" });
    expect(renderState(failed, "abcdef0123456789", NOW)).toBe("failed");
    expect(failed.currentR2Key).toBeTruthy();
  });

  it("is missing rather than current when a job finished without a key", () => {
    expect(renderState(job({ currentR2Key: null, currentHash: null }), "abc", NOW)).toBe("missing");
  });
});
