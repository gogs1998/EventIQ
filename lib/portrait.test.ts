import { describe, expect, it } from "vitest";
import { cutoutSurvives, parallaxTravel, plateInitials, portraitOf } from "@/lib/portrait";
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
