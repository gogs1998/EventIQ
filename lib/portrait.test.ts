import { describe, expect, it } from "vitest";
import {
  cutoutSurvives,
  mediaKeyOf,
  parallaxTravel,
  plateInitials,
  portraitOf,
  stylisedBelongsTo,
  stylisedKey,
} from "@/lib/portrait";
import type { Fighter } from "@/lib/types";

const base: Fighter = { id: "f1", name: "Nadia Farrukh", gym: "Kettle Row" };

describe("portraitOf", () => {
  it("prefers the cutout", () => {
    expect(
      portraitOf({ cutout: "/media/cutouts/f1-ab12.webp", photo: "/media/fighters/f1-cd34.jpg" }),
    ).toEqual({ kind: "cutout", src: "/media/cutouts/f1-ab12.webp" });
  });

  it("falls back to the photograph when there is no cutout yet", () => {
    expect(portraitOf({ photo: "/media/fighters/f1-cd34.jpg" })).toEqual({
      kind: "photo",
      src: "/media/fighters/f1-cd34.jpg",
    });
  });

  it("uses the plate only for a fighter who sent nothing", () => {
    expect(portraitOf({})).toEqual({ kind: "plate" });
    expect(portraitOf(base)).toEqual({ kind: "plate" });
  });

  it("never shows the plate to a fighter who sent a photograph", () => {
    // The bug this file exists to stop: a fighter uploads their picture, it is
    // on their card, and the video still says "photo to follow".
    for (const fighter of [
      { photo: "/media/fighters/f1-cd34.jpg" },
      { photo: "/fighters/nadia-farrukh.webp" },
      { photo: "/media/fighters/f1-cd34.jpg", cutout: undefined },
    ]) {
      expect(portraitOf(fighter).kind).not.toBe("plate");
    }
  });

  it("treats an empty string as absent, so a blanked column is not a broken image", () => {
    expect(portraitOf({ cutout: "", photo: "/media/fighters/f1-cd34.jpg" }).kind).toBe("photo");
    expect(portraitOf({ cutout: "", photo: "" }).kind).toBe("plate");
  });
});

/**
 * The precedence, which is a consent decision rather than a picture-quality one.
 * A stylised portrait exists only because a fighter asked for one and then
 * approved what came back, and a cutout exists because we made one without
 * asking — so the approved thing wins. What must never happen is generated art
 * appearing for a fighter who did neither.
 */
describe("the stylised portrait's place in the order", () => {
  const photo = "/media/fighters/f1-cd34.jpg";
  const cutout = "/media/cutouts/f1-ab12.webp";
  const art = "/media/portraits/f1-ef56.png";

  it("goes above the cutout and the photograph once it is approved", () => {
    expect(portraitOf({ stylised: art, cutout, photo })).toEqual({ kind: "stylised", src: art });
  });

  it("changes nothing at all for a fighter who did not ask for one", () => {
    expect(portraitOf({ cutout, photo }).kind).toBe("cutout");
    expect(portraitOf({ photo }).kind).toBe("photo");
    expect(portraitOf({}).kind).toBe("plate");
  });

  it("treats a blanked column as absent rather than as a broken image", () => {
    expect(portraitOf({ stylised: "", cutout, photo }).kind).toBe("cutout");
  });

  /** It is a rectangle with a background of its own, so it moves like one. */
  it("travels like a photograph rather than like a cutout", () => {
    expect(parallaxTravel({ kind: "stylised", src: art })).toBe(
      parallaxTravel({ kind: "photo", src: photo }),
    );
    expect(parallaxTravel({ kind: "stylised", src: art })).toBeLessThan(1);
  });
});

