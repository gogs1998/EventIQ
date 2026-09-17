/**
 * Renders one of the show-level videos to a vertical mp4, with a poster frame.
 *
 *   node scripts/render-show.mjs --slug cage-county-12 --template countdown
 *   npm run render:show -- --slug cage-county-12 --template card --base http://localhost:3502
 *
 * Local only: no --remote and no --publish. A bout's video is something the
 * programme plays, so it is claimed, fingerprinted and put in the bucket
 * (scripts/render-tape.mjs, HANDOVER section 11). These three are something a
 * promoter posts on their own feed and nothing on the site reads them, so there
 * is nothing to claim and no reason to hand this script a credential that can
 * write to a live show.
 *
 * Needs the app running at --base, and RENDER_KEY, which is what the capture
 * page takes instead of a promoter session.
 *
 * **The same-origin rule, the Chrome flags, the frame loop and the ffmpeg
 * arguments are duplicated from scripts/render-tape.mjs**, not imported. That
 * file reads its base, its slug and its environment from process.argv at module
 * scope, so importing it to borrow four functions puts this script's command
 * line in charge of that one's state — and it is being extended on another
 * branch besides. The cost is an encode change having to be made twice.
 * chrome.mjs and dev-vars.mjs are shared, because they already were.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { chromeOrThrow } from "./chrome.mjs";
import { devVars } from "./dev-vars.mjs";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

/** Duplicated from RENDER_KEY_HEADER in lib/auth.ts, which is not importable here. */
const RENDER_KEY_HEADER = "x-eventiq-render-key";
const renderKey = process.env.RENDER_KEY || devVars().RENDER_KEY;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const slug = arg("slug");
const template = arg("template");
// This worktree's dev server rather than 3000: two agents share the machine, and
// the second to start silently picks a port nobody passed to --base.
const base = arg("base", "http://localhost:3502");
const quality = Number(arg("quality", 92));

function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${err.trim()}`)),
    );
  });
}

/** Both binaries before anything slow happens, named as the thing that is absent. */
async function preflight() {
  const chrome = chromeOrThrow("No Chrome found, and every frame is a screenshot of one.");
  try {
    await run("ffmpeg", ["-version"]);
  } catch {
    throw new Error("ffmpeg is not on PATH, and every frame goes through it.");
  }
  return chrome;
}

/**
 * The boundary the render key may cross. Origin rather than a prefix match on
 * the base, because `https://eventiq.win` is a prefix of
 * `https://eventiq.win.example.com`, and the same host over http is somewhere a
 * shared secret must not go in the clear.
 */
export function sameOrigin(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/** Names the first broken source, because the operator's next move is to curl it. */
export function brokenImageMessage(broken) {
  const [first, ...rest] = broken;
  const others = rest.length ? ` (and ${rest.length} other image${rest.length === 1 ? "" : "s"})` : "";
  return (
    `The capture page could not load ${first}${others}, so this video would render ` +
    "with a hole in it. Nothing was captured."
  );
}

async function withPage(fn) {
  if (!renderKey) {
    throw new Error(
      "RENDER_KEY is not set, so the capture page will refuse this render.\n" +
        "  Add RENDER_KEY to .dev.vars, the same file the dev server reads.",
    );
  }

  const browser = await puppeteer.launch({
    executablePath: await preflight(),
    headless: true,
    // Deterministic output matters more than GPU acceleration here.
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--disable-lcd-text",
      "--font-render-hinting=none",
    ],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    // Every same-origin request and nothing else: /media asks the same question
    // the capture page does, so the portraits need the key too, and a backdrop
    // hosted on somebody else's server must never see it.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void request.continue(
        sameOrigin(request.url(), base)
          ? { headers: { ...request.headers(), [RENDER_KEY_HEADER]: renderKey } }
          : {},
      );
    });
    page.on("pageerror", (err) => console.error("  page error:", err.message));
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/** A refused key, an unknown show and an unknown template all answer 404 by design. */
async function open(page) {
  const url = `${base}/render/${slug}/show/${template}`;
  const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });
  if (response && !response.ok()) {
    throw new Error(
      `${url} answered ${response.status()}. Check the show, the template id, and ` +
        "that this script's RENDER_KEY matches the server's.",
    );
  }
  await page.waitForFunction(() => window.__ready === true, { timeout: 120_000 });
  const broken = await page.evaluate(() => window.__checkImages?.() ?? []);
  if (broken.length) throw new Error(brokenImageMessage(broken));
  return page.evaluate(() => window.__duration ?? 480);
}

