/**
 * Renders a bout's tale of the tape to a vertical mp4.
 *
 *   node scripts/render-tape.mjs --bout 15
 *   node scripts/render-tape.mjs --all
 *   node scripts/render-tape.mjs --bout 15 --still 300
 *
 * Needs the app running (npm run dev, or a static build served) at --base.
 *
 * How it works: headless Chrome opens the capture page once, then the frame is
 * driven through window.__setFrame and the viewport screenshotted per frame.
 * Because the composition is a pure function of that frame number, the result is
 * deterministic; the frames stream straight into ffmpeg rather than piling up on
 * disk.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(Boolean);

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const base = arg("base", "http://localhost:3000");
const outDir = arg("out", "public/renders");
const quality = Number(arg("quality", 92));

async function withPage(fn) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      // Deterministic output matters more than GPU acceleration here.
      "--disable-lcd-text",
      "--font-render-hinting=none",
    ],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.error("  page error:", err.message));
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function openBout(page, bout) {
  await page.goto(`${base}/render/${bout}`, { waitUntil: "networkidle0", timeout: 120_000 });
  await page.waitForFunction(() => window.__ready === true, { timeout: 120_000 });
  return page.evaluate(() => window.__duration ?? 480);
}

/** Commits the frame and waits for it to be painted before we capture it. */
async function seek(page, frame) {
  await page.evaluate(
    (f) =>
      new Promise((resolve) => {
        window.__setFrame(f);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    frame,
  );
}

async function renderStill(bout, frame) {
  await mkdir(".stills", { recursive: true });
  const file = path.join(".stills", `bout-${bout}-frame-${frame}.png`);
  await withPage(async (page) => {
    await openBout(page, bout);
    await seek(page, frame);
    await page.screenshot({ path: file, type: "png" });
  });
  console.log(file);
}

async function renderBout(bout) {
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `bout-${bout}.mp4`);

  const ffmpeg = spawn("ffmpeg", [
    "-y",
    "-loglevel", "error",
    "-f", "image2pipe",
    "-framerate", String(FPS),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "slow",
    // 28 is visually indistinguishable from 20 on this material and a third of
    // the size, which matters when these get sent around on phones.
    "-crf", "28",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    out,
  ]);
  ffmpeg.stderr.on("data", (d) => process.stderr.write(d));

  const done = new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
    ffmpeg.on("error", reject);
  });

  const started = Date.now();
  await withPage(async (page) => {
    const duration = await openBout(page, bout);
    process.stdout.write(`bout ${bout}: ${duration} frames `);

    for (let frame = 0; frame < duration; frame += 1) {
      await seek(page, frame);
      const shot = await page.screenshot({ type: "jpeg", quality, optimizeForSpeed: true });
      if (!ffmpeg.stdin.write(shot)) {
        await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
      }
      if (frame % 60 === 0) process.stdout.write(".");
    }
  });

  ffmpeg.stdin.end();
  await done;
  console.log(` ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const still = arg("still");
const boutArg = arg("bout");

if (still && boutArg) {
  await renderStill(Number(boutArg), Number(still));
} else if (arg("all")) {
  const { event } = await import("../data/event.ts");
  for (const bout of event.bouts) await renderBout(bout.number);
} else if (boutArg) {
  await renderBout(Number(boutArg));
} else {
  console.error("Pass --bout <n>, --all, or --bout <n> --still <frame>");
  process.exit(1);
}
