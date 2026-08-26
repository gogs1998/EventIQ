/**
 * Deterministic particles. Seeded from the index alone so every render of a
 * given frame produces identical embers, which is what makes frame-by-frame
 * capture stitch into smooth video instead of static.
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Ember = {
  x: number;
  size: number;
  opacity: number;
  speed: number;
  phase: number;
  drift: number;
};

export function embers(count: number, seed = 7): Ember[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: rand(),
    size: 1.5 + rand() * 4,
    opacity: 0.12 + rand() * 0.4,
    speed: 0.25 + rand() * 0.7,
    phase: rand(),
    drift: (rand() - 0.5) * 90,
  }));
}

/** Vertical position of an ember at a given frame, wrapping around the frame height. */
export function emberY(ember: Ember, frame: number, height: number): number {
  const t = (ember.phase + (frame * ember.speed) / 900) % 1;
  return height - t * (height + 200);
}

export function emberX(ember: Ember, frame: number, width: number): number {
  return ember.x * width + Math.sin((frame / 60) * ember.speed + ember.phase * 6) * ember.drift;
}