/**
 * Commits the frame and waits for it to be painted. Every image is decoded
 * rather than two animation frames being waited out, because a portrait does not
 * enter the document until the row it is on comes into view — and a decode that
 * fails is a missing picture rather than something to swallow.
 */
async function seek(page, frame) {
  const broken = await page.evaluate(async (f) => {
    window.__setFrame(f);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const failed = [];
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.decode().catch(() => {
          // Aborted by the frame moving on is not a missing picture; still in
          // the document and refusing to decode is.
          if (img.isConnected) failed.push(img.currentSrc || img.src);
        }),
      ),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__checkImages?.(failed) ?? failed;
  }, frame);

  if (broken.length) throw new Error(brokenImageMessage(broken));
}

async function render(out) {
  await mkdir(path.dirname(out), { recursive: true });

  const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
    // Chrome paints sRGB and an untagged HD mp4 leaves every player guessing at
    // Rec. 709. Both spellings, because ffmpeg's own flags reach the bitstream
    // as the matrix and nothing else; the x264 parameters write all three.
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709",
    "-movflags", "+faststart",
    out,
  ]);
  ffmpeg.stderr.on("data", (d) => process.stderr.write(d));

  const done = new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ffmpeg.on("error", reject);
  });

  const started = Date.now();
  let frames = 0;
  try {
    await withPage(async (page) => {
      frames = await open(page);
      process.stdout.write(`${template}: ${frames} frames `);
      for (let frame = 0; frame < frames; frame += 1) {
        await seek(page, frame);
        const shot = await page.screenshot({ type: "jpeg", quality, optimizeForSpeed: true });
        if (!ffmpeg.stdin.write(shot)) {
          await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
        }
        if (frame % 60 === 0) process.stdout.write(".");
      }
    });
  } catch (error) {
    // Node will not exit while a child holds an open pipe, so a capture that
    // threw used to hang with no output — which reads as a slow render rather
    // than as a failure that has already happened.
    ffmpeg.stdin.destroy();
    ffmpeg.kill();
    throw error;
  }

  ffmpeg.stdin.end();
  await done;
  console.log(` ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return frames;
}

/**
 * A still from the middle of the finished video, beside it. Platforms pick their
 * own thumbnail and usually pick the first frame, which on all three of these is
 * a fade up from black; the midpoint is the one moment every template is fully
 * assembled.
 */
async function poster(out, frames) {
  const file = out.replace(/\.mp4$/i, ".jpg");
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", String(frames / FPS / 2),
    "-i", out, "-frames:v", "1", "-q:v", "2", file,
  ]);
  console.log(`  ${file}`);
}

async function main() {
  if (!slug || slug === true || !template || template === true) {
    console.error(
      "Pass --slug <event-slug> and --template <countdown|card|doors>.\n" +
        "  --base <url>   the running app, default http://localhost:3502\n" +
        "  --out <file>   where the mp4 goes, default .renders/<slug>-<template>.mp4\n" +
        "A poster frame is written beside the mp4 as .jpg.",
    );
    return 1;
  }

  const outArg = arg("out");
  const out = outArg && outArg !== true ? outArg : path.join(".renders", `${slug}-${template}.mp4`);
  await poster(out, await render(out));
  return 0;
}

// Only when run directly, so a test can import the pure parts. Through
// pathToFileURL because a Windows path is not a file URL, and comparing the two
// as strings silently never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
