/**
 * Renders a bout's videos to vertical mp4s.
 *
 * A bout is two of them: the tale of the tape, which the programme plays, and
 * the promo, which it offers. They are two rows in `render_jobs` and two objects
 * in the bucket, claimed, rendered and published separately, so a promo that
 * will not render never takes the tale of the tape off a card people are
 * reading. A run without --template does both.
 *
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15
 *   node scripts/render-tape.mjs --slug cage-county-12 --stale --publish
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15 --still 300
 *   node scripts/render-tape.mjs --slug cage-county-12 --stale --publish --env staging
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15 --template faceoff
 *   node scripts/render-tape.mjs --slug cage-county-12 --bout 15 --template walkout --corner blue
 *
 * The last is a sample to a file: --publish takes the tape and the promo, and
 * refuses anything the programme has nowhere to put.
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
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { chromeOrThrow } from "./chrome.mjs";
import { ensureCutouts, needsCutout } from "./cutouts.mjs";
import { devVars } from "./dev-vars.mjs";
import { environmentFrom } from "./environments.mjs";
import { localBin } from "./local-bin.mjs";
// Node strips the types on the way in, so there is one definition of what a
// render depends on rather than one here and a drifting copy in the app. Both
// modules are pure and import nothing at runtime, which is what makes that
// possible at all.
import { RENDER_KEY_HEADER } from "../lib/auth.ts";
import {
  MAX_RENDER_ATTEMPTS,
  PUBLISHED_TEMPLATES,
  RENDER_LEASE_MS,
  isPublishedTemplate,
  renderFingerprint,
  renderKeyFor,
  sponsorFingerprint,
} from "../lib/renders.ts";

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
// Which database is claimed from and which bucket the mp4 lands in. A renderer
// pointed at one environment's site and writing to the other's rows would
// publish a key nothing can serve, so both come from the same flag.
const { database: DATABASE, bucket: BUCKET } = environmentFrom(process.argv, (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
});

/**
 * The credential for the capture page.
 *
 * That page has to serve a card before it is published, which is exactly what
 * the publish check exists to prevent, so it takes a key of its own instead.
 * The header name comes from lib/auth.ts, where the route reads it: it used to
 * be written out again here, and a rename would have left this presenting a
 * header nothing reads, which is a 404 on the capture page and no other symptom.
 *
 * Read from the shell first and .dev.vars second, so a local `wrangler dev` or
 * `next dev` needs nothing exported: both the Worker and this script take the
 * value out of the same file.
 */
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

/**
 * Which composition to capture, and which fighter where that matters.
 *
 * The registry lives in components/sequence/templates.ts and is deliberately not
 * copied here. That file imports .tsx components, which Node's type stripping
 * cannot load, so it is not importable from a plain script — and a second copy
 * would go stale the first time somebody adds a template. So the capture page is
 * the authority: an unknown id comes back as a 404, which `openBout` already
 * reports, and the frame count comes back through `window.__duration`, which is
 * the registry's own number.
 *
 * `PUBLISHED_TEMPLATES` is the one part of it that both sides need, so it is in
 * lib/renders.ts with the fingerprint, which this file already imports.
 *
 * **Naming a template means only that template.** Leaving it off means every
 * published one, which is what a run without a template is now for: a bout has
 * two videos and asking for "bout 15" means the bout rather than half of it.
 */
const explicitTemplate = typeof arg("template") === "string" ? arg("template") : null;
const template = str(arg("template", "tape"), "tape");

/**
 * The (bout, template) pairs one run is about.
 *
 * Nothing but a named template may be published that is not on the list: a
 * walkout is one video per corner and the job row carries no corner, so a
 * published walkout would replace the bout's promo and read as current.
 */
const wantedTemplates = explicitTemplate ? [explicitTemplate] : [...PUBLISHED_TEMPLATES];
const corner = str(arg("corner", "red"), "red") === "blue" ? "blue" : "red";

