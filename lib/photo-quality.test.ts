import { describe, expect, it } from "vitest";
import { CUTOUT_ISSUES, cutoutIssuesFrom, cutoutQualityFrom, photoCouldBeBetter } from "@/lib/photo-quality";
import { QUALITY_REASONS } from "@/scripts/photo-quality.mjs";

describe("reading a verdict back", () => {
  it("knows the three verdicts and nothing else", () => {
    expect(cutoutQualityFrom("ok")).toBe("ok");
    expect(cutoutQualityFrom("repaired")).toBe("repaired");
    expect(cutoutQualityFrom("poor")).toBe("poor");
    expect(cutoutQualityFrom("POOR")).toBeUndefined();
    expect(cutoutQualityFrom(null)).toBeUndefined();
  });

  it("keeps the reasons it has a name for and drops the rest", () => {
    expect(cutoutIssuesFrom('["head-only","dark"]')).toEqual(["head-only", "dark"]);
    expect(cutoutIssuesFrom('["head-only","<script>"]')).toEqual(["head-only"]);
    expect(cutoutIssuesFrom('"head-only"')).toBeUndefined();
    expect(cutoutIssuesFrom("not json")).toBeUndefined();
    expect(cutoutIssuesFrom("[]")).toBeUndefined();
    expect(cutoutIssuesFrom(null)).toBeUndefined();
  });

  /** The renderer writes these names and the app reads them; one list on each side. */
  it("agrees with the renderer about what the reasons are called", () => {
    expect([...CUTOUT_ISSUES].sort()).toEqual([...QUALITY_REASONS].sort());
  });
});

describe("photoCouldBeBetter", () => {
  const cutout = "/media/cutouts/f1-ab12.webp";

  it("is only a poor cutout that is still the one on the row", () => {
    expect(photoCouldBeBetter({ cutout, cutoutQuality: "poor" })).toBe(true);
    expect(photoCouldBeBetter({ cutout, cutoutQuality: "repaired" })).toBe(false);
    expect(photoCouldBeBetter({ cutout })).toBe(false);
    // The verdict went with the photograph it was made from.
    expect(photoCouldBeBetter({ cutoutQuality: "poor" })).toBe(false);
  });

  it("never asks a fighter whose card shows a portrait they approved", () => {
    expect(
      photoCouldBeBetter({ cutout, cutoutQuality: "poor", stylised: "/media/portraits/f1-ab12.png" }),
    ).toBe(false);
  });
});
