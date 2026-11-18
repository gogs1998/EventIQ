import { describe, expect, it } from "vitest";
import {
  assessCutout,
  components,
  DARK_MEAN,
  dilate,
  eqFilter,
  erode,
  exposurePlan,
  firmBody,
  headOnly,
  isolateSubject,
  lumaStats,
  pngSize,
  QUALITY_REASONS,
  rebuildTorso,
  repairMask,
  secondHead,
  torsoHalfWidth,
} from "./photo-quality.mjs";

/**
 * The repairs, on masks small enough to read.
 *
 * Every mask here is drawn from ellipses and rectangles in a few lines, because
 * the alternative — a real person's photograph in the repository — is the one
 * thing these must never need. Each shape is the outline of one of the failures
 * the first real photographs produced.
 */

function canvas(width, height) {
  return { width, height, alpha: new Uint8Array(width * height) };
}

function ellipse(mask, cx, cy, rx, ry, value = 255) {
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) mask.alpha[y * mask.width + x] = value;
    }
  }
  return mask;
}

function rect(mask, x0, y0, x1, y1, value = 255) {
  for (let y = Math.max(0, y0); y < Math.min(mask.height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(mask.width, x1); x += 1) {
      mask.alpha[y * mask.width + x] = value;
    }
  }
  return mask;
}

const solid = (alpha) => alpha.reduce((n, a) => n + (a >= 128 ? 1 : 0), 0);

/** A waist-up portrait: a head, a neck and shoulders to the bottom of the frame. */
function portrait(width = 100, height = 150) {
  const mask = canvas(width, height);
  ellipse(mask, 50, 40, 16, 20);
  rect(mask, 43, 55, 57, 72);
  for (let y = 70; y < height; y += 1) {
    const half = Math.min(42, 8 + (y - 70) * 1.6);
    rect(mask, Math.round(50 - half), y, Math.round(50 + half), y + 1);
  }
  return mask;
}

/** The dark-bar failure: a head and a stub of neck, and nothing under it. */
function floatingHead(width = 100, height = 150) {
  const mask = canvas(width, height);
  ellipse(mask, 50, 40, 16, 20);
  rect(mask, 43, 55, 57, 66);
  return mask;
}

describe("exposure", () => {
  it("measures the mean and the spread of a photograph", () => {
    const stats = lumaStats(new Uint8Array([0, 0, 255, 255]));
    expect(stats.mean).toBeCloseTo(0.5);
    expect(stats.p05).toBe(0);
    expect(stats.p95).toBe(1);
    expect(Number.isNaN(lumaStats(new Uint8Array()).mean)).toBe(true);
  });

  it("leaves a photograph with enough light in it alone", () => {
    expect(exposurePlan({ mean: 0.45, p95: 0.9 })).toBeNull();
    expect(exposurePlan({ mean: DARK_MEAN, p95: 0.9 })).toBeNull();
    expect(exposurePlan({ mean: NaN, p95: NaN })).toBeNull();
  });

  it("lifts a dark one, within bounds, and colours the output with half the lift", () => {
    const plan = exposurePlan({ mean: 0.19, p95: 0.56 });
    expect(plan).not.toBeNull();
    expect(plan.model.gamma).toBeGreaterThan(1.5);
    expect(plan.model.gamma).toBeLessThanOrEqual(2.4);
    expect(plan.model.contrast).toBeLessThanOrEqual(1.2);
    expect(plan.model.brightness).toBeLessThanOrEqual(0.06);
    expect(plan.output.gamma - 1).toBeCloseTo((plan.model.gamma - 1) / 2, 2);
  });

  it("never asks for more than the ceiling however dark the photograph", () => {
    const plan = exposurePlan({ mean: 0.001, p95: 0.01 });
    expect(plan.model).toEqual({ gamma: 2.4, contrast: 1.2, brightness: 0.06 });
  });

  it("writes a filter out of numbers alone", () => {
    expect(eqFilter({ gamma: 2, contrast: 1.1, brightness: 0.02 })).toBe(
      "eq=gamma=2.000:contrast=1.100:brightness=0.020",
    );
    expect(eqFilter({ gamma: "1;drawtext", contrast: NaN })).toBe(
      "eq=gamma=1.000:contrast=1.000:brightness=0.000",
    );
  });

  it("reads a PNG's size from its header and refuses anything else", () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    header.set([0, 0, 3, 232], 16);
    header.set([0, 0, 5, 50], 20);
    expect(pngSize(header)).toEqual({ width: 1000, height: 1330 });
    expect(pngSize(new Uint8Array(24))).toBeNull();
    expect(pngSize(null)).toBeNull();
  });
});

