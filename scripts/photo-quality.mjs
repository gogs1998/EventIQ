/**
 * What can be done about the photographs fighters actually send, without a model.
 *
 * Background removal is good at the photograph it was trained on — one person,
 * lit, in front of something that is not them — and amateur fighters send
 * selfies from the bar after a session. Three things went wrong on the first
 * real ones (HANDOVER bug 54):
 *
 * - **A dark bar and a black T-shirt lost the whole body.** The model kept a
 *   head floating over nothing, and in the video it reads as exactly that.
 * - **A selfie with a mate in it cut out both of them.** A child at the edge of
 *   a family photograph would go into a fight video the same way.
 * - **The photograph was simply too dark** for the model to find the edges.
 *
 * The fix done by hand was: lift the exposure before removal, crop to the main
 * person, and rebuild the shoulders below the chin. This file is that, as pure
 * functions over plain arrays — a luminance histogram, an alpha mask as a
 * `Uint8Array` — so every decision can be tested on a twelve-pixel synthetic
 * mask rather than by running a model on somebody's face. scripts/cutouts.mjs
 * does the plumbing: ffmpeg in, the model, ffmpeg out.
 *
 * Nothing here is generative. It moves pixels the fighter sent and draws an
 * alpha shape; it never invents a face, a body or a background. Where it cannot
 * make a cutout worth showing, it says so (`assessCutout`), and lib/portrait.ts
 * shows the photograph instead.
 */

// ------------------------------------------------------------------ exposure

/** Below this mean luminance a photograph is lifted before the model sees it. */
export const DARK_MEAN = 0.3;
/** Below this, even lifted, there is too little in the photograph to trust. */
export const VERY_DARK_MEAN = 0.1;
/** Where a lift aims the mean. Not mid-grey: a lifted bar photo is still a bar. */
const TARGET_MEAN = 0.45;
const MAX_GAMMA = 2.4;
const MAX_CONTRAST = 1.2;
const MAX_BRIGHTNESS = 0.06;

/** Mean and three percentiles of 8-bit luminance samples, all 0 to 1. */
export function lumaStats(gray) {
  if (!gray?.length) return { mean: NaN, p05: NaN, p50: NaN, p95: NaN };
  const histogram = new Uint32Array(256);
  let total = 0;
  for (const value of gray) {
    histogram[value] += 1;
    total += value;
  }
  const at = (fraction) => {
    const wanted = fraction * gray.length;
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += histogram[v];
      if (seen >= wanted) return v / 255;
    }
    return 1;
  };
  return { mean: total / gray.length / 255, p05: at(0.05), p50: at(0.5), p95: at(0.95) };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * How far to lift a photograph, or null where it is bright enough already.
 *
 * Two plans. `model` is what the background remover is shown, and it is pushed
 * as far as the bounds allow because a model finding an edge is all it is for.
 * `output` is what the fighter's cutout is coloured from, and it is half the
 * lift: their own photograph's colours wherever that is sensible, brightened
 * only enough that a face from a dark room does not sit as a shadow on a lit
 * backdrop. Gamma rather than gain, so highlights already in the frame — a face
 * under a bar light — are not blown out to make the shadows visible.
 */
export function exposurePlan(stats) {
  const { mean, p95 } = stats;
  if (!Number.isFinite(mean) || mean >= DARK_MEAN) return null;

  // ffmpeg's eq raises each value to 1/gamma, so the mean lands near the target
  // at gamma = ln(mean) / ln(target).
  const gamma = clamp(Math.log(Math.max(mean, 0.02)) / Math.log(TARGET_MEAN), 1, MAX_GAMMA);
  // A little contrast back, because a gamma lift flattens; less where the
  // highlights are already near the top.
  const contrast = clamp(1 + (0.9 - (Number.isFinite(p95) ? p95 : 0.9)) * 0.4, 1, MAX_CONTRAST);
  const brightness = clamp((DARK_MEAN - mean) * 0.2, 0, MAX_BRIGHTNESS);

  const model = { gamma: round3(gamma), contrast: round3(contrast), brightness: round3(brightness) };
  const output = {
    gamma: round3(1 + (gamma - 1) / 2),
    contrast: round3(1 + (contrast - 1) / 2),
    brightness: round3(brightness / 2),
  };
  return { model, output };
}

