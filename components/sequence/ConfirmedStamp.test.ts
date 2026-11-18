import { describe, expect, it } from "vitest";
import { STAMP_SEAL } from "./ConfirmedStamp";

/**
 * Where the stamp comes to rest, as geometry rather than as pixels.
 *
 * The golden frames hold the picture; this holds the rule the picture has to
 * keep. The stamp used to finish lifted onto the fighter's mouth, and a golden
 * frame regenerated after a layout change would have accepted that again.
 */
describe("the stamp at the close", () => {
  // The stamp's own box (the SVG is 900 by 300), the -9 degree tilt, and where
  // it lands before the close: centred across the frame, centred on y 910.
  const width = 900 * STAMP_SEAL.scale;
  const height = 300 * STAMP_SEAL.scale;
  const tilt = (9 * Math.PI) / 180;
  const extentY = height * Math.cos(tilt) + width * Math.sin(tilt);
  const extentX = width * Math.cos(tilt) + height * Math.sin(tilt);
  const centreY = 910 + STAMP_SEAL.y;
  const centreX = 540 + STAMP_SEAL.x;

  it("sits below the face", () => {
    // The hero puts the face in the middle of the top half; the chin of the
    // curated portraits is above y 700. 900 leaves room for a lower crop.
    expect(centreY - extentY / 2).toBeGreaterThanOrEqual(900);
  });

  it("sits above the close's first line and inside the frame", () => {
    expect(centreY + extentY / 2).toBeLessThan(1150);
    expect(centreX - extentX / 2).toBeGreaterThan(0);
    expect(centreX + extentX / 2).toBeLessThan(1080);
  });
});
