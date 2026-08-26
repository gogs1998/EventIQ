/**
 * Turns raw generated art in assets-src/ into the optimised files the app ships.
 *
 *   node scripts/prepare-assets.mjs
 *
 * Fighter portraits get a second pass through background removal to produce a
 * transparent cutout, which is what lets the tale-of-the-tape sequence move the
 * fighter independently of the backdrop. Only the optimised output is committed;
 * assets-src/ is disposable.
 */
import { removeBackground } from "@imgly/background-removal-node";
import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const SRC = "assets-src";
const OUT = "public";
const TMP = ".asset-tmp";

async function encode(input, output, { width, height, alpha, quality }) {
  const fit = height
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
    : `scale=${width}:-1`;
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `${fit},format=${alpha ? "yuva420p" : "yuv420p"}`,
    "-c:v",
    "libwebp",
    "-q:v",
    String(quality),
    "-compression_level",
    "6",
    output,
  ]);
}

/** White-on-black generated marks become white-on-transparent so they can sit on any surface. */
async function keyOutBlack(input, output, size) {
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `scale=${size}:${size},colorkey=0x000000:0.30:0.12,format=yuva420p`,
    "-c:v",
    "libwebp",
    "-q:v",
    "90",
    output,
  ]);
}

async function main() {
  await mkdir(TMP, { recursive: true });
  for (const dir of ["fighters", "sponsors", "venue"]) {
    await mkdir(path.join(OUT, dir), { recursive: true });
  }

  const files = await readdir(SRC);

  for (const file of files.filter((f) => f.startsWith("fighter-"))) {
    const slug = file.replace(/^fighter-/, "").replace(/\.png$/, "");
    const src = path.join(SRC, file);

    await encode(src, path.join(OUT, "fighters", `${slug}.webp`), {
      width: 900,
      height: 1200,
      quality: 82,
    });

    // The cutout is the expensive step, so it is worth the wait: it is what makes
    // the video read as 2.5D rather than a photo sliding around.
    const blob = await removeBackground(src, {
      output: { format: "image/png", quality: 0.95 },
    });
    const cutPng = path.join(TMP, `${slug}-cutout.png`);
    await writeFile(cutPng, Buffer.from(await blob.arrayBuffer()));
    await encode(cutPng, path.join(OUT, "fighters", `${slug}-cutout.webp`), {
      width: 1000,
      alpha: true,
      quality: 88,
    });

    console.log(`fighter  ${slug}`);
  }

  for (const file of files.filter(
    (f) => f.startsWith("sponsor-mark-") || f.startsWith("promoter-mark-"),
  )) {
    const name = file.replace(/\.png$/, "");
    await keyOutBlack(path.join(SRC, file), path.join(OUT, "sponsors", `${name}.webp`), 320);
    console.log(`mark     ${name}`);
  }

  for (const file of files.filter((f) => f.startsWith("venue-"))) {
    const name = file.replace(/\.png$/, "");
    await encode(path.join(SRC, file), path.join(OUT, "venue", `${name}.webp`), {
      width: 1920,
      quality: 72,
    });
    console.log(`venue    ${name}`);
  }
}

await main();
