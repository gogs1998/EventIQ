import { describe, expect, it } from "vitest";
import { captureState } from "./capture";

const img = (src: string, complete: boolean, naturalWidth: number) => ({
  src,
  complete,
  naturalWidth,
});

const PORTRAIT = "https://eventiq.win/media/cutouts/owen-pryce-ab12.webp";
const BACKDROP = "https://eventiq.win/backdrops/hall.webp";

describe("captureState", () => {
  it("is ready with nothing broken when every image painted", () => {
    expect(captureState([img(BACKDROP, true, 1600), img(PORTRAIT, true, 820)])).toEqual({
      ready: true,
      broken: [],
    });
  });

  it("is not ready while an image is still in flight", () => {
    expect(captureState([img(BACKDROP, true, 1600), img(PORTRAIT, false, 0)])).toEqual({
      ready: false,
      broken: [],
    });
  });

  /**
   * The whole reason this file exists. A refused /media object is a request that
   * finished: `complete` is true, so the old readiness check passed, and the
   * render went out with an empty subject and exit code 0.
   */
  it("reports an image that finished with nothing to paint", () => {
    expect(captureState([img(BACKDROP, true, 1600), img(PORTRAIT, true, 0)])).toEqual({
      ready: true,
      broken: [PORTRAIT],
    });
  });

  it("names each broken source once, in document order", () => {
    const other = "https://eventiq.win/media/cutouts/dre-osei-cd34.webp";
    expect(
      captureState([
        img(PORTRAIT, true, 0),
        img(other, true, 0),
        img(PORTRAIT, true, 0),
      ]).broken,
    ).toEqual([PORTRAIT, other]);
  });

  /** An element with no source is not a picture, and failing a render for one would be a lie. */
  it("ignores an image with no source at all", () => {
    expect(captureState([img("", true, 0)])).toEqual({ ready: true, broken: [] });
  });

  it("says both things at once", () => {
    const state = captureState([img(BACKDROP, false, 0), img(PORTRAIT, true, 0)]);
    expect(state).toEqual({ ready: false, broken: [PORTRAIT] });
  });

  it("is ready on an empty document", () => {
    expect(captureState([])).toEqual({ ready: true, broken: [] });
  });
});
