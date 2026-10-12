/**
 * The promo and the walkthrough, made from captures rather than from a screen
 * recording.
 *
 *   node scripts/demo.mjs capture  --base <staging> --password-file <path> --out <dir>
 *   node scripts/demo.mjs promo    --out <dir> [--dest <dir>]   # 1080x1920 reel, 4:5 cut, 1:1 cover
 *   node scripts/demo.mjs walkthrough --out <dir> [--dest <dir>] # the pitch page's recording
 *
 * Capture signs in as the promoter, walks the card on a 430x932 phone at 2x and
 * keeps each page as a still (tall ones as a strip to pan down), with the real
 * bounding box of everything a callout later points at. It also downloads the
 * bout videos the programme serves, so they go into the cut as their own frames
 * rather than as a recording of a <video> element, which headless Chrome plays
 * unreliably. Nothing is written to the card: the sheet is read for its preview
 * and then cleared, and the importer is shown, not pressed.
 *
 * Compose drives scripts/demo-stage.html one frame at a time. Every frame is a
 * pure function of its number, the same rule the tape composition lives by, so
 * motion is interpolated in JS and screenshotted rather than played and
 * recorded: a slow machine makes a slow render, never a juddering video.
 * HANDOVER section 17.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { chromeOrThrow } from "./chrome.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 ? process.argv[at + 1] : fallback;
}

const OUT = path.resolve(arg("out", ".stills/demo"));
const CAP = path.join(OUT, "cap");
const SLUG = arg("slug", "cage-county-12");
const PROMOTER = arg("promoter", "cage-county");

const PHONE = { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ffmpeg(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-y", ...args], {
      stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    if (input) input(child.stdin);
  });
}

async function launch(viewport) {
  return puppeteer.launch({
    executablePath: chromeOrThrow("No Chrome found, and the demo is captured in one."),
    headless: true,
    defaultViewport: viewport,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none"],
  });
}

/* ------------------------------------------------------------------ capture */

