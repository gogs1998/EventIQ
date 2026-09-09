/**
 * Whether the capture page is fit to be photographed 480 times.
 *
 * `img.complete` is the only thing the exporter used to ask, and it is true of an
 * image that arrived and true of one that 404ed — a refused portrait is a
 * finished request with no picture in it. So a bout whose `/media` objects were
 * all being turned away settled, reported ready, and rendered sixteen seconds of
 * name plates over an empty subject with a broken-image marker in the corner,
 * and every part of the pipeline reported success. The intrinsic width is what
 * tells the two apart: an image that painted has one, an image that did not has
 * zero.
 *
 * Kept here rather than inside RenderStage because it is the decision and the
 * decision is worth testing without a browser. The component is the stateful
 * wrapper around it; TaleOfTheTape stays a pure function of its props and knows
 * nothing about any of this.
 */

/** As much of an HTMLImageElement as the question needs. */
export type CaptureImage = {
  readonly src: string;
  readonly complete: boolean;
  readonly naturalWidth: number;
};

export type CaptureState = {
  /** Every request has settled, one way or the other. Nothing is still in flight. */
  ready: boolean;
  /** The sources that settled with nothing to paint, in document order, once each. */
  broken: string[];
};

export function captureState(images: readonly CaptureImage[]): CaptureState {
  const broken: string[] = [];
  let ready = true;

  for (const image of images) {
    // An <img> with no source has nothing to wait for and nothing to report; the
    // composition never draws one, and treating it as broken would fail a render
    // for an element that is not a picture.
    if (!image.src) continue;
    if (!image.complete) {
      ready = false;
      continue;
    }
    if (image.naturalWidth === 0 && !broken.includes(image.src)) broken.push(image.src);
  }

  return { ready, broken };
}