/** The ffmpeg filter for one plan. Numbers only, so nothing from a row reaches a filter graph. */
export function eqFilter(plan) {
  const n = (value, fallback) => (Number.isFinite(value) ? value : fallback).toFixed(3);
  return `eq=gamma=${n(plan.gamma, 1)}:contrast=${n(plan.contrast, 1)}:brightness=${n(plan.brightness, 0)}`;
}

/** Width and height out of a PNG's header, or null for anything that is not one. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, i) => bytes[i] === byte)) return null;
  const read = (at) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  const width = read(16);
  const height = read(20);
  return width && height ? { width, height } : null;
}

// --------------------------------------------------------------------- masks

/**
 * The alpha a pixel needs to count as part of somebody when finding people.
 *
 * Low on purpose. The model hands a dark T-shirt back half transparent rather
 * than gone, and at 128 that half of a person is a separate island from their
 * head — which would then be thrown away as "somebody else".
 */
export const PART_ALPHA = 40;
/** The alpha a pixel needs to count as solid when measuring shapes. */
export const SOLID_ALPHA = 128;

/** Smaller than this fraction of the frame is a speck, not a person. */
const SPECK = 0.002;
/** At least this fraction of the frame, and separate, is somebody else. */
const PERSON = 0.02;

/**
 * Connected regions of a mask, four-connected.
 *
 * Iterative with one preallocated stack, because a 1000x1333 cutout is a
 * million pixels and a recursive fill would blow the stack on the first
 * shoulder.
 */
export function components(alpha, width, height, threshold = PART_ALPHA) {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  const parts = [];
  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] || alpha[start] < threshold) continue;
    const label = parts.length + 1;
    const part = { label, area: 0, minX: width, maxX: -1, minY: height, maxY: -1, sumX: 0, sumY: 0 };
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    while (top) {
      const at = stack[--top];
      const x = at % width;
      const y = (at - x) / width;
      part.area += 1;
      part.sumX += x;
      part.sumY += y;
      if (x < part.minX) part.minX = x;
      if (x > part.maxX) part.maxX = x;
      if (y < part.minY) part.minY = y;
      if (y > part.maxY) part.maxY = y;
      const push = (next) => {
        if (!labels[next] && alpha[next] >= threshold) {
          labels[next] = label;
          stack[top++] = next;
        }
      };
      if (x > 0) push(at - 1);
      if (x < width - 1) push(at + 1);
      if (y > 0) push(at - width);
      if (y < height - 1) push(at + width);
    }
    part.cx = part.sumX / part.area;
    part.cy = part.sumY / part.area;
    delete part.sumX;
    delete part.sumY;
    parts.push(part);
  }
  return { labels, parts };
}

/**
 * Which region is the fighter.
 *
 * The largest, discounted by how far it is from the middle: a fighter fills the
 * centre of their own photograph, and the friend in a selfie is the one leaning
 * in from the edge. Centrality is weighted heavily because the failure it guards
 * against is the dark-bar one: the fighter's body lost, leaving a head, and the
 * friend in a lighter shirt kept whole at the edge — the bigger region, and the
 * wrong person.
 */
export function mainPart(parts, width) {
  let best = null;
  let bestScore = -1;
  for (const part of parts) {
    const offCentre = Math.abs(part.cx - width / 2) / (width / 2);
    const score = part.area * (1 - 0.85 * Math.min(1, offCentre));
    if (score > bestScore) {
      bestScore = score;
      best = part;
    }
  }
  return best;
}

/**
 * Keeps the fighter and nobody else.
 *
 * Every separate region is one of three things. A speck — a strand of fairy
 * lights, a corner of a poster — goes. A region the size of a person goes, and
 * is counted, because it is somebody else and they did not ask to be in a fight
 * video. Anything in between is kept where it sits inside the fighter's own
 * outline — a hand the model detached at the wrist — and dropped otherwise.
 *
 * It cannot separate two people who are touching; a mask has no way to say
 * where one shoulder ends and the next begins. `secondHead` looks for that, and
 * the verdict says so rather than this guessing at a cut.
 */