async function capture() {
  const base = arg("base");
  const passwordFile = arg("password-file");
  if (!base || !passwordFile) throw new Error("capture needs --base and --password-file");
  // Read here and typed straight into the field; never logged.
  const password = (await readFile(passwordFile, "utf8")).trim();
  await mkdir(CAP, { recursive: true });

  const manifest = { base, slug: SLUG, scale: PHONE.deviceScaleFactor, shots: {}, media: {} };
  const browser = await launch(PHONE);
  try {
    const page = await browser.newPage();

    const settle = async () => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))),
        );
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    };

    const goto = async (route) => {
      await page.goto(base + route, { waitUntil: "networkidle0" });
      // Every lazy image on the page loaded before anything is kept, or a strip
      // pans down into placeholders.
      await page.evaluate(async () => {
        document.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = "eager"));
      });
      await settle();
      await page.evaluate(() => window.scrollTo(0, 0));
    };

    /** Page-coordinate boxes, in CSS pixels, for whatever a callout will point at. */
    const boxes = (finders) =>
      page.evaluate((finders) => {
        const out = {};
        const byText = (sel, text) =>
          [...document.querySelectorAll(sel)].find((el) => el.textContent.trim().startsWith(text));
        for (const [name, [sel, text]] of Object.entries(finders)) {
          const el = text ? byText(sel, text) : document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          out[name] = { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height };
        }
        return out;
      }, finders);

    /** A strip of the page from `top` (CSS px), `height` tall, kept as one PNG. */
    const strip = async (name, { top = 0, height, finders = {} } = {}) => {
      await settle();
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      const h = Math.min(height ?? full - top, full - top, 7000);
      const file = path.join(CAP, `${name}.png`);
      await page.screenshot({
        path: file,
        clip: { x: 0, y: top, width: PHONE.width, height: h },
        captureBeyondViewport: true,
      });
      const found = await boxes(finders);
      for (const box of Object.values(found)) box.y -= top;
      manifest.shots[name] = { file: `${name}.png`, width: PHONE.width, height: h, boxes: found };
      console.log(`  ${name}  ${PHONE.width}x${h}  ${Object.keys(found).join(", ")}`);
      // The viewport goes back where it was: a tall clip scrolls the page.
      await page.evaluate(() => window.scrollTo(0, 0));
    };

    const clickText = async (selector, text) => {
      const ok = await page.evaluate(
        (sel, t) => {
          const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(t));
          if (!el) return false;
          el.click();
          return true;
        },
        selector,
        text,
      );
      if (!ok) throw new Error(`nothing matching ${selector} "${text}"`);
    };

    console.log("the room");
    await goto(`/e/${SLUG}/qr`);
    await strip("qr");
    // The code itself: the largest square thing on the page.
    manifest.shots.qr.boxes.qr = await page.evaluate(() => {
      const squares = [...document.querySelectorAll("svg,img,canvas")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 100 && Math.abs(r.width - r.height) < 4)
        .sort((a, b) => b.width - a.width);
      const r = squares[0];
      return r ? { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height } : null;
    });

    await goto(`/e/${SLUG}`);
    await strip("programme", { height: 4200, finders: { runningOrder: ["h2", "Running Order"] } });

    // The main event opened out. The first "Tale of the tape" on the card is
    // bout fifteen, because the card runs main event first.
    await clickText("button", "Main Event");
    await page.waitForSelector("video", { timeout: 15000 });
    await sleep(600);
    const tapeTop = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.trim().startsWith("Main Event"),
      );
      return Math.max(0, button.getBoundingClientRect().top + window.scrollY - 12);
    });
    await strip("tape", {
      top: tapeTop,
      height: 3000,
      finders: { video: ["video"], sponsor: ["div,span", "Bout sponsor"] },
    });
    manifest.media.tapeSrc = await page.evaluate(() =>
      document.querySelector("video")?.getAttribute("src")?.split("#")[0],
    );

    await goto(`/e/${SLUG}`);
    await strip("programme-top", { height: PHONE.height });

    console.log("the fighters");
    await goto(`/fighters/callum-reeves`);
    await strip("fighter", { finders: { previous: ["h2,span,div", "Previous shows"] } });
    // The heading alone is a sliver; the box worth ringing runs to the link under it.
    const prev = manifest.shots.fighter.boxes.previous;
    if (prev) {
      const end = await page.evaluate(() => {
        const a = [...document.querySelectorAll("a")].find((e) => /tale of the tape/i.test(e.textContent));
        if (!a) return null;
        const r = a.getBoundingClientRect();
        return r.bottom + window.scrollY;
      });
      if (end) {
        prev.h = end - prev.y;
        prev.x = 16;
        prev.w = PHONE.width - 32;
      }
    }

    await goto(`/shows`);
    await strip("shows", { height: PHONE.height, finders: { show: ["a", "Cage County Promotions"] } });

    console.log("the promoter");
    await goto(`/promoter/login`);
    await page.type('input[name="slug"]', PROMOTER, { delay: 0 });
    // The recording shows a password field with a fixed number of dots in it,
    // not one as long as the real password.
    await page.type('input[name="password"]', "xxxxxxxxxxxx", { delay: 0 });
    await strip("login", { height: PHONE.height, finders: { form: ["form"] } });
    await page.$eval('input[name="password"]', (el) => (el.value = ""));
    await page.type('input[name="password"]', password, { delay: 0 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click('button[type="submit"]'),
    ]);
    if (!page.url().includes("/promoter")) throw new Error("sign-in did not land on /promoter");

    await goto(`/promoter/e/${SLUG}`);
    await strip("dashboard", {
      height: 2600,
      finders: {
        send: ["a", "Send on WhatsApp"],
        chase: ["h2", "Who to chase"],
        stats: ["div", "Profiles finished"],
        gettingStarted: ["section,div", "Getting started"],
      },
    });
    // The first fighter on the chase list, from their name to their Send.
    const d = manifest.shots.dashboard.boxes;
    const firstRow = await page.evaluate(() => {
      const send = [...document.querySelectorAll("a")].find((a) => a.textContent.trim().startsWith("Send on WhatsApp"));
      let el = send;
      // Up to the row that holds both the name and the button.
      while (el && el.parentElement && el.getBoundingClientRect().height < 120) el = el.parentElement;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height };
    });
    d.firstRow = firstRow;

    const videosTop = await page.evaluate(() => {
      const h = [...document.querySelectorAll("h2")].find((e) => e.textContent.trim() === "Videos");
      return h ? h.getBoundingClientRect().top + window.scrollY - 24 : null;
    });
    if (videosTop !== null) {
      await strip("videos", {
        top: videosTop,
        height: 1500,
        finders: {
          current: ["span,div,p", "Current"],
          shared: ["span,div,p", "Not shared yet"],
          watch: ["a", "Watch"],
        },
      });
    }

    await goto(`/promoter/e/${SLUG}/card`);
    await page.evaluate(() => {
      const summary = [...document.querySelectorAll("summary")].find((s) =>
        s.textContent.includes("Paste the running order"),
      );
      const details = summary?.closest("details");
      if (details && !details.open) summary.click();
    });
    await page.waitForSelector("details[open] textarea");
    const SHEET = [
      "Neil McLay (Urban Guerrillas) v Declan Lowe (Crowning Glory) - MMA 80kg",
      "Jamie Rourke (Phoenix Muay Thai) v Tom Hadley (Anchor Muay Thai) - C Class Muay Thai 67kg",
      "Lucy Marsh (Rylands Gym) v Priya Sandhu (Aspire MMA) - Womens MMA 57kg",
    ].join("\n");
    // React ignores a value written straight onto the element, so it goes in
    // through the prototype setter and the event React listens for.
    await page.evaluate((text) => {
      const box = document.querySelector("details[open] textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }, SHEET);
    const sheetTop = await page.evaluate(() => {
      const s = [...document.querySelectorAll("summary")].find((e) => e.textContent.includes("Paste the running order"));
      return Math.max(0, s.getBoundingClientRect().top + window.scrollY - 16);
    });
    await strip("sheet-pasted", { top: sheetTop, height: 900, finders: { box: ["details[open] textarea"] } });
    await clickText("button", "Read the sheet");
    await page.waitForFunction(
      () => [...document.querySelectorAll("h3")].some((h) => h.textContent.includes("What the sheet says")),
      { timeout: 20000 },
    );
    await sleep(400);
    await strip("sheet-preview", {
      top: sheetTop,
      height: 2600,
      finders: { preview: ["h3", "What the sheet says"], add: ["button", "Add"] },
    });
    // Cleared again, so nothing about this capture is left on the card.
    await clickText("button", "Paste a different sheet");

    // The importer sits under each fighter in the bout rows.
    const importerTop = await page.evaluate(() => {
      const s = [...document.querySelectorAll("summary")].find((e) =>
        e.textContent.includes("Fill this in from a record page"),
      );
      if (!s) return null;
      s.click();
      return Math.max(0, s.getBoundingClientRect().top + window.scrollY - 360);
    });
    if (importerTop !== null) {
      await sleep(300);
      await strip("importer", {
        top: importerTop,
        height: PHONE.height,
        finders: { importer: ["details[open] summary", "Fill this in"] },
      });
    }
  } finally {
    await browser.close();
  }

  // The videos the programme serves, fetched the way a phone fetches them.
  const tapeUrl = new URL(manifest.media.tapeSrc ?? `/renders/bout-15.mp4`, base).href;
  for (const [name, url] of [
    ["tape-15", tapeUrl],
    ["tape-14", new URL(`/renders/bout-14.mp4`, base).href],
  ]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    await writeFile(path.join(CAP, `${name}.mp4`), Buffer.from(await res.arrayBuffer()));
    manifest.media[name] = `${name}.mp4`;
  }
  await writeFile(path.join(CAP, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`captured to ${CAP}`);
}

/* ------------------------------------------------------------------ compose */

/** Frames out of a bout video, at the cut's own rate, as JPEGs the stage can show. */
async function extract(name, from, seconds) {
  const dir = path.join(OUT, "frames", name);
  if (existsSync(path.join(dir, "done"))) return;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await ffmpeg([
    "-ss", String(from), "-t", String(seconds), "-i", path.join(CAP, `${name.split("@")[0]}.mp4`),
    "-vf", "fps=30", "-q:v", "3", path.join(dir, "%04d.jpg"),
  ]);
  await writeFile(path.join(dir, "done"), "");
}

async function compose(cut, { width, height, out, poster, posterAt = 0, stills, stillPath, srt }) {
  const manifest = JSON.parse(await readFile(path.join(CAP, "manifest.json"), "utf8"));
  for (const [name, from, seconds] of cut.clips) await extract(name, from, seconds);

  const browser = await launch({ width, height, deviceScaleFactor: 1 });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("stage:", e.message));
    const stage = pathToFileURL(path.join(here, "demo-stage.html")).href;
    await page.goto(`${stage}?cut=${cut.name}&w=${width}&h=${height}&root=${encodeURIComponent(pathToFileURL(OUT).href)}`, {
      waitUntil: "networkidle0",
    });
    await page.evaluate((m) => window.stage.load(m), manifest);
    const frames = await page.evaluate(() => window.stage.frames);
    if (srt) {
      const captions = await page.evaluate(() => window.stage.captions);
      const stamp = (f) => {
        const ms = Math.round((f / 30) * 1000);
        const p = (n, w = 2) => String(n).padStart(w, "0");
        return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
      };
      const body = captions
        .filter((c) => c.text)
        .map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`)
        .join("\n");
      await writeFile(srt, body);
      // Where each beat starts, for the chapter list beside the player.
      console.log(captions.filter((c) => c.text).map((c) => `  ${(c.from / 30).toFixed(1)}s  ${c.text}`).join("\n"));
    }
    console.log(`${cut.name} ${width}x${height}: ${frames} frames (${(frames / 30).toFixed(1)}s)`);

    if (stills) {
      for (const f of stills) {
        await page.evaluate((n) => window.stage.draw(n), f);
        await page.screenshot({ path: stillPath ?? path.join(OUT, `still-${cut.name}-${height}-${f}.jpg`), type: "jpeg", quality: 92 });
      }
      console.log(`stills in ${OUT}`);
      return;
    }

    const tmp = out.replace(/\.mp4$/, ".video.mp4");
    let stdin;
    const encoding = ffmpeg(
      [
        "-f", "image2pipe", "-framerate", "30", "-c:v", "mjpeg", "-i", "-",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-shortest",
        "-vf", `scale=${width}:${height}:out_color_matrix=bt709:flags=lanczos,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-profile:v", "high",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        "-c:a", "aac", "-b:a", "64k",
        "-movflags", "+faststart",
        tmp,
      ],
      { input: (s) => (stdin = s) },
    );
    for (let f = 0; f < frames; f++) {
      // Drawn, every image decoded, then two frames for the paint to land.
      await page.evaluate((n) => window.stage.draw(n), f);
      const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
      if (!stdin.write(jpg)) await new Promise((r) => stdin.once("drain", r));
      if (f === posterAt && poster) await writeFile(poster, jpg);
      if (f % 150 === 0) console.log(`  frame ${f}`);
    }
    stdin.end();
    await encoding;
    await rm(out, { force: true });
    await copyFile(tmp, out);
    await rm(tmp, { force: true });
  } finally {
    await browser.close();
  }
}

