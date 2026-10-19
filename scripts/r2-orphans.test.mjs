import { describe, expect, it } from "vitest";
import {
  MIN_AGE_HOURS,
  RENDER_GRACE_DAYS,
  orphansOf,
  parseListing,
  renderSeries,
  supersededAt,
  referencedKeys,
  underManagedPrefix,
} from "./r2-orphans.mjs";

/**
 * What the sweep will and will not take.
 *
 * The object it must never take is a render: it is the one thing in this bucket
 * that somebody may be watching at the moment a tidy-up runs, and a bout that
 * loses its video loses it on a published card. Everything else here is about
 * the two ways an object is legitimately in the bucket with nothing pointing at
 * it yet — the instant between an upload and the row, and a stylised portrait
 * waiting to be approved.
 */
const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-08T12:00:00Z");
const old = (days) => NOW - days * 24 * HOUR;

describe("referencedKeys", () => {
  it("reads a fighter's three columns as keys", () => {
    expect(
      referencedKeys([
        { photo: "/media/fighters/nadia-ab12cd34.jpg" },
        { cutout: "/media/cutouts/nadia-ab12cd34.webp" },
        { stylised: "/media/portraits/nadia-ef56.png" },
      ]),
    ).toEqual(
      new Set([
        "fighters/nadia-ab12cd34.jpg",
        "cutouts/nadia-ab12cd34.webp",
        "portraits/nadia-ef56.png",
      ]),
    );
  });

  it("reads an emblem and a current render as the bare keys they are", () => {
    expect(
      referencedKeys([
        { mark_key: "sponsors/cage-county/boltbarrel-99.png" },
        { current_r2_key: "renders/cage-county-12/15-abcdef.mp4" },
      ]),
    ).toEqual(
      new Set(["sponsors/cage-county/boltbarrel-99.png", "renders/cage-county-12/15-abcdef.mp4"]),
    );
  });

  /**
   * The seeded card's pictures are committed under public/, and the earliest
   * renders were too. Neither is an object in this bucket, so neither can be an
   * orphan in it — and reading them as keys would be reading a path that has
   * nothing to do with what is being listed.
   */
  it("ignores anything that is not an object in this bucket", () => {
    expect(
      referencedKeys([
        { photo: "/fighters/nadia.webp" },
        { photo: "https://example.com/nadia.jpg" },
        { current_r2_key: "/renders/cage-county-12/15.mp4" },
        { photo: null, cutout: null, stylised: null, mark_key: null, current_r2_key: null },
      ]),
    ).toEqual(new Set());
  });
});

describe("underManagedPrefix", () => {
  it("covers the five prefixes this app writes", () => {
    for (const key of [
      "fighters/a.jpg",
      "cutouts/a.webp",
      "portraits/a.png",
      "sponsors/p/a.png",
      "renders/s/1.mp4",
    ]) {
      expect(underManagedPrefix(key), key).toBe(true);
    }
  });

  /** A backup, or something a person put there. Not ours to reason about. */
  it("leaves everything else alone", () => {
    for (const key of ["backups/2026-09-07.sql", "notes.txt", "fighter/a.jpg"]) {
      expect(underManagedPrefix(key), key).toBe(false);
    }
  });
});

