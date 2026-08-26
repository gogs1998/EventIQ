/**
 * Captures the product screenshots used in the gallery on the pitch page.
 *
 *   node scripts/shots.mjs                    # all shots -> public/screens
 *   node scripts/shots.mjs --only promoter    # one shot
 *   node scripts/shots.mjs --review /promoter --width 390   # full page PNG for eyeballing
 *
 * These are real captures of the running app rather than mockups, so a promoter
 * looking at the gallery is looking at the thing they would get. PNGs land in
 * .stills/ (gitignored) and only the WebP is committed, same principle as the
 * artwork pipeline.
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const run = promisify(execFile);

const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";
const TMP = ".stills/shots";
const OUT = "public/screens";

/** Phone width, because that is where a spectator reads the programme. */
const WIDTH = 390;
const HEIGHT = 844;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Each shot is a route plus an optional in-page action. Height is in CSS
 * pixels; taller than the viewport is fine because we clip rather than
 * screenshotting the full page, which keeps the aspect ratio predictable.
 */
const SHOTS = [
  {
    name: "programme",
    path: "/e/cage-county-12",
    height: 1180,
    caption: "The running order",
    alt: "The Cage County 12 running order on a phone, main event first",
  },
  {
    name: "tape",
    path: "/e/cage-county-12",
    height: 1180,
    caption: "The tale of the tape",
    alt: "An expanded bout showing the tale of the tape side by side",
    async act(page) {
      await clickText(page, "Tale of the tape");
      await sleep(900);
      // Frame on the contested rows rather than the top of the bout, since the
      // side-by-side comparison is the thing worth showing.
      await scrollToText(page, "Record", 300);
    },
  },
  {
    name: "fighter",
    path: "/e/cage-county-12/f/callum-reeves",
    height: 1180,
    caption: "A fighter's profile",
    alt: "Callum Reeves' fighter profile with his record, gym and sponsors",
  },
  {
    name: "questionnaire",
    path: "/f/demo",
    height: 1180,
    caption: "What the fighter fills in",
    alt: "The fighter's questionnaire with their card building live above it",
    async act(page) {
      // An empty card is honest but it is not the thing being sold. Fill in the
      // two fields that change the picture, exactly as the sales tour does.
      await clickText(page, "Use the one from the gym");
      await sleep(1400);
      await type(page, 'input[placeholder="The Welsh Dragon"]', "The Welsh Dragon");
      await sleep(900);
    },
  },
  {
    name: "promoter",
    path: "/promoter",
    height: 1180,
    caption: "The promoter's view",
    alt: "The promoter dashboard showing who still has to fill their profile in",
  },
];

async function clickText(page, text) {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((e) =>
      e.textContent?.includes(t),
    );
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`no clickable element containing "${text}"`);
}

async function scrollToText(page, text, offset = 80) {
  const ok = await page.evaluate(
    (t, off) => {
      const el = [...document.querySelectorAll("span,div,h2,h3")]
        .reverse()
        .find((e) => e.children.length === 0 && e.textContent?.trim() === t);
      if (!el) return false;
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - off);
      return true;
    },
    text,
    offset,
  );
  if (!ok) throw new Error(`no element with text "${text}"`);
  await sleep(400);
}

/** focus() rather than click(), which would scroll the field to the top. */
async function type(page, selector, text) {
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.focus({ preventScroll: true });
    return true;
  }, selector);
  if (!ok) throw new Error(`no field matching ${selector}`);
  await page.keyboard.type(text, { delay: 25 });
}

async function open(browser, { width, height }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  return page;
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // Entrance animations are one-shot, so wait them out rather than disabling
  // them: a half-played slam would look like a rendering fault in a still.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const done = document
          .getAnimations()
          .map((a) => a.finished.catch(() => {}));
        Promise.all(done).then(resolve);
        setTimeout(resolve, 2500);
      }),
  );
  await sleep(500);
}

async function toWebp(png, webp, width) {
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    png,
    "-vf",
    `scale=${width}:-1:flags=lanczos`,
    "-c:v",
    "libwebp",
    "-q:v",
    "76",
    "-compression_level",
    "6",
    webp,
  ]);
}

async function capture(browser, shot) {
  const height = shot.height ?? HEIGHT;
  const page = await open(browser, { width: WIDTH, height });
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle0" });
  await settle(page);
  if (shot.act) await shot.act(page);

  const png = path.join(TMP, `${shot.name}.png`);
  await page.screenshot({ path: png });
  await page.close();

  // Committed at 2x the CSS width: sharp on a retina screen, still tiny.
  await toWebp(png, path.join(OUT, `${shot.name}.webp`), WIDTH * 2);
  const { size } = await stat(path.join(OUT, `${shot.name}.webp`));
  console.log(`${shot.name.padEnd(14)} ${(size / 1024).toFixed(0)}KB`);
}

async function review(browser, route, width) {
  const page = await open(browser, { width, height: 1000 });
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0" });
  await settle(page);
  const name = `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}-${width}`;
  const out = path.join(".stills/review", `${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log(out);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };

  await mkdir(TMP, { recursive: true });
  await mkdir(".stills/review", { recursive: true });
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });

  try {
    const reviewRoute = flag("review");
    if (reviewRoute) {
      const widths = flag("width") ? [Number(flag("width"))] : [390, 1280];
      for (const w of widths) await review(browser, reviewRoute, w);
    } else {
      const only = flag("only");
      for (const shot of SHOTS) {
        if (only && shot.name !== only) continue;
        await capture(browser, shot);
      }
    }
  } finally {
    await browser.close();
  }

  if (!flag("review")) {
    const files = await readdir(OUT).catch(() => []);
    console.log(`${files.length} in ${OUT}`);
  }
}

await main();
