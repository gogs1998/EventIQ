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
 * `tape` is the default and is the only one that is published. The other three
 * are local samples for the owner to choose from — they are deliberately not in
 * the render fingerprint, not in `render_jobs` and not on the dashboard, because
 * a template id in the fingerprint changes what every existing row hashes to and
 * that is a migration rather than a flag. What it would take is written at the
 * bottom of this file.
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
 * What putting one of these into the queue would need, in order:
 *
 * 1. `template` in RENDER_INPUT_FIELDS (lib/renders.ts). It is on screen, so it
 *    belongs in the fingerprint — but every existing `current_hash` was made
 *    without it, so adding it marks all fifteen bouts of every card stale at
 *    once. That is correct and it is also a quarter of an hour of rendering per
 *    show, so it wants doing deliberately rather than as a side effect.
 * 2. A `template` column on `render_jobs`, in the unique key beside
 *    `bout_number` — and `corner` with it, because a walkout is two videos for
 *    one bout and one row cannot hold both keys. `renderJobId` and `claimSql`
 *    both address a row by `(event_id, bout_number)` today.
 * 3. `renderKeyFor` carrying the template and the corner, so the four videos of
 *    one bout do not publish over each other.
 * 4. `loadRenders` and the dashboard reading a template per row rather than one
 *    video per bout, and the programme deciding which one it plays.
 *
 * None of that is needed to render a sample locally, which is why none of it is
 * here yet.
 */