describe("orphansOf", () => {
  const objects = [
    { key: "fighters/nadia-ab12.jpg", uploaded: old(30) },
    { key: "fighters/nadia-ef56.jpg", uploaded: old(30) },
    { key: "renders/cage-county-12/15-abcdef.mp4", uploaded: old(30) },
    { key: "portraits/nadia-9999.png", uploaded: NOW - 2 * HOUR },
    { key: "backups/2026-08-01.sql", uploaded: old(30) },
  ];
  const referenced = new Set([
    "fighters/nadia-ef56.jpg",
    "renders/cage-county-12/15-abcdef.mp4",
  ]);

  it("takes the superseded photograph and nothing else", () => {
    expect(orphansOf(objects, referenced, NOW).map((object) => object.key)).toEqual([
      "fighters/nadia-ab12.jpg",
    ]);
  });

  /** The rule with no argument against it: a current render is never a candidate. */
  it("never takes the video a programme is playing", () => {
    const keys = orphansOf(objects, referenced, NOW).map((object) => object.key);
    expect(keys).not.toContain("renders/cage-county-12/15-abcdef.mp4");
  });

  /**
   * A portrait is written before anybody approves it, deliberately, and an
   * upload is written a moment before the row that points at it. The age floor
   * is what turns both of those into a wait rather than a race.
   */
  it("leaves an object nothing points at yet alone until it is old", () => {
    expect(orphansOf(objects, referenced, NOW).map((o) => o.key)).not.toContain(
      "portraits/nadia-9999.png",
    );
    expect(orphansOf(objects, referenced, NOW, 0).map((o) => o.key)).toContain(
      "portraits/nadia-9999.png",
    );
    expect(MIN_AGE_HOURS).toBeGreaterThanOrEqual(1);
  });

  /**
   * The renderer used to delete the previous video the moment a new one was
   * published, and every open tab and shared link to it became a 404. Nothing
   * deletes on publish now; this does, a month after the replacement landed.
   */
  describe("a superseded render", () => {
    const series = (hash, uploaded) => ({
      key: `renders/cage-county-12/bout-15-faceoff-${hash}.mp4`,
      uploaded,
    });
    const current = series("bbbbbbbb", old(2));
    const current0 = new Set([current.key]);

    it("is kept for the grace period, counted from the render that replaced it", () => {
      // Made two months ago, replaced two days ago: out of date for two days.
      const superseded = series("aaaaaaaa", old(60));
      expect(orphansOf([superseded, current], current0, NOW)).toEqual([]);
    });

    it("is taken once its replacement is older than the grace period", () => {
      const superseded = series("aaaaaaaa", old(60));
      const replaced = series("bbbbbbbb", old(RENDER_GRACE_DAYS + 1));
      const keys = orphansOf([superseded, replaced], new Set([replaced.key]), NOW).map((o) => o.key);
      expect(keys).toEqual([superseded.key]);
    });

    it("with nothing after it, counts from its own upload", () => {
      const alone = series("aaaaaaaa", old(10));
      expect(orphansOf([alone], new Set(), NOW)).toEqual([]);
      const older = series("aaaaaaaa", old(RENDER_GRACE_DAYS + 5));
      expect(orphansOf([older], new Set(), NOW)).toEqual([older]);
    });
  });
});

describe("renderSeries", () => {
  it("files both key shapes under the bout and the composition they are a video of", () => {
    expect(renderSeries("renders/cc12/bout-15-faceoff-abcdef01.mp4")).toBe("cc12/15/faceoff");
    expect(renderSeries("renders/cc12/bout-15-tape-abcdef01.mp4")).toBe("cc12/15/tape");
    // Before templates, every render was the tape.
    expect(renderSeries("renders/cc12/bout-15-abcdef01.mp4")).toBe("cc12/15/tape");
    expect(renderSeries("fighters/nadia.jpg")).toBeNull();
  });

  it("does not file the promo with the tape of the same bout", () => {
    const tape = { key: "renders/cc12/bout-15-tape-aaaaaaaa.mp4", uploaded: old(40) };
    const promo = { key: "renders/cc12/bout-15-faceoff-bbbbbbbb.mp4", uploaded: old(35) };
    expect(supersededAt(tape, [tape, promo])).toBe(tape.uploaded);
  });
});

describe("parseListing", () => {
  const page = `<?xml version="1.0" encoding="UTF-8"?>
    <ListBucketResult>
      <IsTruncated>true</IsTruncated>
      <NextContinuationToken>abc123</NextContinuationToken>
      <Contents>
        <Key>fighters/nadia-ab12.jpg</Key>
        <LastModified>2026-08-09T10:11:12.000Z</LastModified>
      </Contents>
      <Contents>
        <Key>renders/cage-county-12/15-abcdef.mp4</Key>
        <LastModified>2026-08-10T10:11:12.000Z</LastModified>
      </Contents>
    </ListBucketResult>`;

  it("reads the keys and when they were written", () => {
    const { objects } = parseListing(page);
    expect(objects.map((object) => object.key)).toEqual([
      "fighters/nadia-ab12.jpg",
      "renders/cage-county-12/15-abcdef.mp4",
    ]);
    expect(objects[0].uploaded).toBe(Date.parse("2026-08-09T10:11:12.000Z"));
  });

  /** A bucket past a thousand objects comes back in pages, and half a listing
   *  is worse than none: everything it did not see would read as an orphan. */
  it("carries the continuation on, and stops when it ends", () => {
    expect(parseListing(page).next).toBe("abc123");
    expect(parseListing(page.replace("true", "false")).next).toBeNull();
    expect(parseListing("<ListBucketResult></ListBucketResult>")).toEqual({
      objects: [],
      next: null,
    });
  });
});
