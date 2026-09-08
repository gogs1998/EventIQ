/**
 * Animation is expressed as pure maths on a frame number, never as CSS
 * animations or timers. That is what lets the same component both play in the
 * page and be screenshotted frame by frame into an mp4 that matches exactly.
 */

export const FPS = 30;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 0 before `start`, 1 after `end`, linear between. */
export function progress(frame: number, start: number, end: number): number {
  if (end <= start) return frame >= end ? 1 : 0;
  return clamp((frame - start) / (end - start), 0, 1);
}

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutExpo: Easing = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Overshoots then settles. Used for anything that should feel like it lands hard. */
export const easeOutBack: Easing = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export function interpolate(
  frame: number,
  [start, end]: [number, number],
  [from, to]: [number, number],
  easing: Easing = linear,
): number {
  return from + (to - from) * easing(progress(frame, start, end));
}

/** Rises in, holds, falls out. Handy for a card that appears and leaves. */
export function pulse(
  frame: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number,
  easing: Easing = easeOutCubic,
): number {
  if (frame < outStart) return easing(progress(frame, inStart, inEnd));
  return 1 - easeInCubic(progress(frame, outStart, outEnd));
}

/** Counts a number up so stats land rather than just appear. */
export function countTo(
  frame: number,
  [start, end]: [number, number],
  target: number,
  easing: Easing = easeOutExpo,
): number {
  return Math.round(interpolate(frame, [start, end], [0, target], easing));
}

export function staggered(index: number, start: number, perItem: number): number {
  return start + index * perItem;
}

export const secondsToFrames = (seconds: number): number => Math.round(seconds * FPS);
