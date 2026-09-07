/**
 * Six frames of one bout, checked against signatures committed to the
 * repository.
 *
 *   node scripts/golden-frames.mjs --base http://localhost:3105 --write
 *   node scripts/golden-frames.mjs --base http://localhost:3105
 *
 * What this catches is the thing the unit tests structurally cannot: the
 * composition is a pure function of a frame number and every test of it is a
 * test of the numbers going in, not of the picture coming out. A stray
 * transition, a font that stopped loading, a layer that now renders behind
 * another one — all of them leave the derivation layer green and the video
 * wrong, and the only person who finds out is whoever watches it.
 *
 * **The comparison is perceptual rather than exact, and that is not a
 * compromise made to get it passing.** Text rasterisation is not the same on two
 * operating systems: FreeType and DirectWrite hint the same glyph at the same
 * size to different pixels, so byte-identical frames across machines were never
 * available. Signatures generated on a laptop would fail on every CI run and the
 * check would be turned off within a week. Instead each frame is reduced to a
 * 32x32 grey thumbnail and compared by mean absolute difference, which is blind
 * to a glyph edge moving by a pixel and not at all blind to a scene that has
 * stopped drawing, a layer that has moved, or a colour that has changed.
 *
 * That means it will not catch a one-pixel regression. It is a smoke test for
 * the picture, and it is honest about being one.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openBout, seek, withPage } from "./render-tape.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(HERE, "goldens");

/**
 * One frame from each of the five scenes, plus one from a crossfade.
 *
 * The boundaries are in components/sequence/timeline.ts: billing 0–70, red
 * 62–178, blue 170–286, head to head 278–410, close 402–480. Frame 66 sits in
 * the overlap between the first two, which is where a scene that has stopped
 * drawing itself is most visible and least likely to be noticed by eye.
 */
export const GOLDEN_FRAMES = [20, 66, 120, 230, 340, 450];

/** 32x32 grey. Small enough to commit, large enough that a moved layer shows. */
const SIZE = 32;

/**
 * Mean absolute difference, out of 255, that two runs of the same frame may
 * differ by.
 *
 * Eight is roughly three per cent. Rasterisation differences between operating
 * systems land around one; a scene failing to draw lands in the tens.
 */
export const DEFAULT_TOLERANCE = 8;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

/** Mean absolute difference between two signatures, out of 255. */
export function meanAbsoluteDifference(a, b) {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

export function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

export function fromHex(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/** The 32x32 grey reduction of a PNG, as raw bytes. */
export function signature(png) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-v", "error",
      "-f", "image2pipe",
      "-i", "-",
      "-vf", `format=gray,scale=${SIZE}:${SIZE}:flags=area`,
      "-frames:v", "1",
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-",
    ]);
    const out = [];
    let err = "";
    ffmpeg.stdout.on("data", (chunk) => out.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => (err += chunk));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`));
      const bytes = Buffer.concat(out);
      if (bytes.length !== SIZE * SIZE) {
        return reject(new Error(`expected ${SIZE * SIZE} bytes of thumbnail, got ${bytes.length}`));
      }
      resolve(Uint8Array.from(bytes));
    });
    ffmpeg.stdin.end(png);
  });
}

export function goldenPath(slug, bout) {
  return path.join(GOLDEN_DIR, `${slug}-bout-${bout}.json`);
}

async function capture(slug, bout) {
  const frames = {};
  await withPage(async (page) => {
    await openBout(page, bout, slug);
    for (const frame of GOLDEN_FRAMES) {
      await seek(page, frame);
      frames[frame] = await signature(await page.screenshot({ type: "png" }));
    }
  });
  return frames;
}

async function main() {
  const slug = arg("slug", "cage-county-12");
  const bout = Number(arg("bout", 15));
  const tolerance = Number(arg("tolerance", DEFAULT_TOLERANCE));
  const file = goldenPath(slug, bout);

  const frames = await capture(slug, bout);

  if (arg("write")) {
    await mkdir(GOLDEN_DIR, { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify(
        {
          slug,
          bout,
          size: SIZE,
          note:
            "Grey thumbnails of six frames, compared by mean absolute difference. " +
            "Regenerate with: npm run golden-frames -- --base <url> --write",
          frames: Object.fromEntries(
            Object.entries(frames).map(([frame, bytes]) => [frame, toHex(bytes)]),
          ),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`wrote ${path.relative(process.cwd(), file)}`);
    return 0;
  }

  if (!existsSync(file)) {
    throw new Error(
      `No goldens for bout ${bout} of ${slug}.\n` +
        "  Generate them against a dev server on the seeded card:\n" +
        "  npm run golden-frames -- --base http://localhost:3105 --write",
    );
  }

  const golden = JSON.parse(await readFile(file, "utf8"));
  let worst = 0;
  let failed = 0;

  for (const frame of GOLDEN_FRAMES) {
    const expected = golden.frames?.[frame];
    if (!expected) {
      console.error(`  frame ${frame}: nothing committed for it`);
      failed += 1;
      continue;
    }
    const difference = meanAbsoluteDifference(frames[frame], fromHex(expected));
    worst = Math.max(worst, difference);
    const ok = difference <= tolerance;
    if (!ok) failed += 1;
    console.log(
      `  frame ${String(frame).padStart(3)}  ${difference.toFixed(2)} / ${tolerance}  ${ok ? "ok" : "DIFFERENT"}`,
    );
  }

  if (failed) {
    console.error(
      `\n${failed} of ${GOLDEN_FRAMES.length} frames no longer look like the committed ones.\n` +
        "If the composition was meant to change, look at one first —\n" +
        "  npm run render -- --slug " + slug + " --bout " + bout + " --still 120\n" +
        "— and then regenerate with --write.",
    );
    return 1;
  }

  console.log(`\nAll ${GOLDEN_FRAMES.length} frames match, worst ${worst.toFixed(2)} of ${tolerance}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
