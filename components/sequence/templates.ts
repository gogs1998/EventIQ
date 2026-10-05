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
 * `tape` is the default. It, `faceoff` and `walkout` are the three the queue
 * makes for every bout: that list is `PUBLISHED_TEMPLATES` in lib/renders.ts,
 * which is where it lives because the renderer is plain Node and cannot import
 * this file's .tsx. The registry is held to it by a test rather than keeping a
 * second copy, and so is `perCorner`, which has to agree with
 * `PER_CORNER_TEMPLATES` there or a walkout would be queued as one video.
 *
 * `social` stays a local sample: nothing on the site plays it, so queueing it
 * would be rendering for nobody.
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
 * What putting the rest into the queue would still need.
 *
 * `walkout` is published: `render_jobs` carries a `corner` beside `template`
 * (migration 0017), in the unique key, and the fingerprint and the published key
 * carry it through the slot — `walkout-red`, `walkout-blue` — rather than a field
 * of their own, so the tape and the promo kept the digests they already had.
 * Handover section 11 has why.
 *
 * - **`social`** needs no schema at all. It is out of the queue only because
 *   nothing on the site plays it, and giving it a place — on the programme, or
 *   offered beside the promo — is the whole of its work: a slot in RENDER_SLOTS,
 *   a name on the dashboard, a page that offers it.
 * - **`countdown`, `card` and `doors`** are about a show rather than a bout, and
 *   live in show-templates.ts. They need a show-level job row before any of them
 *   can be queued.
 */
