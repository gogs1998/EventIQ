/**
 * Renders a bout's tale of the tape to a vertical mp4.
 *
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15
 *   node scripts/render-tape.mjs --slug cage-county-12 --stale --publish
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15 --still 300
 *
 * Needs the app running at --base (npm run dev, or `npm run preview`, or the
 * deployed site).
 *
 * This is the one part of EventIQ that cannot run on Cloudflare. Headless Chrome
 * and ffmpeg are both far outside what a Worker can do, so rendering is an
 * out-of-band job run by whoever operates the show, and the render_jobs table is
 * the whole interface between it and the app: this script writes the finished
 * key, the app reads it back.
 *
 * It talks to D1 and R2 through wrangler rather than through an API of our own.
 * Anyone who can run the renderer already holds the Cloudflare credentials, so a
 * write endpoint on the public site would be a new way in for no gain.
 *
 * How the capture works: headless Chrome opens the capture page once, then the
 * frame is driven through window.__setFrame and the viewport screenshotted per
 * frame. Because the composition is a pure function of that frame number the
 * result is deterministic, and the frames stream straight into ffmpeg rather
 * than piling up on disk.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(Boolean);

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DATABASE = "eventiq";
const BUCKET = "eventiq-media";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const base = arg("base", "http://localhost:3000");
const outDir = arg("out", ".renders");
const quality = Number(arg("quality", 92));
const slug = arg("slug");
const publish = Boolean(arg("publish"));
// Everything defaults to the local Miniflare bindings, so a mistyped command
// cannot overwrite a live show's video.
const remote = Boolean(arg("remote"));
const scope = remote ? "--remote" : "--local";

// --------------------------------------------------------------- plumbing

function run(command, commandArgs, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${command} exited ${code}${err ? `: ${err.trim()}` : ""}`)),
    );
  });
}

/** Single-quoted SQL literal. Operator input, but there is no reason to trust it. */
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function d1(sql) {
  const raw = await run(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, scope, "--json", "--command", sql],
    { capture: true },
  );
  const [first] = JSON.parse(raw);
  return first?.results ?? [];
}

// ------------------------------------------------------------------ what

/**
 * The bouts on a card, main event first, each with a fingerprint of everything
 * that would change the picture.
 *
 * The fingerprint is why a re-run is cheap: a fifteen-bout card is a quarter of
 * an hour of compute, and after a fighter finally sends their photo only their
 * bout needs doing again.
 */
async function boutsOf(eventSlug) {
  const rows = await d1(
    `SELECT b.number, b.discipline, b.weight_kg, b.class_label, b.title_label, b.billing,
            b.womens, b.rounds, b.round_minutes, b.sponsor_id, b.red_id, b.blue_id,
            r.updated_at AS red_updated, u.updated_at AS blue_updated,
            j.status AS job_status, j.input_hash AS job_hash
       FROM bouts b
       JOIN events e ON e.id = b.event_id
       JOIN fighters r ON r.id = b.red_id
       JOIN fighters u ON u.id = b.blue_id
       LEFT JOIN render_jobs j ON j.event_id = b.event_id AND j.bout_number = b.number
      WHERE e.slug = ${lit(eventSlug)}
      ORDER BY b.number DESC`,
  );

  return rows.map((row) => {
    const { job_status, job_hash, ...inputs } = row;
    return {
      number: row.number,
      hash: createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16),
      playable: job_status === "done",
      // A finished render made before fingerprinting existed has no hash, so it
      // counts as stale. Re-rendering something that was already right is far
      // cheaper than showing a video of a record that has since changed.
      rendered: job_status === "done" ? job_hash : null,
    };
  });
}

async function eventIdOf(eventSlug) {
  const [row] = await d1(`SELECT id FROM events WHERE slug = ${lit(eventSlug)}`);
  if (!row) throw new Error(`No event with slug "${eventSlug}" in the ${scope.slice(2)} database`);
  return row.id;
}

async function markJob(eventId, boutNumber, fields) {
  const columns = { event_id: lit(eventId), bout_number: boutNumber, ...fields };
  const names = Object.keys(columns);
  await d1(
    `INSERT INTO render_jobs (id, ${names.join(", ")}, requested_at)
     VALUES (${lit(`rj_${eventId}_${boutNumber}`)}, ${Object.values(columns).join(", ")}, ${Date.now()})
     ON CONFLICT (event_id, bout_number) DO UPDATE SET
       ${names.map((name) => `${name} = excluded.${name}`).join(", ")}`,
  );
}

// --------------------------------------------------------------- capturing

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
  await page.goto(`${base}/render/${slug}/${bout}`, {
    waitUntil: "networkidle0",
    timeout: 120_000,
  });
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
  const out = path.join(outDir, `${slug}-bout-${bout}.mp4`);

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
  return out;
}

/** Puts the file in the bucket and records the key the programme reads. */
async function publishBout(eventId, bout, file, hash) {
  const key = `renders/${slug}/bout-${bout}.mp4`;
  await run("npx", [
    "wrangler", "r2", "object", "put", `${BUCKET}/${key}`,
    "--file", file,
    "--content-type", "video/mp4",
    scope,
  ]);
  await markJob(eventId, bout, {
    status: lit("done"),
    r2_key: lit(key),
    input_hash: lit(hash),
    error: "NULL",
    finished_at: Date.now(),
  });
  console.log(`  published ${key}`);
}

// ------------------------------------------------------------------- main

const still = arg("still");
const boutArg = arg("bout");

if (still && boutArg) {
  if (!slug) throw new Error("Pass --slug <event-slug>");
  await renderStill(Number(boutArg), Number(still));
} else {
  if (!slug) throw new Error("Pass --slug <event-slug>");

  const all = await boutsOf(slug);
  if (!all.length) throw new Error(`No bouts on "${slug}" in the ${scope.slice(2)} database`);

  if (arg("list")) {
    for (const bout of all) {
      const state =
        bout.rendered === bout.hash ? "current" : bout.playable ? "stale" : "missing";
      console.log(`  bout ${String(bout.number).padStart(2)}  ${state}`);
    }
    process.exit(0);
  }

  let wanted;
  if (boutArg && boutArg !== true) {
    wanted = all.filter((b) => b.number === Number(boutArg));
    if (!wanted.length) throw new Error(`Bout ${boutArg} is not on "${slug}"`);
  } else if (arg("stale")) {
    wanted = all.filter((b) => b.rendered !== b.hash);
    if (!wanted.length) console.log("Every bout's video is already current.");
  } else if (arg("all")) {
    wanted = all;
  } else {
    console.error(
      "Pass --slug <event-slug> and one of --list, --bout <n>, --stale, --all,\n" +
        "or --bout <n> --still <frame>.",
    );
    process.exit(1);
  }

  const eventId = publish ? await eventIdOf(slug) : null;
  for (const bout of wanted) {
    if (publish) await markJob(eventId, bout.number, { status: lit("running") });
    try {
      const file = await renderBout(bout.number);
      if (publish) await publishBout(eventId, bout.number, file, bout.hash);
    } catch (error) {
      if (publish) {
        await markJob(eventId, bout.number, {
          status: lit("failed"),
          error: lit(error.message),
          finished_at: Date.now(),
        });
      }
      throw error;
    }
  }
}
