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
 * out-of-band job, and the render_jobs table is the whole interface between it
 * and the app: the app queues a bout, this claims it, and the app reads back the
 * key.
 *
 * It talks to D1 and R2 through wrangler rather than through an API of our own.
 * Anyone who can run the renderer already holds the Cloudflare credentials, so a
 * write endpoint on the public site would be a new way in for no gain.
 *
 * **Two runners must never render the same bout**, now that a cron runs one on
 * the hour and an operator can start another beside it. A bout is claimed with a
 * single UPDATE that takes a lease, and a runner that dies releases the bout by
 * running out of time rather than by tidying up after itself. lib/renders.ts
 * holds that decision in readable form and is imported here, so the dashboard's
 * idea of what needs rendering and this script's cannot come apart.
 *
 * How the capture works: headless Chrome opens the capture page once, then the
 * frame is driven through window.__setFrame and the viewport screenshotted per
 * frame. Because the composition is a pure function of that frame number the
 * result is deterministic, and the frames stream straight into ffmpeg rather
 * than piling up on disk.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { ensureCutouts, needsCutout } from "./cutouts.mjs";
import { devVars } from "./dev-vars.mjs";
import { localBin } from "./local-bin.mjs";
// Node strips the types on the way in, so there is one definition of what a
// render depends on rather than one here and a drifting copy in the app.
import {
  MAX_RENDER_ATTEMPTS,
  RENDER_LEASE_MS,
  renderFingerprint,
  renderKeyFor,
  sponsorFingerprint,
} from "../lib/renders.ts";

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
 * header name is duplicated from RENDER_KEY_HEADER in lib/auth.ts because that
 * module is not importable from here; if the two ever drift, `openBout` throws
 * on the first response rather than quietly capturing 480 frames of a 404 page.
 *
 * Read from the shell first and .dev.vars second, so a local `wrangler dev` or
 * `next dev` needs nothing exported: both the Worker and this script take the
 * value out of the same file.
 */
const RENDER_KEY_HEADER = "x-eventiq-render-key";
const renderKey = process.env.RENDER_KEY || devVars().RENDER_KEY;

/**
 * Where Chrome is, per platform.
 *
 * The previous version was `[...three Linux paths].find(Boolean)`, which returns
 * the first element of a list of string literals — so it always answered
 * "/usr/local/bin/google-chrome" and every machine that was not one particular
 * Linux box needed CHROME_PATH exported before anything would render. Nothing
 * said so: puppeteer failed to launch and the message was about a spawn rather
 * than about a browser being somewhere else.
 */
