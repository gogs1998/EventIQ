import { describe, expect, it } from "vitest";
import {
  MAX_RENDER_ATTEMPTS,
  RENDER_INPUT_FIELDS,
  RENDER_LEASE_MS,
  type RenderInputs,
  type RenderJobState,
  claimable,
  renderFingerprint,
  renderKeyFor,
  renderState,
  renderUrl,
  sponsorFingerprint,
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
});

describe("renderKeyFor", () => {
  /**
   * /media answers with a year of immutable caching, so the key has to change
   * when the video does or a phone that has played the bout once keeps the old
   * one until the cache turns over.
   */
  it("puts the fingerprint in the key", () => {
    expect(renderKeyFor("cage-county-12", 15, "abcdef0123456789")).toBe(
      "renders/cage-county-12/bout-15-abcdef01.mp4",
    );
  });

  it("gives a re-rendered bout a different key", () => {
    expect(renderKeyFor("cage-county-12", 15, "1111111111111111")).not.toBe(
      renderKeyFor("cage-county-12", 15, "2222222222222222"),
    );
  });

  it("is served from the bucket rather than as a committed file", () => {
    expect(renderUrl(renderKeyFor("cage-county-12", 15, "abcdef01"))).toBe(
      "/media/renders/cage-county-12/bout-15-abcdef01.mp4",
    );
    // The five renders that predate the bucket are still static assets.
    expect(renderUrl("/renders/bout-15.mp4")).toBe("/renders/bout-15.mp4");
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

describe("claimable", () => {
  it("takes a bout nothing has ever rendered", () => {
    expect(claimable(null, NOW)).toBe(true);
  });

  it("takes a queued bout and leaves a finished one alone", () => {
    expect(claimable(job({ status: "queued" }), NOW)).toBe(true);
    expect(claimable(job({ status: "done" }), NOW)).toBe(false);
  });

  /** Two runners must never render the same bout. */
  it("will not take a bout another runner still holds", () => {
    const held = job({ status: "running", leaseUntil: NOW + RENDER_LEASE_MS });
    expect(claimable(held, NOW)).toBe(false);
    expect(claimable(held, NOW, { force: true })).toBe(false);
  });

  /** A runner killed by a CI timeout leaves the row saying "running" forever. */
  it("takes a bout whose runner died", () => {
    expect(claimable(job({ status: "running", leaseUntil: NOW - 1 }), NOW)).toBe(true);
  });

  it("retries a failure up to the attempt ceiling and then stops", () => {
    expect(claimable(job({ status: "failed", attempts: 1 }), NOW)).toBe(true);
    expect(claimable(job({ status: "failed", attempts: MAX_RENDER_ATTEMPTS }), NOW)).toBe(false);
  });

  /** An operator naming a bout means it, even one that is already current. */
  it("takes a current bout when it is asked for by name", () => {
    expect(claimable(job(), NOW, { force: true })).toBe(true);
    expect(claimable(job({ status: "failed", attempts: 9 }), NOW, { force: true })).toBe(true);
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
