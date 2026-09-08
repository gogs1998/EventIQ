import { FPS } from "@/lib/anim";

/**
 * The whole sequence in one place, because the in-page player and the mp4
 * renderer must agree on it exactly.
 */
export const SEQ = {
  fps: FPS,
  width: 1080,
  height: 1920,
  duration: 480, // 16s
} as const;

export const SCENES = {
  billing: { start: 0, end: 70 },
  red: { start: 62, end: 178 },
  blue: { start: 170, end: 286 },
  headToHead: { start: 278, end: 410 },
  close: { start: 402, end: 480 },
} as const;

export type SceneName = keyof typeof SCENES;
