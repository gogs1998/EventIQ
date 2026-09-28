import type { Card } from "@/lib/card";
import type { Bout, Corner } from "@/lib/types";
import { FaceOff, FACEOFF_FRAMES } from "./FaceOff";
import { Social, SOCIAL_FRAMES } from "./Social";
import { TaleOfTheTape } from "./TaleOfTheTape";
import { Walkout, WALKOUT_FRAMES } from "./Walkout";
import { SEQ } from "./timeline";

/**
 * Every composition a bout can be rendered as, in one place.
 *
 * There is one of these because there are now four, and the alternative is the
 * capture page, the exporter and the player each carrying their own idea of what
 * a template is and how long it runs. A frame count that disagrees between the
 * page and the exporter does not fail: it produces a video that ends early or
 * holds an empty frame for a second, which nobody notices until it is posted.
 *
 * `tape` is the default. It and `faceoff` are the two the queue makes for every
 * bout and the programme carries: that list is `PUBLISHED_TEMPLATES` in
 * lib/renders.ts, which is where it lives because the renderer is plain Node and
 * cannot import this file's .tsx. The registry is held to it by a test rather
 * than keeping a second copy.
 *
 * `walkout` and `social` stay local samples. A walkout is one video per corner
 * and `render_jobs` carries no corner, and nothing on the site plays either, so
 * queueing them would be rendering for nobody.
 */

export type TemplateProps = {
  card: Card;
  bout: Bout;
  frame: number;
  /**
   * Which fighter a one-corner template is about. Every template takes it so the
   * registry has one signature; only `walkout` reads it.
   */
  corner: Corner;
};

export type Template = {
  component: (props: TemplateProps) => React.ReactNode;
  /** How many frames long, at SEQ.fps. */
  frames: number;
  /** What an operator sees in a list. */
  label: string;
  /** Whether it is rendered once per fighter rather than once per bout. */
  perCorner: boolean;
};

export const DEFAULT_TEMPLATE = "tape";

export const TEMPLATES: Record<string, Template> = {
  tape: {
    component: TaleOfTheTape,
    frames: SEQ.duration,
    label: "Tale of the tape",
    perCorner: false,
  },
  faceoff: {
    component: FaceOff,
    frames: FACEOFF_FRAMES,
    label: "Face-off promo",
    perCorner: false,
  },
  walkout: {
    component: Walkout,
    frames: WALKOUT_FRAMES,
    label: "Walkout, one corner",
    perCorner: true,
  },
  social: {
    component: Social,
    frames: SOCIAL_FRAMES,
    label: "Social cut",
    perCorner: false,
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/**
 * Undefined rather than the default for an id nobody recognises.
 *
 * The capture page turns that into the same 404 an unknown slug gets. Falling
 * back to the tape would mean `?template=facoff` quietly rendering sixteen
 * seconds of the wrong composition and the operator finding out from the file.
 */
export function templateOf(id: string | undefined): Template | undefined {
  return id === undefined ? TEMPLATES[DEFAULT_TEMPLATE] : TEMPLATES[id];
}

/**
 * What putting `walkout` or `social` into the queue would still need.
 *
 * The first four steps are done: `template` is in the fingerprint, on the job
 * row and in its unique key, in `renderKeyFor`, and in what the programme and
 * the dashboard read back. What is left is the one thing only a walkout needs:
 *
 * - **A `corner` beside `template` in the unique key**, because a walkout is two
 *   videos for one bout and one row cannot hold both keys — and in the
 *   fingerprint and the published key with it. `social` needs none of that and
 *   is out of the queue only because nothing on the site plays it; giving it a
 *   place on the programme is the whole of its work.
 */