describe("morphology", () => {
  it("grows and shrinks a shape by a radius", () => {
    const mask = canvas(9, 9);
    mask.alpha[4 * 9 + 4] = 1;
    const grown = dilate(mask.alpha, 9, 9, 2);
    expect(grown.reduce((a, b) => a + b, 0)).toBe(25);
    expect(erode(grown, 9, 9, 2).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("isolating the fighter", () => {
  it("finds separate regions", () => {
    const mask = canvas(40, 20);
    rect(mask, 2, 2, 10, 10);
    rect(mask, 20, 2, 30, 18);
    const { parts } = components(mask.alpha, 40, 20);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.area).sort((a, b) => a - b)).toEqual([64, 160]);
  });

  it("takes out somebody standing beside the fighter, and says so", () => {
    const mask = portrait(160, 150);
    // A second person leaning in from the right edge, not touching.
    ellipse(mask, 150, 60, 12, 16);
    rect(mask, 138, 76, 160, 150);
    const { alpha, dropped } = isolateSubject(mask.alpha, 160, 150);
    expect(dropped).toBe(1);
    expect(alpha[100 * 160 + 155]).toBe(0);
    expect(alpha[40 * 160 + 50]).toBe(255);
  });

  it("keeps the most central person when two are the same size", () => {
    const mask = canvas(200, 100);
    rect(mask, 10, 20, 50, 100);
    rect(mask, 90, 20, 130, 100);
    const { alpha, subject } = isolateSubject(mask.alpha, 200, 100);
    expect(subject.minX).toBe(90);
    expect(alpha[50 * 200 + 20]).toBe(0);
  });

  it("drops specks without counting them as people, and keeps a detached hand", () => {
    const mask = portrait(100, 150);
    rect(mask, 2, 2, 4, 4); // a fairy light
    // A hand the model detached at the wrist: small, and inside the outline.
    rect(mask, 20, 110, 30, 122, 0);
    rect(mask, 22, 112, 28, 120);
    const { alpha, dropped } = isolateSubject(mask.alpha, 100, 150);
    expect(dropped).toBe(0);
    expect(alpha[3 * 100 + 3]).toBe(0);
    expect(alpha[115 * 100 + 25]).toBe(255);
  });

  it("returns nothing for an empty mask rather than inventing a subject", () => {
    const { alpha, subject } = isolateSubject(new Uint8Array(100), 10, 10);
    expect(subject).toBeNull();
    expect(solid(alpha)).toBe(0);
  });
});

describe("a head with no body under it", () => {
  it("is recognised", () => {
    const mask = floatingHead();
    const head = headOnly(mask.alpha, mask.width, mask.height);
    expect(head).not.toBeNull();
    expect(head.chin).toBe(65);
    expect(head.centre).toBeCloseTo(50, 0);
    expect(head.headWidth).toBeGreaterThan(28);
  });

  it("is not confused with a portrait that carries on to the bottom of the frame", () => {
    const mask = portrait();
    expect(headOnly(mask.alpha, mask.width, mask.height)).toBeNull();
  });

  it("is not confused with a whole person a long way off", () => {
    const mask = canvas(100, 150);
    ellipse(mask, 50, 20, 4, 5);
    rect(mask, 44, 25, 56, 90);
    expect(headOnly(mask.alpha, 100, 150)).toBeNull();
  });

  it("gets shoulders drawn under it, centred on the neck and feathered", () => {
    const mask = floatingHead();
    const { alpha, rebuilt } = rebuildTorso(mask.alpha, mask.width, mask.height);
    expect(rebuilt).toBe(true);
    // Under the chin the torso is solid in the middle and wider than the head.
    expect(alpha[140 * 100 + 50]).toBe(255);
    expect(alpha[140 * 100 + 15]).toBe(255);
    expect(alpha[80 * 100 + 2]).toBe(0);
    // A soft edge, not a cut: some row has a value strictly between.
    const row = Array.from(alpha.subarray(80 * 100, 81 * 100));
    expect(row.some((a) => a > 0 && a < 255)).toBe(true);
    // The head is untouched.
    expect(alpha[40 * 100 + 50]).toBe(255);
    expect(alpha[10 * 100 + 5]).toBe(0);
  });

  it("leaves a mask with a body exactly as it was", () => {
    const mask = portrait();
    const { alpha, rebuilt } = rebuildTorso(mask.alpha, mask.width, mask.height);
    expect(rebuilt).toBe(false);
    expect(alpha).toBe(mask.alpha);
  });

  it("draws a shape that only ever gets wider below the neck", () => {
    let last = torsoHalfWidth(0);
    for (let t = 0; t <= 3; t += 0.05) {
      const half = torsoHalfWidth(t);
      expect(half).toBeGreaterThanOrEqual(last - 1e-9);
      last = half;
    }
    expect(torsoHalfWidth(-1)).toBe(0);
    expect(torsoHalfWidth(10)).toBe(1.6);
  });
});

describe("a body the model kept faintly", () => {
  it("is made solid inside the model's own outline", () => {
    const mask = canvas(100, 150);
    ellipse(mask, 50, 30, 16, 20);
    rect(mask, 15, 60, 85, 150, 90);
    const { alpha, firmed } = firmBody(mask.alpha, 100, 150);
    expect(firmed).toBe(true);
    expect(alpha[110 * 100 + 50]).toBe(255);
    // Outside the outline nothing appears.
    expect(alpha[110 * 100 + 5]).toBe(0);
  });

  it("leaves a solid body and the hair above the chin alone", () => {
    const mask = portrait();
    expect(firmBody(mask.alpha, 100, 150).firmed).toBe(false);
  });
});

describe("two people touching", () => {
  it("is seen in the outline when two heads rise to the same height", () => {
    const mask = canvas(200, 150);
    ellipse(mask, 60, 40, 18, 22);
    ellipse(mask, 140, 44, 18, 22);
    rect(mask, 20, 70, 180, 150);
    expect(secondHead(mask.alpha, 200, 150)).toBe(true);
  });

  it("is not a fist held up in a guard below the chin", () => {
    const mask = portrait(160, 150);
    ellipse(mask, 120, 68, 8, 8);
    expect(secondHead(mask.alpha, 160, 150)).toBe(false);
  });

  it("is not one person on their own", () => {
    const mask = portrait();
    expect(secondHead(mask.alpha, 100, 150)).toBe(false);
  });
});

describe("the verdict", () => {
  const lit = { mean: 0.45 };

  it("is ok for a portrait nothing had to be done to", () => {
    const mask = portrait();
    expect(assessCutout({ ...mask, luma: lit })).toEqual({ verdict: "ok", reasons: [] });
  });

  it("is repaired, with the reasons, where something was done and it worked", () => {
    const mask = portrait();
    const result = assessCutout({ ...mask, luma: { mean: 0.2 }, isolated: 1, rebuilt: true, lifted: true });
    expect(result.verdict).toBe("repaired");
    expect(result.reasons).toEqual(["multiple-people", "head-only", "dark"]);
  });

  it("is poor for a subject too small to read", () => {
    const mask = canvas(100, 150);
    ellipse(mask, 50, 60, 5, 6);
    expect(assessCutout({ ...mask, luma: lit })).toEqual({ verdict: "poor", reasons: ["tiny-subject"] });
  });

  it("is poor for a head cut off by the top of the frame", () => {
    const mask = portrait();
    rect(mask, 36, 0, 64, 30);
    const result = assessCutout({ ...mask, luma: lit });
    expect(result.verdict).toBe("poor");
    expect(result.reasons).toContain("cut-off");
  });

  it("is poor for a head against the side of the frame, but not for shoulders against it", () => {
    const leaning = canvas(100, 150);
    ellipse(leaning, 10, 40, 16, 20);
    rect(leaning, 0, 60, 50, 150);
    expect(assessCutout({ ...leaning, luma: lit }).reasons).toContain("cut-off");

    const broad = portrait();
    rect(broad, 0, 120, 100, 150);
    expect(assessCutout({ ...broad, luma: lit }).verdict).toBe("ok");
  });

  it("is poor for a photograph too dark to trust, and for two people it could not separate", () => {
    const mask = portrait();
    expect(assessCutout({ ...mask, luma: { mean: 0.05 } }).reasons).toContain("very-dark");
    expect(assessCutout({ ...mask, luma: lit, twoHeads: true })).toEqual({
      verdict: "poor",
      reasons: ["multiple-people"],
    });
  });

  it("is poor for an empty mask", () => {
    const mask = canvas(10, 10);
    expect(assessCutout({ ...mask, luma: lit }).verdict).toBe("poor");
  });

  it("only ever gives reasons it has a name for", () => {
    const mask = floatingHead();
    const result = repairMask({ ...mask, luma: { mean: 0.2 }, lifted: true });
    for (const reason of result.reasons) expect(QUALITY_REASONS).toContain(reason);
  });
});

describe("the repairs in order", () => {
  it("turns the dark-bar head into a head and shoulders, and calls it repaired", () => {
    const mask = floatingHead();
    const before = solid(mask.alpha);
    const result = repairMask({ ...mask, luma: { mean: 0.19 }, lifted: true });
    expect(result.verdict).toBe("repaired");
    expect(result.reasons).toEqual(["head-only", "dark"]);
    expect(solid(result.alpha)).toBeGreaterThan(before * 3);
  });

  it("takes the friend out before drawing shoulders, so none go under their head", () => {
    // A head left floating in the middle, and a friend at the edge whose
    // lighter shirt the model kept whole, so theirs is the bigger region.
    const centred = canvas(200, 150);
    ellipse(centred, 100, 40, 16, 20);
    rect(centred, 93, 55, 107, 66);
    ellipse(centred, 186, 50, 12, 16);
    rect(centred, 176, 66, 200, 150);
    const result = repairMask({ ...centred, luma: { mean: 0.45 } });
    expect(result.reasons).toEqual(["multiple-people", "head-only"]);
    expect(result.verdict).toBe("repaired");
    expect(result.alpha[140 * 200 + 199]).toBe(0);
  });

  it("does not draw a torso under two heads it could not separate", () => {
    const mask = canvas(200, 150);
    ellipse(mask, 60, 40, 18, 22);
    ellipse(mask, 140, 44, 18, 22);
    rect(mask, 55, 55, 145, 70);
    const result = repairMask({ ...mask, luma: { mean: 0.45 } });
    expect(result.verdict).toBe("poor");
    expect(result.reasons).toContain("multiple-people");
    expect(result.reasons).not.toContain("head-only");
  });
});