export function isolateSubject(alpha, width, height) {
  const { labels, parts } = components(alpha, width, height);
  const out = new Uint8Array(alpha.length);
  if (!parts.length) return { alpha: out, dropped: 0, subject: null };

  const frame = width * height;
  const subject = mainPart(parts, width);
  const keep = new Set([subject.label]);
  let dropped = 0;
  for (const part of parts) {
    if (part === subject) continue;
    const share = part.area / frame;
    if (share < SPECK) continue;
    if (share >= PERSON) {
      dropped += 1;
      continue;
    }
    const inside =
      part.cx >= subject.minX && part.cx <= subject.maxX && part.cy >= subject.minY && part.cy <= subject.maxY;
    if (inside) keep.add(part.label);
  }

  // The soft edge below PART_ALPHA belongs to whichever region it touches. It
  // is kept only within a couple of pixels of something kept, so a dropped
  // person does not leave their own faint outline behind.
  const kept = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i += 1) if (keep.has(labels[i])) kept[i] = 1;
  const near = dilate(kept, width, height, 2);
  for (let i = 0; i < alpha.length; i += 1) {
    if (kept[i] || (near[i] && !labels[i])) out[i] = alpha[i];
  }
  return { alpha: out, dropped, subject };
}

/** Binary dilation by a square of radius r, separable. */
export function dilate(bin, width, height, r) {
  const rows = new Uint8Array(bin.length);
  for (let y = 0; y < height; y += 1) {
    let last = -Infinity;
    // Two passes per row: distance to the nearest set pixel on either side.
    for (let x = 0; x < width; x += 1) {
      if (bin[y * width + x]) last = x;
      if (x - last <= r) rows[y * width + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (bin[y * width + x]) last = x;
      if (last - x <= r) rows[y * width + x] = 1;
    }
  }
  const out = new Uint8Array(bin.length);
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (rows[y * width + x]) last = y;
      if (y - last <= r) out[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (rows[y * width + x]) last = y;
      if (last - y <= r) out[y * width + x] = 1;
    }
  }
  return out;
}

/** Binary erosion by a square of radius r: the dilation of what is outside. */
export function erode(bin, width, height, r) {
  const outside = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) outside[i] = bin[i] ? 0 : 1;
  const grown = dilate(outside, width, height, r);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = grown[i] ? 0 : 1;
  return out;
}

/** Solid pixels per row, and where the solid shape starts and stops. */
function rowProfile(alpha, width, height) {
  const count = new Int32Array(height);
  const sumX = new Float64Array(height);
  let minY = -1;
  let maxY = -1;
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] >= SOLID_ALPHA) {
        count[y] += 1;
        sumX[y] += x;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (count[y]) {
      if (minY < 0) minY = y;
      maxY = y;
    }
  }
  return { count, sumX, minY, maxY, minX, maxX };
}

/**
 * How wide the head is: the widest solid row in the top slice of the shape.
 *
 * A slice of the frame rather than of the shape, so the answer is a forehead
 * whether the photograph is a close selfie or a fighter from the waist up — a
 * fraction of the shape's own height reaches the shoulders on the second.
 */
function headWidthOf(profile, height) {
  let headWidth = 0;
  const end = Math.min(profile.maxY, profile.minY + Math.round(height * 0.12));
  for (let y = profile.minY; y <= end; y += 1) headWidth = Math.max(headWidth, profile.count[y]);
  return headWidth;
}

/**
 * The head, where a mask is a head and nothing under it.
 *
 * Four things together: the solid shape stops well above the bottom of the
 * frame, it is roughly as tall as it is wide (a head and a neck, not a person
 * standing a long way off), it is big enough to be the subject of a portrait,
 * and its lowest rows are narrower than its widest (a chin, not a waistband).
 * The photograph clearly carries on below — it is a portrait, and the fighter
 * did not send a picture that ends at their chin — so the gap is the model
 * losing a dark body against a dark room.
 */
