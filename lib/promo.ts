import { clamp } from "@/lib/anim";

/**
 * The derivations behind the show-level videos.
 *
 * The tale of the tape is about one bout; these three are about the whole show,
 * and a promoter posts them on their own feed in the week of the card. So the
 * things they need are different — how long is left, how many rows have to fit
 * on screen, what the date reads like on a poster — and none of them belong in
 * lib/tape.ts, which is about two fighters facing each other.
 *
 * Nothing here reads a clock or a database. Every function takes what it works
 * on, for the same reason the rest of the derivation layer does: the
 * compositions are pure functions of their props and the clock is one of them.
 */

/**
 * The date as a poster sets it: "Saturday 19 September", with no year.
 *
 * `formatEventDate` in lib/tape.ts carries the year, because it is read on a
 * programme somebody might open months later. A fight-week video is watched in
 * the week it is posted, and the year on it reads as small print rather than as
 * information. UTC, like the other two, so the day does not shift for a viewer
 * an hour either side of midnight.
 */
export function formatShowDateLong(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * The instant a capture is pegged to.
 *
 * Read here rather than in the capture page or the composition, for the same
 * reason `daysUntilShow` takes a `now` rather than looking: a component that
 * reads the clock is not a pure function of its props, and the exporter draws
 * every frame of a video from one page load. A countdown that ticked over on
 * frame 300 would be two different numbers in one video, and nothing would say
 * so. The page reads it once, at the top, and hands it down like the card.
 */
export function captureInstant(): number {
  return Date.now();
}

/**
 * How long is left, in the words a promoter would post.
 *
 * Never "0 days to go", which is the same mistake as "all 0 bouts" on the pitch
 * page (lib/copy.ts): a count that has reached zero has stopped being a count
 * and has become a different sentence. Null for a show that has already
 * happened, so the composition leaves the beat out rather than counting
 * backwards at a room that was there.
 */
export function daysToGoLabel(days: number): string | null {
  if (days < 0) return null;
  if (days === 0) return "Tonight";
  if (days === 1) return "Tomorrow night";
  return `${days} days to go`;
}

/**
 * How long each bout on a running order is on screen for.
 *
 * A card is between one bout and fifteen, and the same per-row timing cannot
 * serve both ends of that. Fifteen rows at a comfortable pace runs past the end
 * of the video; six rows at a pace that fits fifteen leaves the middle of the
 * sequence empty, which reads as a card with nothing on it rather than as a
 * short card. So the time per row is the budget divided by the number of rows,
 * held between a floor and a ceiling:
 *
 * - the **floor** is the point below which a row is a flicker rather than
 *   something the eye can read a name off, and a long card is allowed to run a
 *   little past its budget rather than go under it;
 * - the **ceiling** is the point above which a short card stops being a running
 *   order and becomes a slideshow, and the sequence holds on the full list for
 *   whatever is left instead.
 *
 * Floored rather than rounded, so a full card's rows fit inside the budget they
 * were divided out of instead of overrunning it by a frame each.
 */
export type RowTiming = {
  /** Frames the whole run of rows has to happen in. */
  budget: number;
  floor: number;
  ceiling: number;
};

export function rowFrames(bouts: number, timing: RowTiming): number {
  // A card with no running order on it yet has no rows to time. The ceiling
  // rather than the budget, so nothing downstream divides by a zero.
  if (bouts <= 0) return timing.ceiling;
  return clamp(Math.floor(timing.budget / bouts), timing.floor, timing.ceiling);
}

/**
 * The running-order template's scroll: 360 frames of the sixteen seconds, which
 * is everything between the heading landing and the closing card starting.
 */
export const CARD_ROWS: RowTiming = { budget: 360, floor: 18, ceiling: 46 };

/**
 * The countdown's run of bouts, which is a flash past rather than a read: it is
 * one beat of a twelve-second video and it only has to say how much is on.
 */
export const COUNTDOWN_ROWS: RowTiming = { budget: 120, floor: 7, ceiling: 26 };

export const cardRowFrames = (bouts: number): number => rowFrames(bouts, CARD_ROWS);
export const countdownRowFrames = (bouts: number): number => rowFrames(bouts, COUNTDOWN_ROWS);
