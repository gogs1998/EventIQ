import { describe, expect, it } from "vitest";
import { alphaVerdict, cutoutKey, lit, needsCutout, photoSource } from "./cutouts.mjs";

/**
 * The bookkeeping around cutout generation, without the model.
 *
 * Everything here is the part that decides whether to spend three and a half
 * seconds and what to call the result. The removal itself is exercised by running
 * the thing; these are the decisions that would otherwise only be tested by
 * noticing that a card came out wrong.
 */

describe("photoSource", () => {
  it("reads an uploaded photograph out of the bucket", () => {
    expect(photoSource("/media/fighters/nadia-abc123.jpg")).toEqual({
      kind: "r2",
      key: "fighters/nadia-abc123.jpg",
    });
  });

  it("reads a seeded photograph off disk", () => {
    expect(photoSource("/fighters/nadia-farrukh.webp")).toEqual({
      kind: "static",
      path: "public/fighters/nadia-farrukh.webp",
    });
  });

  it("refuses anything it did not write itself", () => {
    // This runs holding the account's credentials, so "fetch whatever the column
    // says" is not an option: an absolute URL, a preview blob or a path from
    // somewhere else all get refused rather than guessed at.
    for (const photo of [
      "https://example.test/photo.jpg",
      "blob:http://localhost:3000/8a7c",
      "/renders/cage-county-12/bout-15.mp4",
      "fighters/nadia-farrukh.webp",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(photoSource(photo)).toBeNull();
    }
  });

  it("refuses traversal in either shape", () => {
    expect(photoSource("/media/../../etc/passwd")).toBeNull();
    expect(photoSource("/fighters/../../../etc/passwd")).toBeNull();
    expect(photoSource("/fighters/sub/dir.webp")).toBeNull();
  });
});

describe("needsCutout", () => {
  it("wants one for a fighter who has sent a photograph and has no cutout", () => {
    expect(needsCutout({ photo: "/media/fighters/f1-ab.jpg", cutout: null })).toBe(true);
  });

  it("leaves an existing cutout alone", () => {
    // A fifteen-bout card is thirty fighters and this is the slow step, so a
    // re-run has to cost nothing for everyone who has not changed.
    expect(
      needsCutout({ photo: "/media/fighters/f1-ab.jpg", cutout: "/media/cutouts/f1-cd.webp" }),
    ).toBe(false);
  });

  it("remakes an existing one only when asked", () => {
    expect(
      needsCutout(
        { photo: "/media/fighters/f1-ab.jpg", cutout: "/media/cutouts/f1-cd.webp" },
        { refresh: true },
      ),
    ).toBe(true);
  });

  it("wants nothing for a fighter who has sent nothing", () => {
    expect(needsCutout({ photo: null, cutout: null })).toBe(false);
    expect(needsCutout({ photo: null, cutout: null }, { refresh: true })).toBe(false);
  });

  it("wants nothing where the photograph is not somewhere we can read", () => {
    expect(needsCutout({ photo: "https://example.test/p.jpg", cutout: null })).toBe(false);
  });
});

describe("cutoutKey", () => {
  it("puts cutouts in their own prefix", () => {
    expect(cutoutKey("nadia-farrukh", "/media/fighters/nadia-ab12.jpg")).toMatch(
      /^cutouts\/nadia-farrukh-[0-9a-f]{8}\.webp$/,
    );
  });

  it("is stable for one photograph, so a refresh overwrites rather than accumulates", () => {
    const photo = "/media/fighters/nadia-ab12.jpg";
    expect(cutoutKey("nadia-farrukh", photo)).toBe(cutoutKey("nadia-farrukh", photo));
  });

  it("changes with the photograph, because media is served with a year's cache", () => {
    expect(cutoutKey("nadia-farrukh", "/media/fighters/nadia-ab12.jpg")).not.toBe(
      cutoutKey("nadia-farrukh", "/media/fighters/nadia-cd34.jpg"),
    );
  });
});

describe("alphaVerdict", () => {
  it("accepts what real cutouts measure", () => {
    // The eleven curated cutouts in public/fighters sit between 0.56 and 0.65.
    for (const coverage of [0.56, 0.6, 0.65]) {
      expect(alphaVerdict(coverage)).toBe("ok");
    }
  });

  it("rejects a cutout with the subject erased along with the background", () => {
    expect(alphaVerdict(0)).toBe("empty");
    expect(alphaVerdict(0.01)).toBe("empty");
  });

  it("rejects one where nothing was removed", () => {
    // A fully opaque result is the photograph with an alpha channel, and it would
    // then be shown with the cutout treatment: full parallax and four straight
    // edges. Worse than the photograph fallback it displaced.
    expect(alphaVerdict(1)).toBe("untouched");
    expect(alphaVerdict(0.999)).toBe("untouched");
  });

  it("rejects an unreadable measurement rather than treating it as zero", () => {
    expect(alphaVerdict(NaN)).toBe("unreadable");
    expect(alphaVerdict(undefined)).toBe("unreadable");
  });
});

describe("lit", () => {
  it("escapes quotes, because a fighter id reaches SQL as a literal", () => {
    expect(lit("o'brien")).toBe("'o''brien'");
  });
});