export function chromeCandidates(platform = process.platform, env = process.env) {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  if (platform === "win32") {
    return [
      env["PROGRAMFILES"] ?? "C:\\Program Files",
      env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
      env["LOCALAPPDATA"] ?? "",
    ]
      .filter(Boolean)
      .flatMap((root) => [
        path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ]);
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

/** CHROME_PATH first, because a machine with two browsers on it gets to choose. */
export function resolveChrome(env = process.env, exists = existsSync) {
  if (env.CHROME_PATH) return { path: env.CHROME_PATH, fromEnv: true };
  const found = chromeCandidates(process.platform, env).find((candidate) => exists(candidate));
  return { path: found ?? null, fromEnv: false };
}

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
  // "npx" is a batch file on Windows and cannot be spawned directly; see local-bin.mjs.
  if (command === "npx") [command, commandArgs] = localBin(commandArgs);
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

/**
 * Both binaries, before anything slow happens.
 *
 * A missing ffmpeg used to surface 480 frames later as a broken pipe, and a
 * Chrome that is somewhere else as a spawn error naming a path nobody had
 * chosen. Neither reads as "install this". Checked once, said once, in terms of
 * the thing that is actually absent.
 */
let checked = null;
async function preflight() {
  if (checked) return checked;

  const chrome = resolveChrome();
  if (!chrome.path || !existsSync(chrome.path)) {
    throw new Error(
      chrome.fromEnv
        ? `CHROME_PATH is set to "${chrome.path}" and there is nothing there.`
        : "No Chrome found, and every frame is a screenshot of one.\n" +
            "  Set CHROME_PATH to the browser to render with. Looked in:\n" +
            chromeCandidates()
              .map((candidate) => `    ${candidate}`)
              .join("\n"),
    );
  }

  try {
    await run("ffmpeg", ["-version"], { capture: true });
  } catch {
    throw new Error(
      "ffmpeg is not on PATH, and every frame goes through it.\n" +
        "  macOS: brew install ffmpeg\n" +
        "  Debian: apt-get install -y ffmpeg\n" +
        "  Windows: winget install Gyan.FFmpeg",
    );
  }

  checked = chrome.path;
  return checked;
}

/** Single-quoted SQL literal. Operator input, but there is no reason to trust it. */
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function d1Raw(sql) {
  const raw = await run(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, scope, "--json", "--command", sql],
    { capture: true },
  );
  return JSON.parse(raw);
}

async function d1(sql) {
  const [first] = await d1Raw(sql);
  return first?.results ?? [];
}

/** How many rows a write actually touched, which is how a claim is won or lost. */
async function d1Changes(sql) {
  const [first] = await d1Raw(sql);
  return first?.meta?.changes ?? 0;
}

// ------------------------------------------------------------------ what

/**
 * Everything about a bout that ends up on screen, shaped for the fingerprint.
 *
 * The field names come from lib/renders.ts, which throws on a missing or
 * unexpected one — so a column added to the query without being named here, or
 * named here and forgotten in the app's copy of the same idea, fails on the next
 * render rather than leaving every video reading as current forever.
 *
 * Exported for the test that builds one bout from both sides and checks that the
 * two digests are the same.
 */
export function renderInputsFrom(row, sponsorLockups) {
  return {
    eventName: row.event_name,
    eventDate: row.event_date,
    eventVenue: row.event_venue,
    eventCity: row.event_city,
    eventBackdrop: row.event_backdrop,
    promoterName: row.promoter_name,
    promoterMark: row.promoter_mark,
    number: row.number,
    discipline: row.discipline,
    weightKg: row.weight_kg,
    classLabel: row.class_label,
    titleLabel: row.title_label,
    billing: row.billing,
    womens: row.womens ? 1 : 0,
    rounds: row.rounds,
    roundMinutes: row.round_minutes,
    redId: row.red_id,
    redUpdatedAt: row.red_updated,
    redPhoto: row.red_photo,
    redCutout: row.red_cutout,
    blueId: row.blue_id,
    blueUpdatedAt: row.blue_updated,
    bluePhoto: row.blue_photo,
    blueCutout: row.blue_cutout,
    sponsors: sponsorLockups,
  };
}

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
 *
 * The show, the promoter's mark and the sponsor lockups are named for the same
 * reason: all three are on screen. A venue corrected the day before the show
 * used to leave fifteen videos naming the old one, and nothing said so.
 */
async function boutsOf(eventSlug) {
  const rows = await d1(
    `SELECT b.number, b.discipline, b.weight_kg, b.class_label, b.title_label, b.billing,
            b.womens, b.rounds, b.round_minutes, b.sponsor_id, b.red_id, b.blue_id,
            e.name AS event_name, e.date AS event_date, e.venue AS event_venue,
            e.city AS event_city, e.backdrop AS event_backdrop,
            p.name AS promoter_name, p.mark AS promoter_mark,
            r.updated_at AS red_updated, u.updated_at AS blue_updated,
            r.photo AS red_photo, r.cutout AS red_cutout,
            u.photo AS blue_photo, u.cutout AS blue_cutout,
            j.status AS job_status, j.current_hash AS job_hash,
            j.current_r2_key AS job_key, j.attempts AS job_attempts,
            j.lease_until AS job_lease, j.error AS job_error
       FROM bouts b
       JOIN events e ON e.id = b.event_id
       JOIN promoters p ON p.id = e.promoter_id
       JOIN fighters r ON r.id = b.red_id
       JOIN fighters u ON u.id = b.blue_id
       LEFT JOIN render_jobs j ON j.event_id = b.event_id AND j.bout_number = b.number
      WHERE e.slug = ${lit(eventSlug)}
      ORDER BY b.number DESC`,
  );
  if (!rows.length) return [];

  // Every sponsor lockup the composition can draw: the bout's own, in the
  // closing card, and each corner's, in their reveal. The show's sponsor strip
  // is not among them — TaleOfTheTape never reads showSponsorIds — so hashing it
  // would make every bout stale for a change that appears in no video.
  const lockups = new Map(
    (
      await d1(
        `SELECT s.id AS id, s.name AS name, s.qualifier AS qualifier, s.mark AS mark
           FROM sponsors s
           JOIN events e ON e.promoter_id = s.promoter_id
          WHERE e.slug = ${lit(eventSlug)}`,
      )
    ).map((sponsor) => [sponsor.id, sponsorFingerprint(sponsor)]),
  );

  const fighterSponsors = new Map();
  for (const link of await d1(
    `SELECT fs.fighter_id AS fighter_id, fs.sponsor_id AS sponsor_id
       FROM fighter_sponsors fs
      WHERE fs.fighter_id IN (
        SELECT b.red_id FROM bouts b JOIN events e ON e.id = b.event_id WHERE e.slug = ${lit(eventSlug)}
        UNION
        SELECT b.blue_id FROM bouts b JOIN events e ON e.id = b.event_id WHERE e.slug = ${lit(eventSlug)}
      )
      ORDER BY fs.position`,
  )) {
    fighterSponsors.set(link.fighter_id, [
      ...(fighterSponsors.get(link.fighter_id) ?? []),
      link.sponsor_id,
    ]);
  }

  const now = Date.now();
  return Promise.all(
    rows.map(async (row) => {
      const sponsors = [
        row.sponsor_id,
        ...(fighterSponsors.get(row.red_id) ?? []),
        ...(fighterSponsors.get(row.blue_id) ?? []),
      ]
        .map((id) => (id ? lockups.get(id) : null))
        .filter((entry) => entry != null);

      const job = row.job_status
        ? {
            status: row.job_status,
            attempts: row.job_attempts ?? 0,
            leaseUntil: row.job_lease ?? null,
            currentR2Key: row.job_key ?? null,
            currentHash: row.job_hash ?? null,
            error: row.job_error ?? null,
          }
        : null;

      return {
        number: row.number,
        fighterIds: [row.red_id, row.blue_id],
        pendingCutout:
          needsCutout({ photo: row.red_photo, cutout: row.red_cutout }) ||
          needsCutout({ photo: row.blue_photo, cutout: row.blue_cutout }),
        hash: await renderFingerprint(renderInputsFrom(row, sponsors)),
        job,
        // A finished render made before fingerprinting existed has no hash, so
        // it counts as stale. Re-rendering something that was already right is
        // far cheaper than showing a video of a record that has since changed.
        rendered: job?.currentHash ?? null,
        playable: Boolean(job?.currentR2Key),
        held: job?.leaseUntil != null && job.leaseUntil > now,
      };
    }),
  );
}

async function eventIdOf(eventSlug) {
  const [row] = await d1(`SELECT id FROM events WHERE slug = ${lit(eventSlug)}`);
  if (!row) throw new Error(`No event with slug "${eventSlug}" in the ${scope.slice(2)} database`);
  return row.id;
}

/** Matches renderJobId in lib/db/render-jobs.ts, so both sides address one row. */
function jobId(eventId, boutNumber) {
  return `rj_${eventId}_${boutNumber}`;
}

/**
 * Takes the bout, or does not.
 *
 * One statement, because the whole point is that two runners asking at the same
 * moment cannot both win: whichever UPDATE lands second sees the lease the first
 * one wrote and changes nothing, and `changes` says which happened. `claimable`
 * in lib/renders.ts is the same decision written to be read, and the constants
 * come from there so the two cannot drift.
 *
 * `force` is an operator naming a bout on the command line, which means it even
 * for a bout that is already current — but never for one another runner is
 * holding, because that is two Chromes on one bout rather than a decision.
 */
export function claimSql(eventId, boutNumber, hash, { now, force }) {
  const wanted = force
    ? "1 = 1"
    : `(render_jobs.status = 'queued'
            OR (render_jobs.status IN ('failed', 'running')
                AND render_jobs.attempts < ${MAX_RENDER_ATTEMPTS}))`;

  return `INSERT INTO render_jobs
            (id, event_id, bout_number, status, input_hash, error, attempts, lease_until, requested_at)
          VALUES
            (${lit(jobId(eventId, boutNumber))}, ${lit(eventId)}, ${boutNumber},
             'running', ${lit(hash)}, NULL, 1, ${now + RENDER_LEASE_MS}, ${now})
          ON CONFLICT (event_id, bout_number) DO UPDATE SET
            status = 'running',
            input_hash = excluded.input_hash,
            error = NULL,
            attempts = render_jobs.attempts + 1,
            lease_until = excluded.lease_until
          WHERE (render_jobs.lease_until IS NULL OR render_jobs.lease_until < ${now})
            AND ${wanted}`;
}

async function claim(eventId, boutNumber, hash, { force }) {
  return (await d1Changes(claimSql(eventId, boutNumber, hash, { now: Date.now(), force }))) > 0;
}

/**
 * Records the end of an attempt, and releases the lease.
 *
 * It never touches current_r2_key or current_hash. Those two are the video the
 * programme plays, and a render that has just failed must not take a working
 * video off a card people are reading at a venue.
 */
async function finishJob(eventId, boutNumber, fields) {
  const sets = Object.entries(fields).map(([name, value]) => `${name} = ${value}`);
  await d1(
    `UPDATE render_jobs SET ${sets.join(", ")}, lease_until = NULL, finished_at = ${Date.now()}
      WHERE event_id = ${lit(eventId)} AND bout_number = ${boutNumber}`,
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
    executablePath: await preflight(),
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

    /**
     * The key goes on the capture page's own request and on nothing else.
     *
     * It used to be set with setExtraHTTPHeaders, which puts a header on every
     * request the page makes: the photographs out of /media, the fonts, the
     * chunks, and — for a card whose backdrop or sponsor mark is hosted anywhere
     * else — on a request to somebody else's server. A shared secret that can
     * read any card on the instance, published or not, has no business
     * travelling with an image. Only the capture page checks it, so only the
     * capture page is sent it.
     */
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const wantsKey =
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        request.url().startsWith(base);
      void request.continue(
        wantsKey ? { headers: { ...request.headers(), [RENDER_KEY_HEADER]: renderKey } } : {},
      );
    });

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
    // Chrome paints sRGB and an untagged HD mp4 leaves every player guessing at
    // Rec. 709. It is nearly the same thing, which is why this was survivable,
    // and "nearly" shows up as the corner reds sitting slightly apart between
    // the video and the programme page next to it. Saying so costs nothing.
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
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

/**
 * Puts the file in the bucket under a key nobody has used before, and records it.
 *
 * The key carries the fingerprint because /media answers with a year of
 * immutable caching. Writing a re-render over the old key left every phone that
 * had already played the bout holding last week's video with no way of finding
 * out — which is the state the whole staleness apparatus exists to avoid.
 *
 * The superseded object is deleted afterwards rather than before, so that a put
 * or a D1 write that fails leaves the programme playing what it was playing.
 */
async function publishBout(eventId, bout, file, hash, previousKey) {
  const key = renderKeyFor(slug, bout, hash);
  await run("npx", [
    "wrangler", "r2", "object", "put", `${BUCKET}/${key}`,
    "--file", file,
    "--content-type", "video/mp4",
    scope,
  ]);
  await finishJob(eventId, bout, {
    status: lit("done"),
    current_r2_key: lit(key),
    current_hash: lit(hash),
    input_hash: lit(hash),
    attempts: 0,
    error: "NULL",
  });
  console.log(`  published ${key}`);

  // A key beginning with a slash is one of the five renders committed under
  // public/ before there was a bucket. Those are files in the repository, and
  // deleting them is not this script's business.
  if (previousKey && previousKey !== key && !previousKey.startsWith("/")) {
    await run("npx", [
      "wrangler", "r2", "object", "delete", `${BUCKET}/${previousKey}`, scope,
    ]).catch((error) => console.log(`  left ${previousKey} in the bucket: ${error.message}`));
  }
}

// ------------------------------------------------------------------- main

/** What --list prints. The same six words the dashboard uses. */
function stateOf(bout) {
  if (bout.held) return "running";
  if (bout.job?.status === "queued") return "queued";
  if (bout.job?.status === "failed") {
    return bout.job.attempts < MAX_RENDER_ATTEMPTS ? "failed, will try again" : "failed";
  }
  if (bout.rendered && bout.rendered === bout.hash) return "current";
  return bout.playable ? "stale" : "missing";
}

/**
 * The bouts an unattended run should do something about.
 *
 * Wider than "the fingerprint moved", because the promoter's own button queues a
 * bout without changing it. Asking for a bout that is already current to be made
 * again is a reasonable thing to want, and a run that skipped it would leave the
 * dashboard saying "queued" until somebody typed a bout number.
 */
function wantsRendering(bout) {
  if (bout.held) return false;
  if (bout.job?.status === "queued") return true;
  if (
    (bout.job?.status === "failed" || bout.job?.status === "running") &&
    bout.job.attempts < MAX_RENDER_ATTEMPTS
  ) {
    return true;
  }
  return bout.rendered !== bout.hash;
}

async function main() {
  const still = arg("still");
  const boutArg = arg("bout");

  if (still && boutArg) {
    if (!slug) throw new Error("Pass --slug <event-slug>");
    await renderStill(Number(boutArg), Number(still));
    return 0;
  }

  if (!slug) throw new Error("Pass --slug <event-slug>");

  let all = await boutsOf(slug);
  if (!all.length) throw new Error(`No bouts on "${slug}" in the ${scope.slice(2)} database`);

  if (arg("list")) {
    const pending = all.filter((bout) => bout.pendingCutout).length;
    for (const bout of all) {
      console.log(
        `  bout ${String(bout.number).padStart(2)}  ${stateOf(bout)}` +
          `${bout.pendingCutout ? "  (cutout to make)" : ""}` +
          `${bout.job?.error ? `\n      ${bout.job.error}` : ""}`,
      );
    }
    if (pending) {
      // --list reads and writes nothing, so it reports the cutouts a real run
      // would make rather than making them. Without this the bouts about to
      // become stale look current, which is true only until something renders.
      console.log(`\n  ${pending} bout${pending === 1 ? "" : "s"} has a photograph with no cutout yet.`);
    }
    return 0;
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

  // A bout named on the command line is an instruction. --stale is a runner
  // working through a queue, and has to leave alone whatever another runner is
  // already holding.
  let wanted;
  let force = false;
  if (boutArg && boutArg !== true) {
    wanted = all.filter((b) => b.number === Number(boutArg));
    if (!wanted.length) throw new Error(`Bout ${boutArg} is not on "${slug}"`);
    force = true;
  } else if (arg("stale")) {
    wanted = all.filter(wantsRendering);
    if (!wanted.length) console.log("Every bout's video is already current.");
  } else if (arg("all")) {
    wanted = all;
    force = true;
  } else {
    console.error(
      "Pass --slug <event-slug> and one of --list, --bout <n>, --stale, --all,\n" +
        "or --bout <n> --still <frame>.\n" +
        "--stale takes the bouts that are queued, out of date, or worth another\n" +
        "attempt; --all takes every bout on the card.\n" +
        "Cutouts are made first unless --no-cutouts; --refresh-cutouts remakes\n" +
        "the ones that already exist.",
    );
    return 1;
  }

  const eventId = publish ? await eventIdOf(slug) : null;
  let failures = 0;

  for (const bout of wanted) {
    // Without --publish nothing is recorded, so there is nothing to claim: it is
    // a dry run to a file, and two of those colliding costs nobody anything.
    if (publish && !(await claim(eventId, bout.number, bout.hash, { force }))) {
      console.log(`bout ${bout.number}: left to another runner (${stateOf(bout)})`);
      continue;
    }

    try {
      const file = await renderBout(bout.number);
      if (publish) {
        await publishBout(eventId, bout.number, file, bout.hash, bout.job?.currentR2Key);
      }
    } catch (error) {
      // One bad bout does not stop the other fourteen, and the video that bout
      // already had stays on the programme. The exit code carries the failure,
      // which is what a cron and a workflow actually read.
      failures += 1;
      console.error(`bout ${bout.number}: ${error.message}`);
      if (publish) {
        await finishJob(eventId, bout.number, {
          status: lit("failed"),
          // Long enough to say what happened, short enough for a table cell.
          error: lit(error.message.slice(0, 500)),
        });
      }
    }
  }

  return failures ? 1 : 0;
}

// Only when run directly, so the tests can import the pure parts. Through
// pathToFileURL because a Windows path is not a file URL, and comparing the two
// as strings silently never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