export function headOnly(alpha, width, height) {
  const profile = rowProfile(alpha, width, height);
  const { count, sumX, minY, maxY } = profile;
  if (minY < 0) return null;

  const below = (height - 1 - maxY) / height;
  if (below < 0.18) return null;

  let headWidth = 0;
  const upperEnd = minY + Math.round((maxY - minY) * 0.75);
  for (let y = minY; y <= upperEnd; y += 1) if (count[y] > headWidth) headWidth = count[y];
  if (headWidth < width * 0.12) return null;

  const tall = (maxY - minY + 1) / headWidth;
  if (tall < 0.8 || tall > 2.1) return null;

  const tail = Math.max(1, Math.round(headWidth * 0.08));
  let tailWidth = 0;
  for (let y = maxY - tail + 1; y <= maxY; y += 1) tailWidth = Math.max(tailWidth, count[y]);
  if (tailWidth > headWidth * 0.85) return null;

  // The neck is centred on the lower face rather than on the whole head, so a
  // head tipped to one side still gets shoulders under its chin.
  let sum = 0;
  let n = 0;
  const from = Math.max(minY, maxY - Math.round(headWidth * 0.6));
  for (let y = from; y <= maxY; y += 1) {
    sum += sumX[y];
    n += count[y];
  }
  return { top: minY, chin: maxY, centre: n ? sum / n : width / 2, headWidth, neckWidth: tailWidth };
}

/**
 * Half the width of the rebuilt torso at `t` head-widths below where the model
 * stopped, for a neck of half-width `neck` (also in head-widths).
 *
 * The model stops where the dark T-shirt starts, which is the collar rather
 * than the chin, so the shoulders come out almost at once: a short neck, a
 * slope out to about two and a half heads across, and a chest that widens a
 * little to the bottom of the frame. Proportions taken off the curated cutouts.
 */
export function torsoHalfWidth(t, neck = 0.3) {
  if (t < -0.3) return 0;
  if (t < 0.02) return neck;
  if (t < 0.45) {
    const u = (t - 0.02) / 0.43;
    return neck + (1.3 - neck) * (1 - (1 - u) * (1 - u));
  }
  return Math.min(1.6, 1.3 + 0.2 * (t - 0.45));
}

/**
 * Draws shoulders and a torso under a head the model left floating.
 *
 * An alpha shape only: the pixels under it are the fighter's own photograph, so
 * what shows through is their own T-shirt in their own light. It is combined
 * with what the model returned by taking the larger alpha, so a body the model
 * half-kept stays exactly as it was, and the edges are feathered rather than
 * cut, because a hard edge on a shape this approximate is what gives it away.
 */
export function rebuildTorso(alpha, width, height, head = headOnly(alpha, width, height)) {
  if (!head) return { alpha, rebuilt: false, head: null };
  const out = new Uint8Array(alpha);
  const { chin, centre, headWidth } = head;
  // The neck is the width the model left at the bottom of the stub, within
  // reason, so the join does not step in or out.
  const neck = clamp((head.neckWidth ?? headWidth * 0.6) / headWidth / 2, 0.24, 0.42);
  const feather = Math.max(2, headWidth * 0.04);
  const start = Math.max(0, Math.floor(chin - headWidth * 0.3));
  for (let y = start; y < height; y += 1) {
    const t = (y - chin) / headWidth;
    const half = torsoHalfWidth(t, neck) * headWidth;
    if (!half) continue;
    // Faded in over the stub, so the neck grows out of what the model kept
    // rather than being stuck to it.
    const fadeIn = clamp((t + 0.3) / 0.15, 0, 1);
    for (let x = 0; x < width; x += 1) {
      const edge = clamp((half - Math.abs(x - centre)) / feather + 0.5, 0, 1);
      const value = Math.round(255 * edge * fadeIn);
      const at = y * width + x;
      if (value > out[at]) out[at] = value;
    }
  }
  return { alpha: out, rebuilt: true, head };
}

/**
 * Makes a body the model returned half transparent solid again.
 *
 * The other way a black T-shirt goes wrong: rather than losing it, the model
 * keeps it at half strength, and the backdrop shows through the fighter's chest.
 * Below the head, where most of what the model kept is faint, everything it
 * kept at all is made solid except a feathered rim, so the outline is still the
 * model's and only the transparency is undone. Above the chin nothing changes:
 * that is hair, and hair is meant to be soft.
 */