const PROMO = {
  name: "promo",
  clips: [
    ["tape-15@solo", 3.2, 3],
    ["tape-15@osei", 7.2, 1.2],
    ["tape-15@vs", 9.6, 1.7],
    ["tape-14", 9.4, 3.1],
  ],
};

const WALK = {
  name: "walk",
  clips: [
    ["tape-15@walk", 0, 5.8],
    ["tape-14@walk", 9.4, 4.4],
  ],
};

/** Single frames of a cut, for looking at before committing to an encode. */
const STILLS = arg("stills")?.split(",").map(Number);

async function promo() {
  const dest = path.resolve(arg("dest", OUT));
  if (STILLS) {
    await compose(PROMO, { width: 1080, height: Number(arg("height", 1920)), stills: STILLS });
    return;
  }
  await mkdir(dest, { recursive: true });
  if (arg("only") !== "cover") {
    await compose(PROMO, { width: 1080, height: 1920, out: path.join(dest, "eventiq-promo-ig.mp4") });
    await compose(PROMO, { width: 1080, height: 1350, out: path.join(dest, "eventiq-promo-feed.mp4") });
  }
  await compose({ ...PROMO, name: "cover" }, {
    width: 1080,
    height: 1080,
    stills: [0],
    stillPath: path.join(dest, "eventiq-promo-cover.jpg"),
  });
}

async function walkthrough() {
  const dest = path.resolve(arg("dest", OUT));
  if (STILLS) {
    await compose(WALK, { width: 1080, height: 1920, stills: STILLS });
    return;
  }
  await mkdir(dest, { recursive: true });
  await compose(WALK, {
    width: 1080,
    height: 1920,
    out: path.join(dest, "eventiq-demo.mp4"),
    poster: path.join(dest, "eventiq-demo-poster.jpg"),
    // The title card, settled: the first frame with nothing still moving.
    posterAt: 60,
    srt: path.join(dest, "eventiq-demo.srt"),
  });
}

const phase = process.argv[2];
if (phase === "capture") await capture();
else if (phase === "promo") await promo();
else if (phase === "walkthrough") await walkthrough();
else {
  console.error("Usage: node scripts/demo.mjs capture|promo|walkthrough [--out dir]");
  process.exit(1);
}
