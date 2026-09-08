import { describe, expect, it } from "vitest";
import {
  MIN_AGE_HOURS,
  orphansOf,
  parseListing,
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