describe("mediaKeyOf", () => {
  it("gives the bucket key for something we stored", () => {
    expect(mediaKeyOf("/media/fighters/f1-cd34.jpg")).toBe("fighters/f1-cd34.jpg");
    expect(mediaKeyOf("/media/portraits/f1-ef56.png")).toBe("portraits/f1-ef56.png");
  });

  /** A committed asset, a preview and a foreign URL are none of them ours to delete. */
  it("refuses anything that is not an object in the bucket", () => {
    for (const path of [
      "/fighters/nadia-farrukh.webp",
      "https://example.com/x.jpg",
      "blob:http://localhost/abc",
      "/media/../secrets",
      "",
      null,
      undefined,
    ]) {
      expect(mediaKeyOf(path)).toBeNull();
    }
  });
});

/**
 * The approve action takes the path back from the browser, so it is checked
 * rather than believed. Without this a fighter holding one invite could approve
 * any object in the prefix onto their own card, including one drawn from
 * somebody else's photograph.
 */
describe("stylisedBelongsTo", () => {
  it("accepts the key this code writes for this fighter", () => {
    const key = stylisedKey("chloe-baines", "a1b2c3d4", "png");
    expect(stylisedBelongsTo(`/media/${key}`, "chloe-baines")).toBe(true);
  });

  it("refuses another fighter's portrait, hyphenated ids and all", () => {
    const key = stylisedKey("chloe-baines", "a1b2c3d4", "png");
    expect(stylisedBelongsTo(`/media/${key}`, "chloe")).toBe(false);
    expect(stylisedBelongsTo(`/media/${key}`, "chloe-bainesworth")).toBe(false);
    expect(stylisedBelongsTo("/media/portraits/otis-grant-a1b2c3d4.png", "chloe-baines")).toBe(
      false,
    );
  });

  it("refuses a path in another prefix, or none", () => {
    expect(stylisedBelongsTo("/media/fighters/f1-a1b2c3d4.jpg", "f1")).toBe(false);
    expect(stylisedBelongsTo("/fighters/f1-a1b2c3d4.jpg", "f1")).toBe(false);
    expect(stylisedBelongsTo("/media/portraits/f1-a1b2c3d4.png/../x.png", "f1")).toBe(false);
  });
});

describe("parallaxTravel", () => {
  it("moves a cutout the full distance", () => {
    expect(parallaxTravel({ kind: "cutout", src: "/x.webp" })).toBe(1);
  });

  it("moves a rectangular photograph less, so it does not read as a slide", () => {
    const photo = parallaxTravel({ kind: "photo", src: "/x.jpg" });
    expect(photo).toBeGreaterThan(0);
    expect(photo).toBeLessThan(0.5);
  });

  it("keeps the photograph moving, because a still layer in a moving frame looks broken", () => {
    expect(parallaxTravel({ kind: "photo", src: "/x.jpg" })).not.toBe(0);
  });
});

describe("cutoutSurvives", () => {
  it("keeps a cutout while the photograph it was cut from is still there", () => {
    expect(cutoutSurvives("/media/fighters/f1-cd34.jpg", "/media/fighters/f1-cd34.jpg")).toBe(true);
  });

  it("discards it when the fighter uploads a different photograph", () => {
    // The upload key carries a random suffix, so a replacement is always a new
    // path even for the same fighter and the same picture.
    expect(cutoutSurvives("/media/fighters/f1-cd34.jpg", "/media/fighters/f1-ef56.jpg")).toBe(false);
  });

  it("discards it when the photograph is removed", () => {
    expect(cutoutSurvives("/media/fighters/f1-cd34.jpg", undefined)).toBe(false);
  });

  it("does not treat null and undefined as a change, so an untouched form writes nothing", () => {
    expect(cutoutSurvives(null, undefined)).toBe(true);
    expect(cutoutSurvives(undefined, null)).toBe(true);
  });
});

describe("plateInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(plateInitials("Chloe Baines")).toBe("CB");
    expect(plateInitials("Mary Jane Watson")).toBe("MJ");
  });

  it("copes with one name and with stray spacing", () => {
    expect(plateInitials("Ronaldo")).toBe("R");
    expect(plateInitials("  otis   grant ")).toBe("OG");
  });
});
