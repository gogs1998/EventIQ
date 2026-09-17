import { createElement, type ReactElement } from "react";
import { COUNTDOWN_DURATION, ShowCountdown } from "./ShowCountdown";
import { DOORS_DURATION, ShowDoors } from "./ShowDoors";
import { RUNNING_ORDER_DURATION, ShowRunningOrder } from "./ShowRunningOrder";
import type { ShowSceneProps } from "./show-parts";

/**
 * The show-level videos, by the id that names one in an address.
 *
 * The tale of the tape is about a bout and there is one of it. These are about
 * the whole show and there are three, because a promoter posts a different thing
 * on the Monday, on the day the running order is finished, and on the morning of
 * the card. So the capture page takes the id out of the URL and looks it up
 * here, and an id nobody has written a composition for is a 404 rather than a
 * blank page — the same answer that route gives for a show that does not exist.
 *
 * Written in one list rather than as a switch in the page, so the renderer, the
 * page and anything that comes to offer a promoter a choice are all reading the
 * same three facts, and so a fourth template is one entry rather than three
 * edits.
 *
 * `createElement` rather than JSX, so this stays a plain .ts module beside the
 * compositions it names.
 */

export type ShowTemplateId = "countdown" | "card" | "doors";

export type ShowTemplate = {
  id: ShowTemplateId;
  /** What a promoter would call it. */
  name: string;
  /** When they would post it. One line, because it sits beside the name. */
  note: string;
  /** Length in frames, at SEQ.fps. The capture page publishes it as __duration. */
  duration: number;
  render: (props: ShowSceneProps) => ReactElement;
};

export const SHOW_TEMPLATES: readonly ShowTemplate[] = [
  {
    id: "countdown",
    name: "Fight week",
    note: "The show, the date, how long is left and everything that is on.",
    duration: COUNTDOWN_DURATION,
    render: (props) => createElement(ShowCountdown, props),
  },
  {
    id: "card",
    name: "Running order",
    note: "The full card, main event first, with both corners on every bout.",
    duration: RUNNING_ORDER_DURATION,
    render: (props) => createElement(ShowRunningOrder, props),
  },
  {
    id: "doors",
    name: "On the day",
    note: "Venue, doors, first bell and the code, for the morning of the show.",
    duration: DOORS_DURATION,
    render: (props) => createElement(ShowDoors, props),
  },
];

/** The template with this id, or nothing. Unknown ids are the caller's 404. */
export function showTemplate(id: string | undefined): ShowTemplate | undefined {
  return SHOW_TEMPLATES.find((template) => template.id === id);
}