/** A flag given with no value comes back as `true`. Treat that as unset. */
function str(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
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

  const chrome = chromeOrThrow("No Chrome found, and every frame is a screenshot of one.");

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

  checked = chrome;
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
export function renderInputsFrom(row, sponsorLockups, template) {
  return {
    template,
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
 *
 * A bout that has come off the card is not here at all, which is the same answer
 * the app gives in lib/db/render-jobs.ts: the video is a walkout for a walkout
 * that is not happening, and `--stale` would otherwise keep asking for it.
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
            u.photo AS blue_photo, u.cutout AS blue_cutout
       FROM bouts b
       JOIN events e ON e.id = b.event_id
       JOIN promoters p ON p.id = e.promoter_id
       JOIN fighters r ON r.id = b.red_id
       JOIN fighters u ON u.id = b.blue_id
      WHERE e.slug = ${lit(eventSlug)} AND b.cancelled = 0
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
        // mark_key as well as mark: a promoter's own upload is the emblem the
        // composition draws, so it is the emblem the fingerprint has to hash.
        `SELECT s.id AS id, s.name AS name, s.qualifier AS qualifier,
                s.mark AS mark, s.mark_key AS markKey
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

  // Every queue row for the show, by bout and template. A separate query rather
  // than a join, because a bout has a row per composition and joining them onto
  // the bout would return the card once per video.
  const jobs = new Map();
  for (const job of await d1(
    `SELECT j.bout_number AS bout_number, j.template AS template, j.status AS status,
            j.current_hash AS current_hash, j.current_r2_key AS current_r2_key,
            j.attempts AS attempts, j.lease_until AS lease_until, j.error AS error
       FROM render_jobs j
       JOIN events e ON e.id = j.event_id
      WHERE e.slug = ${lit(eventSlug)}`,
  )) {
    jobs.set(`${job.bout_number}:${job.template}`, {
      status: job.status,
      attempts: job.attempts ?? 0,
      leaseUntil: job.lease_until ?? null,
      currentR2Key: job.current_r2_key ?? null,
      currentHash: job.current_hash ?? null,
      error: job.error ?? null,
    });
  }

  return Promise.all(
    rows.map(async (row) => {
      const sponsors = [
        row.sponsor_id,
        ...(fighterSponsors.get(row.red_id) ?? []),
        ...(fighterSponsors.get(row.blue_id) ?? []),
      ]
        .map((id) => (id ? lockups.get(id) : null))
        .filter((entry) => entry != null);

      // One digest per composition. The template is the largest thing on screen,
      // so the tape and the promo of one bout are never the same video and must
      // never share a fingerprint or a key.
      const hashes = {};
      const boutJobs = {};
      for (const id of PUBLISHED_TEMPLATES) {
        hashes[id] = await renderFingerprint(renderInputsFrom(row, sponsors, id));
        boutJobs[id] = jobs.get(`${row.number}:${id}`) ?? null;
      }

      return {
        number: row.number,
        fighterIds: [row.red_id, row.blue_id],
        pendingCutout:
          needsCutout({ photo: row.red_photo, cutout: row.red_cutout }) ||
          needsCutout({ photo: row.blue_photo, cutout: row.blue_cutout }),
        hashes,
        jobs: boutJobs,
      };
    }),
  );
}

/**
 * One bout in one composition: the unit that is claimed, rendered and published.
 *
 * A bout is two videos, and they are two jobs. That matters beyond tidiness: a
 * promo that fails must not stop the tale of the tape being made, a `--stale`
 * run has to be able to take one and leave the other, and two runners on one
 * card must be able to hold different compositions of the same bout.
 *
 * A template nothing publishes gets a target with no hash, which is all a dry
 * run to a file needs — the claim and the publish are the two things that want
 * one, and both are refused for those templates before this is reached.
 */
export function targetsOf(bouts, templates, now = Date.now()) {
  const targets = [];
  for (const bout of bouts) {
    for (const template of templates) {
      const job = bout.jobs?.[template] ?? null;
      targets.push({
        number: bout.number,
        template,
        fighterIds: bout.fighterIds,
        pendingCutout: bout.pendingCutout,
        hash: bout.hashes?.[template] ?? null,
        job,
        // A finished render made before fingerprinting existed has no hash, so
        // it counts as stale. Re-rendering something that was already right is
        // far cheaper than showing a video of a record that has since changed.
        rendered: job?.currentHash ?? null,
        playable: Boolean(job?.currentR2Key),
        held: job?.leaseUntil != null && job.leaseUntil > now,
      });
    }
  }
  return targets;
}

async function eventIdOf(eventSlug) {
  const [row] = await d1(`SELECT id FROM events WHERE slug = ${lit(eventSlug)}`);
  if (!row) throw new Error(`No event with slug "${eventSlug}" in the ${scope.slice(2)} database`);
  return row.id;
}

/** Matches renderJobId in lib/db/render-jobs.ts, so both sides address one row. */
function jobId(eventId, boutNumber, template) {
  return `rj_${eventId}_${boutNumber}_${template}`;
}

/**
 * Takes the bout, or does not.
 *
 * One statement, because the whole point is that two runners asking at the same
 * moment cannot both win: whichever lands second sees the lease the first one
 * wrote and changes nothing. `claimable` in lib/renders.ts is the same decision
 * written to be read, and the constants come from there so the two cannot drift.
 *
 * It answers with RETURNING rather than by reading meta.changes, because the
 * local Miniflare D1 reports only a duration and the remote one reports counts —
 * so a claim checked that way is won on production and silently lost on every
 * developer's machine. A returned row is a row that was written, everywhere.
 *
 * `force` is an operator naming a bout on the command line, which means it even
 * for a bout that is already current — but never for one another runner is
 * holding, because that is two Chromes on one bout rather than a decision.
 *
 * A row saying `done` is claimable when what it published is not what the bout
 * hashes to now, which is the same thing --stale selected it for. `IS NOT`
 * rather than `<>`, because a render finished before fingerprints existed has no
 * `current_hash` at all and `<>` against NULL is NULL rather than true — the
 * five seeded renders were exactly that, and every hourly run left them where
 * they were while reporting them as held by somebody else.
 */
export function claimSql(eventId, boutNumber, template, hash, { now, force }) {
  const wanted = force
    ? "1 = 1"
    : `(render_jobs.status = 'queued'
            OR (render_jobs.status IN ('failed', 'running')
                AND render_jobs.attempts < ${MAX_RENDER_ATTEMPTS})
            OR (render_jobs.status = 'done'
                AND render_jobs.current_hash IS NOT ${lit(hash)}))`;

  return `INSERT INTO render_jobs
            (id, event_id, bout_number, template, status, input_hash, error, attempts,
             lease_until, requested_at)
          VALUES
            (${lit(jobId(eventId, boutNumber, template))}, ${lit(eventId)}, ${boutNumber},
             ${lit(template)}, 'running', ${lit(hash)}, NULL, 1, ${now + RENDER_LEASE_MS}, ${now})
          ON CONFLICT (event_id, bout_number, template) DO UPDATE SET
            status = 'running',
            input_hash = excluded.input_hash,
            error = NULL,
            attempts = render_jobs.attempts + 1,
            lease_until = excluded.lease_until
          WHERE (render_jobs.lease_until IS NULL OR render_jobs.lease_until < ${now})
            AND ${wanted}
          RETURNING id`;
}

async function claim(eventId, boutNumber, template, hash, { force }) {
  const won = await d1(claimSql(eventId, boutNumber, template, hash, { now: Date.now(), force }));
  return won.length > 0;
}

/**
 * Records the end of an attempt, and releases the lease.
 *
 * It never touches current_r2_key or current_hash. Those two are the video the
 * programme plays, and a render that has just failed must not take a working
 * video off a card people are reading at a venue.
 */
async function finishJob(eventId, boutNumber, template, fields) {
  const sets = Object.entries(fields).map(([name, value]) => `${name} = ${value}`);
  await d1(
    `UPDATE render_jobs SET ${sets.join(", ")}, lease_until = NULL, finished_at = ${Date.now()}
      WHERE event_id = ${lit(eventId)} AND bout_number = ${boutNumber}
        AND template = ${lit(template)}`,
  );
}

// --------------------------------------------------------------- capturing

/**
 * Whether a request the capture page made is to the site being captured.
 *
 * This is the boundary the render key is allowed to cross. Origin rather than a
 * prefix match on the base URL, because `https://eventiq.win` is a prefix of
 * `https://eventiq.win.example.com` and a scheme is part of who you are talking
 * to: the same host over http is a different origin and a header sent there goes
 * out in the clear.
 *
 * Anything that is not a URL at all — a data: or blob: source, which the
 * composition does not use but a preview might — is not our origin, so it gets
 * nothing.
 */
export function sameOrigin(url, baseUrl) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/**
 * What a bout fails with when the capture page could not load a picture.
 *
 * It names the first source, because the operator's next move is to curl it: a
 * `/media/cutouts/...` in here means the object is being refused rather than
 * missing, and a render that is refused its portraits is exactly the render that
 * used to succeed with nobody in it.
 */
export function brokenImageMessage(broken) {
  const [first, ...rest] = broken;
  const others = rest.length ? ` (and ${rest.length} other image${rest.length === 1 ? "" : "s"})` : "";
  return (
    `The capture page could not load ${first}${others}, so this bout would render ` +
    "with an empty subject. Nothing was captured."
  );
}

/** Reads what the page has recorded, and refuses the bout if it has recorded anything. */
async function refuseBrokenImages(page) {
  const broken = await page.evaluate(() => window.__checkImages?.() ?? []);
  if (broken.length) throw new Error(brokenImageMessage(broken));
}

export async function withPage(fn) {
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
     * The key goes on every same-origin request and on nothing else.
     *
     * It used to be set with setExtraHTTPHeaders, which puts a header on every
     * request the page makes — including, for a card whose backdrop or sponsor
     * mark is hosted somewhere else, a request to somebody else's server. A
     * shared secret that can read any card on the instance has no business
     * travelling there, so it was narrowed to the document alone.
     *
     * That was too narrow by one boundary. `/media` asks the same question the
     * capture page does (section 6d), so on a draft show the page's own <img>
     * requests for the portraits were refused, and every one of them is
     * `complete` with nothing in it — 480 frames of empty subject, exit code 0.
     * Same-origin is the line the concern actually drew: the third-party host is
     * the thing to keep the key away from, and our own routes are the things
     * that check it.
     */
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const wantsKey = sameOrigin(request.url(), base);
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

/**
 * The capture page for one bout, in one template.
 *
 * The show defaults to --slug because that is what this script is run with;
 * scripts/golden-frames.mjs passes its own rather than relying on the two
 * command lines happening to agree. The query is left off entirely for the tape
 * in the red corner, so the URL the golden frames are captured from is the one
 * they have always been captured from.
 */
export function captureUrl(baseUrl, eventSlug, bout, templateId = "tape", cornerId = "red") {
  const query = new URLSearchParams();
  if (templateId !== "tape") query.set("template", templateId);
  if (cornerId !== "red") query.set("corner", cornerId);
  const suffix = query.size ? `?${query}` : "";
  return `${baseUrl}/render/${eventSlug}/${bout}${suffix}`;
}

export async function openBout(page, bout, eventSlug = slug, templateId = template, cornerId = corner) {
  const url = captureUrl(base, eventSlug, bout, templateId, cornerId);
  const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });

  // A refused render key comes back as 404, deliberately — the page will not say
  // whether the show exists. So does a template id the registry does not carry,
  // which is the other thing an operator can get wrong from the command line.
  // Checking the status here turns either into one clear line instead of a
  // two-minute wait for window.__ready that never arrives.
  if (response && !response.ok()) {
    throw new Error(
      `${url} answered ${response.status()}. If the show and bout are right, it is ` +
        `either --template ${templateId} naming a composition that does not exist, or ` +
        "the render key: this script's RENDER_KEY must match the one the server has. " +
        "See DEPLOY.md, Video rendering.",
    );
  }

  await page.waitForFunction(() => window.__ready === true, { timeout: 120_000 });
  // The backdrop and the promoter's mark are in the document from the first
  // frame, so anything wrong with those is known before ffmpeg is started.
  await refuseBrokenImages(page);
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
 *
 * What it must not do is swallow the answer. A rejected decode used to go into
 * an empty catch, which is how a bout whose every portrait was being refused
 * captured 480 frames of nothing and finished successfully. Each frame is
 * checked, not just the first, because a portrait does not enter the document
 * until its reveal begins at frame 62.
 */
export async function seek(page, frame) {
  // One round trip rather than two: the check runs in the same evaluate, because
  // this is on the path 480 times a bout.
  const broken = await page.evaluate(async (f) => {
    window.__setFrame(f);
    // One frame for React to commit, so anything new is in the document.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const failed = [];
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.decode().catch(() => {
          // An image taken out of the document mid-decode was aborted by the
          // frame moving on, which is not a missing picture. Anything still in
          // the document that will not decode is one.
          if (img.isConnected) failed.push(img.currentSrc || img.src);
        }),
      ),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return window.__checkImages?.(failed) ?? failed;
  }, frame);

  if (broken.length) throw new Error(brokenImageMessage(broken));
}

/**
 * What a captured file is called.
 *
 * The template is always in it, including for the tape, so that four files for
 * one bout sitting in .renders/ say which is which without anybody having to
 * remember the order they were made in. The corner only where it is not the
 * default, because it means nothing for the three templates that draw both.
 */
function outputName(bout, templateId = template) {
  return `${slug}-bout-${bout}-${templateId}${corner === "red" ? "" : `-${corner}`}`;
}

async function renderStill(bout, frame) {
  await mkdir(".stills", { recursive: true });
  const file = path.join(".stills", `${outputName(bout)}-frame-${frame}.png`);
  await withPage(async (page) => {
    await openBout(page, bout);
    await seek(page, frame);
    await page.screenshot({ path: file, type: "png" });
  });
  console.log(file);
}

async function renderBout(bout, templateId = template) {
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${outputName(bout, templateId)}.mp4`);

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
    //
    // Both spellings, because they do different amounts. ffmpeg's own flags set
    // the frame properties and, in the build this was checked against, reach the
    // bitstream as the matrix and nothing else — ffprobe reports bt709 for the
    // colour space and "unknown" for the primaries and the transfer. The x264
    // parameters are what actually write all three into the VUI. Checked with
    // ffprobe rather than assumed.
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709",
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
  try {
    await withPage(async (page) => {
      const duration = await openBout(page, bout, slug, templateId);
      process.stdout.write(`bout ${bout} ${templateId}: ${duration} frames `);

      for (let frame = 0; frame < duration; frame += 1) {
        await seek(page, frame);
        const shot = await page.screenshot({ type: "jpeg", quality, optimizeForSpeed: true });
        if (!ffmpeg.stdin.write(shot)) {
          await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
        }
        if (frame % 60 === 0) process.stdout.write(".");
      }
    });
  } catch (error) {
    // ffmpeg is already waiting on a stdin nobody is going to write to again,
    // and Node will not exit while a child holds an open pipe. A capture that
    // threw used to leave the whole run hanging with no output at all, which
    // reads as a slow render rather than as a failure that has already happened.
    ffmpeg.stdin.destroy();
    ffmpeg.kill();
    throw error;
  }

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
async function publishBout(eventId, bout, templateId, file, hash, previousKey) {
  const key = renderKeyFor(slug, bout, templateId, hash);
  await run("npx", [
    "wrangler", "r2", "object", "put", `${BUCKET}/${key}`,
    "--file", file,
    "--content-type", "video/mp4",
    scope,
  ]);
  await finishJob(eventId, bout, templateId, {
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

/** What --list prints, for one bout in one composition. The dashboard's six words. */
function stateOf(target) {
  if (target.held) return "running";
  if (target.job?.status === "queued") return "queued";
  if (target.job?.status === "failed") {
    return target.job.attempts < MAX_RENDER_ATTEMPTS ? "failed, will try again" : "failed";
  }
  if (target.rendered && target.rendered === target.hash) return "current";
  return target.playable ? "stale" : "missing";
}

/**
 * The bouts an unattended run should do something about.
 *
 * Wider than "the fingerprint moved", because the promoter's own button queues a
 * bout without changing it. Asking for a bout that is already current to be made
 * again is a reasonable thing to want, and a run that skipped it would leave the
 * dashboard saying "queued" until somebody typed a bout number.
 */
function wantsRendering(target) {
  if (target.held) return false;
  if (target.job?.status === "queued") return true;
  if (
    (target.job?.status === "failed" || target.job?.status === "running") &&
    target.job.attempts < MAX_RENDER_ATTEMPTS
  ) {
    return true;
  }
  return target.rendered !== target.hash;
}

async function main() {
  const still = arg("still");
  const boutArg = arg("bout");

  /**
   * Only what the programme carries may be published.
   *
   * `render_jobs` holds a row per bout per template now, so the tape and the
   * promo have a key each and cannot write over one another. A walkout still
   * cannot: it is one video per corner and the row carries no corner, so
   * publishing one would replace the bout's promo and read as current
   * afterwards. Refusing here is cheaper than finding out from a venue.
   */
  const unpublishable = wantedTemplates.filter((id) => !isPublishedTemplate(id));
  if (publish && unpublishable.length) {
    throw new Error(
      `--template ${unpublishable[0]} cannot be published: render_jobs carries a bout and a ` +
        "template, but no corner, so a walkout would replace the bout's promo and read as " +
        "current. Drop --publish to render a sample to a file.",
    );
  }

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
    // Both compositions of every bout, whatever --template says: a list is what
    // somebody reads to find out what the card is missing, and one showing half
    // of each bout would answer a question nobody asked.
    for (const target of targetsOf(all, PUBLISHED_TEMPLATES)) {
      console.log(
        `  bout ${String(target.number).padStart(2)}  ${target.template.padEnd(7)}  ` +
          `${stateOf(target)}` +
          `${target.pendingCutout ? "  (cutout to make)" : ""}` +
          `${target.job?.error ? `\n      ${target.job.error}` : ""}`,
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
    const named = all.filter((b) => b.number === Number(boutArg));
    if (!named.length) throw new Error(`Bout ${boutArg} is not on "${slug}"`);
    wanted = targetsOf(named, wantedTemplates);
    force = true;
  } else if (arg("stale")) {
    wanted = targetsOf(all, wantedTemplates).filter(wantsRendering);
    if (!wanted.length) console.log("Every video on this card is already current.");
  } else if (arg("all")) {
    wanted = targetsOf(all, wantedTemplates);
    force = true;
  } else {
    console.error(
      "Pass --slug <event-slug> and one of --list, --bout <n>, --stale, --all,\n" +
        "or --bout <n> --still <frame>.\n" +
        "--stale takes the bouts that are queued, out of date, or worth another\n" +
        "attempt; --all takes every bout on the card.\n" +
        "Cutouts are made first unless --no-cutouts; --refresh-cutouts remakes\n" +
        "the ones that already exist.\n" +
        "Every bout is made in both published compositions — the tale of the tape\n" +
        "and the promo — unless --template <id> names one. --corner red|blue picks\n" +
        "the fighter where a template is about one, and a template the programme\n" +
        "does not carry is a sample to a file: --publish refuses it.",
    );
    return 1;
  }

  const eventId = publish ? await eventIdOf(slug) : null;
  let failures = 0;

  for (const target of wanted) {
    const { number, template: id } = target;
    // Without --publish nothing is recorded, so there is nothing to claim: it is
    // a dry run to a file, and two of those colliding costs nobody anything.
    if (publish && !(await claim(eventId, number, id, target.hash, { force }))) {
      console.log(`bout ${number} ${id}: left to another runner (${stateOf(target)})`);
      continue;
    }

    try {
      const file = await renderBout(number, id);
      if (publish) {
        await publishBout(eventId, number, id, file, target.hash, target.job?.currentR2Key);
      }
    } catch (error) {
      // One bad video does not stop the other twenty-nine, and whatever that
      // bout already had stays on the programme — a promo that will not render
      // must not take the tale of the tape with it. The exit code carries the
      // failure, which is what a cron and a workflow actually read.
      failures += 1;
      console.error(`bout ${number} ${id}: ${error.message}`);
      if (publish) {
        await finishJob(eventId, number, id, {
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