export function firmBody(alpha, width, height) {
  const profile = rowProfile(alpha, width, height);
  if (profile.minY < 0) return { alpha, firmed: false };
  const headWidth = headWidthOf(profile, height);
  const from = Math.min(height, profile.minY + Math.round(headWidth * 1.3));

  let faint = 0;
  let kept = 0;
  for (let i = from * width; i < alpha.length; i += 1) {
    if (alpha[i] >= PART_ALPHA) {
      kept += 1;
      if (alpha[i] < 200) faint += 1;
    }
  }
  if (kept < width * height * 0.03 || faint / kept < 0.35) return { alpha, firmed: false };

  // Closed first, so the pinholes the model leaves in a faint region are part
  // of the body rather than islands of backdrop in the middle of a chest.
  const shape = new Uint8Array(alpha.length);
  for (let i = from * width; i < alpha.length; i += 1) if (alpha[i] >= PART_ALPHA) shape[i] = 1;
  const gap = Math.max(2, Math.round(headWidth * 0.04));
  const closed = erode(dilate(shape, width, height, gap), width, height, gap);
  // A pixel more than `rim` inside the closed shape is interior and made solid;
  // the rim keeps the model's own soft edge.
  const rim = Math.max(2, Math.round(headWidth * 0.03));
  const interior = erode(closed, width, height, rim);
  const out = new Uint8Array(alpha);
  for (let i = from * width; i < alpha.length; i += 1) {
    if (interior[i]) out[i] = 255;
    else if (closed[i] && out[i] < 220) out[i] = 220;
  }
  return { alpha: out, firmed: true };
}

/**
 * Whether the top edge of the shape has a second head on it.
 *
 * Two people touching are one region, so `isolateSubject` cannot see them. Their
 * outline can: a head, a dip to the shoulder, then a second rise to roughly the
 * same height and roughly a head across. A fist held up in a guard rises too,
 * which is why the second rise has to come within a third of a head of the
 * first summit and be most of a head wide — a glove at the cheek is neither.
 * This only ever makes a verdict, never a cut: a straight line between two
 * people who are leaning on each other is a worse picture than the photograph.
 */
export function secondHead(alpha, width, height) {
  const top = new Float64Array(width);
  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height && alpha[y * width + x] < SOLID_ALPHA) y += 1;
    top[x] = y;
  }
  let summit = height;
  let peak = -1;
  for (let x = 0; x < width; x += 1) {
    if (top[x] < summit || (top[x] === summit && Math.abs(x - width / 2) < Math.abs(peak - width / 2))) {
      summit = top[x];
      peak = x;
    }
  }
  if (peak < 0 || summit >= height) return false;

  // Head width at forehead depth, measured as the solid run through the peak.
  const row = Math.min(height - 1, summit + Math.round(height * 0.08));
  let left = peak;
  let right = peak;
  while (left > 0 && alpha[row * width + left - 1] >= SOLID_ALPHA) left -= 1;
  while (right < width - 1 && alpha[row * width + right + 1] >= SOLID_ALPHA) right += 1;
  const headWidth = right - left + 1;
  if (headWidth < width * 0.05) return false;

  const look = (step) => {
    let valley = summit;
    for (let x = peak + step; x >= 0 && x < width; x += step) {
      valley = Math.max(valley, top[x]);
      const deepEnough = valley - summit >= headWidth * 0.6;
      const risen = top[x] <= summit + headWidth * 0.33 && valley - top[x] >= headWidth * 0.35;
      if (deepEnough && risen) {
        // Most of a head across, measured a third of a head below its own top.
        const y = Math.min(height - 1, Math.round(top[x] + headWidth * 0.33));
        let a = x;
        let b = x;
        while (a > 0 && alpha[y * width + a - 1] >= SOLID_ALPHA) a -= 1;
        while (b < width - 1 && alpha[y * width + b + 1] >= SOLID_ALPHA) b += 1;
        if (b - a + 1 >= headWidth * 0.6) return true;
      }
    }
    return false;
  };
  return look(1) || look(-1);
}

// ------------------------------------------------------------------- verdict

/** What `assessCutout` can say. The strings are stored; lib/photo-quality.ts reads them. */
export const QUALITY_REASONS = [
  "multiple-people",
  "head-only",
  "tiny-subject",
  "very-dark",
  "dark",
  "cut-off",
  "faint-body",
];

