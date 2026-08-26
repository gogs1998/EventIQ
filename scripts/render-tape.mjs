/**
 * Renders a bout's tale of the tape to a vertical mp4.
 *
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15
 *   node scripts/render-tape.mjs --slug cage-county-12 --stale --publish
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15 --still 300
 *
 * Before rendering anything it makes the cutouts that do not exist yet, because
 * a fighter's photograph arrives through a Worker and background removal cannot
 * run in one. See scripts/cutouts.mjs, which is also runnable on its own.
 *
 * Needs the app running at --base (npm run dev, or `npm run preview`, or the
 * deployed site) and RENDER_KEY, which is what the capture page accepts instead
 * of a promoter session. See DEPLOY.md.
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
import { ensureCutouts, needsCutout } from "./cutouts.mjs";
import { devVars } from "./dev-vars.mjs";

const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(Boolean);

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DATABASE = "eventiq";
const BUCKET = "eventiq-media";

/**
 * The credential for the capture page.
 *
 * That page has to serve a card before it is published, which is exactly what
 * the publish check exists to prevent, so it takes a key of its own instead. The
 * header name is duplicated from RENDER_KEY_HEADER in lib/auth.ts because this
 * script is plain Node and cannot import a TypeScript module; if the two ever
 * drift, `openBout` throws on the first response rather than quietly capturing
 * 480 frames of a 404 page.
 *
 * Read from the shell first and .dev.vars second, so a local `wrangler dev` or
 * `next dev` needs nothing exported: both the Worker and this script take the
 * value out of the same file.
 */
const RENDER_KEY_HEADER = "x-eventiq-render-key";
const renderKey = process.env.RENDER_KEY || devVars().RENDER_KEY;

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
 *
 * The photograph and the cutout are in it by name rather than being left to
 * `updated_at`. A cutout appearing is the single most visible change that can
 * happen to a bout's video — it is the difference between a rectangle and a
 * fighter standing in front of the venue — and it happens in this script's own
 * run, minutes after the row was last touched. Naming both columns means the
 * staleness test states what it depends on instead of depending on every write
 * path remembering to bump a timestamp.
 */
async function boutsOf(eventSlug) {
  const rows = await d1(
    `SELECT b.number, b.discipline, b.weight_kg, b.class_label, b.title_label, b.billing,
            b.womens, b.rounds, b.round_minutes, b.sponsor_id, b.red_id, b.blue_id,
            r.updated_at AS red_updated, u.updated_at AS blue_updated,
            r.photo AS red_photo, r.cutout AS red_cutout,
            u.photo AS blue_photo, u.cutout AS blue_cutout,
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
      fighterIds: [row.red_id, row.blue_id],
      pendingCutout:
        needsCutout({ photo: row.red_photo, cutout: row.red_cutout }) ||
        needsCutout({ photo: row.blue_photo, cutout: row.blue_cutout }),
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
  if (!renderKey) {
    throw new Error(
      "RENDER_KEY is not set, so the capture page will refuse this render.\n" +
        "  Local:  add RENDER_KEY to .dev.vars (the same file the dev server reads).\n" +
        "  Remote: export RENDER_KEY to the value held by `wrangler secret put RENDER_KEY`.\n" +
        "See DEPLOY.md, Video rendering.",
    );
  }

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
    // Set on the page rather than per navigation, so every request the capture
    // page makes of us carries it.
    await page.setExtraHTTPHeaders({ [RENDER_KEY_HEADER]: renderKey });
    page.on("pageerror", (err) => console.error("  page error:", err.message));
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function openBout(page, bout) {
  const url = `${base}/render/${slug}/${bout}`;
  const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });

  // A refused render key comes back as 404, deliberately — the page will not say
  // whether the show exists. Checking the status here turns that into one clear
  // line instead of a two-minute wait for window.__ready that never arrives.
  if (response && !response.ok()) {
    throw new Error(
      `${url} answered ${response.status()}. If the show and bout are right, the ` +
        "render key is wrong: this script's RENDER_KEY must match the one the " +
        "server has. See DEPLOY.md, Video rendering.",
    );
  }

  await page.waitForFunction(() => window.__ready === true, { timeout: 120_000 });
  return page.evaluate(() => window.__duration ?? 480);
}

/**
 * Commits the frame and waits for it to be painted before we capture it.
 *
 * The wait includes every image in the document being decoded, not just a couple
 * of animation frames, because a scene can put an image into the DOM for the
 * first time: a fighter's portrait does not exist until their reveal starts at
 * frame 62. Two frames later is not long enough to fetch one, so the opening of
 * the reveal captured as an empty venue with a name under it. It survived because
 * the seeded portraits are static files that a warm dev server answers in a
 * millisecond or two; an uploaded photograph comes back through /media and D1,
 * and the first frames went out blank.
 *
 * `decode()` is the right question to ask — it resolves when the image can be
 * painted without a delay, and resolves immediately for anything already
 * painted, so asking on all 480 frames costs almost nothing.
 */
async function seek(page, frame) {
  await page.evaluate(async (f) => {
    window.__setFrame(f);
    // One frame for React to commit, so anything new is in the document.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {})));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }, frame);
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

  let all = await boutsOf(slug);
  if (!all.length) throw new Error(`No bouts on "${slug}" in the ${scope.slice(2)} database`);

  if (arg("list")) {
    const pending = all.filter((bout) => bout.pendingCutout).length;
    for (const bout of all) {
      const state =
        bout.rendered === bout.hash ? "current" : bout.playable ? "stale" : "missing";
      console.log(
        `  bout ${String(bout.number).padStart(2)}  ${state}${bout.pendingCutout ? "  (cutout to make)" : ""}`,
      );
    }
    if (pending) {
      // --list reads and writes nothing, so it reports the cutouts a real run
      // would make rather than making them. Without this the bouts about to
      // become stale look current, which is true only until something renders.
      console.log(`\n  ${pending} bout${pending === 1 ? "" : "s"} has a photograph with no cutout yet.`);
    }
    process.exit(0);
  }

  // Cutouts before fingerprints, both because the render needs them and because
  // a cutout appearing is what makes a bout stale. Doing it the other way round
  // is how a fighter whose photograph has just arrived gets left out of --stale.
  if (arg("no-cutouts")) {
    console.log("Skipping cutouts. Any fighter without one will show their photograph.");
  } else {
    // One bout asked for means only its two corners need cutting out. Anything
    // wider has to consider the whole card, because --stale is about every bout.
    const only =
      boutArg && boutArg !== true
        ? (all.find((bout) => bout.number === Number(boutArg))?.fighterIds ?? [])
        : null;
    const cutoutTimeout = arg("cutout-timeout");
    const summary = await ensureCutouts({
      slug,
      scope,
      refresh: Boolean(arg("refresh-cutouts")),
      only,
      ...(cutoutTimeout && cutoutTimeout !== true ? { timeoutMs: Number(cutoutTimeout) } : {}),
    });
    if (summary.made || summary.failed) all = await boutsOf(slug);
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
        "or --bout <n> --still <frame>.\n" +
        "Cutouts are made first unless --no-cutouts; --refresh-cutouts remakes\n" +
        "the ones that already exist.",
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