/**
 * Whether a cutout is worth showing, and why not.
 *
 * Three answers. "ok" is a cutout nothing had to be done to. "repaired" is one
 * these steps changed — lifted, somebody else taken out, shoulders drawn in —
 * and is used, because each repair is something a person did by hand to the
 * first real photographs and was happy with. "poor" is one that should not go in
 * a video at all, and lib/portrait.ts shows the photograph instead: a subject
 * too small to read, a head cut off by the top of the frame or crowded by its
 * side, a second person the mask could not separate, or a photograph so dark
 * that whatever came out is mostly guesswork.
 *
 * Reasons are kept with both, so the dashboard can say what could be better and
 * the fighter is never told something vaguer than the truth.
 */
export function assessCutout({
  alpha,
  width,
  height,
  luma,
  isolated = 0,
  rebuilt = false,
  firmed = false,
  lifted = false,
  twoHeads = false,
}) {
  const reasons = new Set();
  let poor = false;
  let repaired = false;

  if (isolated > 0 || twoHeads) {
    reasons.add("multiple-people");
    if (twoHeads) poor = true;
    else repaired = true;
  }
  if (rebuilt) {
    reasons.add("head-only");
    repaired = true;
  }
  if (firmed) {
    reasons.add("faint-body");
    repaired = true;
  }
  if (Number.isFinite(luma?.mean) && luma.mean < VERY_DARK_MEAN) {
    reasons.add("very-dark");
    poor = true;
  } else if (lifted) {
    reasons.add("dark");
    repaired = true;
  }

  const profile = rowProfile(alpha, width, height);
  if (profile.minY < 0) {
    reasons.add("tiny-subject");
    return { verdict: "poor", reasons: [...reasons] };
  }
  let solid = 0;
  for (const c of profile.count) solid += c;
  const tall = (profile.maxY - profile.minY + 1) / height;
  if (solid / (width * height) < 0.05 || tall < 0.3) {
    reasons.add("tiny-subject");
    poor = true;
  }

  // The head band: from the top of the shape down about one head. A head
  // touching the top of the frame, or the side of it, is a head with a straight
  // edge through it in the video. Shoulders touching the sides are ordinary.
  const headWidth = headWidthOf(profile, height);
  const bandEnd = Math.min(height - 1, profile.minY + Math.round(headWidth));
  let topRun = 0;
  for (let x = 0; x < width; x += 1) if (alpha[x] >= SOLID_ALPHA) topRun += 1;
  let sideRows = 0;
  for (let y = profile.minY; y <= bandEnd; y += 1) {
    if (alpha[y * width] >= SOLID_ALPHA || alpha[y * width + width - 1] >= SOLID_ALPHA) sideRows += 1;
  }
  if (topRun >= Math.max(3, headWidth * 0.25) || sideRows >= Math.max(3, (bandEnd - profile.minY + 1) * 0.25)) {
    reasons.add("cut-off");
    poor = true;
  }

  return { verdict: poor ? "poor" : repaired ? "repaired" : "ok", reasons: [...reasons] };
}

/**
 * Every mask step in order, on one cutout's alpha.
 *
 * Isolate first, so shoulders are never drawn under somebody else's head; then
 * look for a second person the isolation could not separate; then rebuild a
 * torso if what is left is a head, or firm up one the model kept faintly; then
 * judge the result.
 */
export function repairMask({ alpha, width, height, luma, lifted = false }) {
  const isolated = isolateSubject(alpha, width, height);
  const twoHeads = secondHead(isolated.alpha, width, height);
  const torso = twoHeads ? { alpha: isolated.alpha, rebuilt: false } : rebuildTorso(isolated.alpha, width, height);
  // A torso just drawn is solid already; one the model kept faintly is firmed.
  const body = torso.rebuilt ? { alpha: torso.alpha, firmed: false } : firmBody(torso.alpha, width, height);
  const quality = assessCutout({
    alpha: body.alpha,
    width,
    height,
    luma,
    isolated: isolated.dropped,
    rebuilt: torso.rebuilt,
    firmed: body.firmed,
    lifted,
    twoHeads,
  });
  return { alpha: body.alpha, ...quality };
}
