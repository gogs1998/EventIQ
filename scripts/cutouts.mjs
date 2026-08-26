/**
 * Cuts fighters out of their photographs, so the tale of the tape can move them
 * independently of the backdrop.
 *
 *   node scripts/cutouts.mjs --slug cage-county-12 --remote
 *   node scripts/cutouts.mjs --slug cage-county-12 --remote --refresh-cutouts
 *   node scripts/cutouts.mjs --slug cage-county-12 --remote --only nadia-farrukh
 *
 * **Why this is here and not in the upload.** A fighter uploads their photograph
 * from a phone, in a car park, on the way out of a session. Background removal is
 * an ONNX model and about three and a half seconds of CPU per image: in the
 * request path it would either hold their form open or, on their own device, fail
 * — and Workers cannot run the model at all, so the server side of that path does
 * not exist either. The renderer is already out of band, already on a machine
 * with ffmpeg, and already the thing that turns fighter data into video. So the
 * cutout is made where the video is made, and the questionnaire's only job is to
 * store the photograph.
 *
 * That means "a photograph and no cutout yet" is the ordinary state of a fighter
 * between submitting their form and the next render, which is why the sequence
 * falls back to the photograph rather than to the initialled plate. See
 * lib/portrait.ts.
 *
 * Two rules this file will not break:
 *
 * - **It never regenerates a cutout that exists.** A fifteen-bout card is thirty
 *   fighters and this is the slow step; a re-run has to cost nothing for the
 *   twenty-nine that have not changed. `--refresh-cutouts` is the way to ask.
 * - **It never fails a render.** A photograph the model cannot handle leaves the
 *   cutout null and says so on stdout, and the video shows the photograph. A
 *   fighter's face in a rectangle is a far better outcome than no video.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DATABASE = "eventiq";
const BUCKET = "eventiq-media";

/** Matches scripts/prepare-assets.mjs, so a curated cutout and a generated one look the same. */
const CUTOUT_WIDTH = 1000;
const CUTOUT_QUALITY = 88;

/**
 * Background removal is CPU-bound and in-process, so one pathological image can
 * hold up a whole card. The ceiling is generous — the model takes about three and
 * a half seconds on a normal portrait — and exists so the answer to a hung
 * decode is a logged failure and a photograph in the video.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Alpha coverage a usable cutout has to land between, measured over a 96x96
 * reduction of its alpha channel.
 *
 * The eleven curated cutouts in public/fighters sit between 0.56 and 0.65, so
 * these are not tight bounds on a good result — they are bounds on the two ways
 * the step can succeed and still be useless. Near zero means the subject was
 * erased along with the background, and the video would show an empty frame with
 * a name under it. Near one means nothing was removed, so what has been produced
 * is the photograph with an alpha channel: it would then be shown with the cutout
 * treatment, full parallax travel and its own four straight edges, which is worse
 * than the photograph fallback it displaced.
 */
const MIN_ALPHA = 0.04;
const MAX_ALPHA = 0.985;

// --------------------------------------------------------------- pure parts

/**
 * Where a fighter's photograph actually lives.
 *
 * Two shapes, and deliberately only two: the same two `sanitiseDraft` will store.
 * `/media/...` is an uploaded object in the bucket; `/fighters/...` is a static
 * asset committed under public/, which is what the seeded demo card has. Anything
 * else — an absolute URL, a blob: from a preview, a path we did not write — is
 * refused rather than guessed at, because this runs holding the account's
 * credentials and "fetch whatever the column says" is not a thing to build.
 */
export function photoSource(photo) {
  if (typeof photo !== "string") return null;
  if (photo.startsWith("/media/")) {
    const key = photo.slice("/media/".length);
    return key && !key.includes("..") ? { kind: "r2", key } : null;
  }
  if (photo.startsWith("/fighters/")) {
    const file = photo.slice("/fighters/".length);
    return file && !file.includes("/") && !file.includes("..")
      ? { kind: "static", path: path.join("public", "fighters", file) }
      : null;
  }
  return null;
}

/**
 * The key a cutout gets in the bucket.
 *
 * Fingerprinted on the photograph it was cut from, for the same reason the
 * uploaded photograph carries a random suffix: media is served with a one-year
 * cache, so a fighter who changes their picture must not keep seeing the previous
 * cutout. It also makes the write idempotent — refreshing an unchanged photograph
 * overwrites one object instead of leaving a trail of them.
 */
export function cutoutKey(fighterId, photo) {
  const digest = createHash("sha256").update(photo).digest("hex").slice(0, 8);
  return `cutouts/${fighterId}-${digest}.webp`;
}

/** A fighter needs cutting out when there is a photograph and no cutout of it. */
export function needsCutout(fighter, { refresh = false } = {}) {
  if (!fighter.photo) return false;
  if (!photoSource(fighter.photo)) return false;
  return refresh || !fighter.cutout;
}

/** What a measured alpha coverage means. Anything but "ok" leaves the cutout null. */
export function alphaVerdict(coverage) {
  if (!Number.isFinite(coverage)) return "unreadable";
  if (coverage < MIN_ALPHA) return "empty";
  if (coverage > MAX_ALPHA) return "untouched";
  return "ok";
}

/** Single-quoted SQL literal. Operator input, but there is no reason to trust it. */
export const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

// --------------------------------------------------------------- plumbing

function run(command, args, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    let err = "";
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(binary ? Buffer.concat(out) : Buffer.concat(out).toString("utf8"))
        : reject(new Error(`${command} exited ${code}${err ? `: ${err.trim()}` : ""}`)),
    );
  });
}

function d1(sql, scope) {
  return run("npx", [
    "wrangler",
    "d1",
    "execute",
    DATABASE,
    scope,
    "--json",
    "--command",
    sql,
  ]).then((raw) => JSON.parse(raw)[0]?.results ?? []);
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} gave up after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// --------------------------------------------------------------- the work

/**
 * Normalises whatever was uploaded into a PNG the model can read.
 *
 * The photograph may be a JPEG from a phone or a WebP from the committed assets,
 * and it may be any size. One ffmpeg pass makes the model's input predictable,
 * which is also what makes its runtime predictable.
 */
async function toPng(input, output) {
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `scale='min(${CUTOUT_WIDTH},iw)':-2:flags=lanczos`,
    "-frames:v",
    "1",
    output,
  ]);
}

/** The same output treatment as scripts/prepare-assets.mjs: transparent WebP, 1000px, q88. */
async function toCutoutWebp(input, output) {
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `scale=${CUTOUT_WIDTH}:-1,format=yuva420p`,
    "-c:v",
    "libwebp",
    "-q:v",
    String(CUTOUT_QUALITY),
    "-compression_level",
    "6",
    output,
  ]);
}

/**
 * Mean alpha of an image, 0 to 1, read off a 96x96 reduction of its alpha channel.
 *
 * `format=rgba` before `alphaextract` is not decoration. The model returns a
 * palettised PNG whose transparency is in a tRNS chunk rather than in a plane, and
 * `alphaextract` on that fails with "Requested planes not available" — which the
 * caller would have read as an unusable cutout for every single fighter.
 */
async function alphaCoverage(file) {
  const raw = await run(
    "ffmpeg",
    [
      "-v", "error",
      "-i", file,
      "-vf", "format=rgba,alphaextract,scale=96:96",
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-",
    ],
    { binary: true },
  );
  if (!raw.length) return NaN;
  let total = 0;
  for (const byte of raw) total += byte;
  return total / raw.length / 255;
}

async function fetchPhoto(source, into, scope) {
  if (source.kind === "static") return source.path;
  await run("npx", [
    "wrangler",
    "r2",
    "object",
    "get",
    `${BUCKET}/${source.key}`,
    "--file",
    into,
    scope,
  ]);
  return into;
}

/**
 * The fighters on a card, with whatever they have sent.
 *
 * Both corners of every bout, deduplicated, because the same person can appear
 * twice on a card and cutting them out twice would be two waits for one result.
 */
export async function cardFighters(slug, scope) {
  const rows = await d1(
    `SELECT f.id AS id, f.photo AS photo, f.cutout AS cutout, f.name AS name
       FROM fighters f
      WHERE f.id IN (
        SELECT b.red_id FROM bouts b JOIN events e ON e.id = b.event_id WHERE e.slug = ${lit(slug)}
        UNION
        SELECT b.blue_id FROM bouts b JOIN events e ON e.id = b.event_id WHERE e.slug = ${lit(slug)}
      )
      ORDER BY f.id`,
    scope,
  );
  return rows;
}

/**
 * Generates every missing cutout on a card and records it.
 *
 * Returns a summary rather than throwing: the caller is usually a render that
 * has fifteen videos to make, and one unreadable photograph is not a reason to
 * stop. Every fighter is attempted independently and every failure is printed
 * with the reason.
 */
export async function ensureCutouts({
  slug,
  scope,
  refresh = false,
  only = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  log = console.log,
}) {
  const all = await cardFighters(slug, scope);
  const wanted = all
    .filter((f) => (only ? only.includes(f.id) : true))
    .filter((f) => needsCutout(f, { refresh }));

  const summary = { considered: all.length, attempted: wanted.length, made: 0, failed: 0 };
  if (!wanted.length) return summary;

  log(`cutouts: ${wanted.length} to make (about ${(wanted.length * 3.5).toFixed(0)}s)`);

  const work = await mkdtemp(path.join(tmpdir(), "eventiq-cutout-"));
  try {
    for (const fighter of wanted) {
      try {
        const key = await makeCutout(fighter, { scope, work, timeoutMs });
        await recordCutout(fighter, key, scope);
        summary.made += 1;
        log(`  ${fighter.id}  ${key}`);
      } catch (error) {
        // Left null on purpose. The video falls back to the photograph, which is
        // the fighter's own face, and the next run tries again.
        summary.failed += 1;
        log(`  ${fighter.id}  no cutout: ${error.message}`);
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  return summary;
}

async function makeCutout(fighter, { scope, work, timeoutMs }) {
  const source = photoSource(fighter.photo);
  if (!source) throw new Error(`cannot read a photograph at "${fighter.photo}"`);

  const original = path.join(work, `${fighter.id}-original`);
  const normalised = path.join(work, `${fighter.id}-in.png`);
  const cut = path.join(work, `${fighter.id}-cut.png`);
  const webp = path.join(work, `${fighter.id}.webp`);

  const file = await fetchPhoto(source, original, scope);
  await toPng(file, normalised);

  // Imported here rather than at the top of the file so that requiring this
  // module — from the renderer, or from a test of the bookkeeping above — does
  // not load an ONNX runtime it may never use.
  const { removeBackground } = await import("@imgly/background-removal-node");
  const blob = await withTimeout(
    removeBackground(normalised, { output: { format: "image/png", quality: 0.95 } }),
    timeoutMs,
    "background removal",
  );
  await writeFile(cut, Buffer.from(await blob.arrayBuffer()));

  const verdict = alphaVerdict(await alphaCoverage(cut));
  if (verdict !== "ok") throw new Error(`background removal came back ${verdict}`);

  await toCutoutWebp(cut, webp);

  const key = cutoutKey(fighter.id, fighter.photo);
  await run("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--file",
    webp,
    "--content-type",
    "image/webp",
    scope,
  ]);
  return key;
}

/**
 * Records the cutout, and bumps `updated_at` so the render fingerprint moves.
 *
 * A previous cutout of ours at a different key is deleted, best effort. It is
 * only reachable through this column, so leaving it would be litter in a bucket
 * nobody audits; failing to delete it is not worth losing the cutout over.
 */
async function recordCutout(fighter, key, scope) {
  const media = `/media/${key}`;
  await d1(
    `UPDATE fighters SET cutout = ${lit(media)}, updated_at = ${Date.now()} WHERE id = ${lit(fighter.id)}`,
    scope,
  );

  if (fighter.cutout?.startsWith("/media/cutouts/") && fighter.cutout !== media) {
    await run("npx", [
      "wrangler",
      "r2",
      "object",
      "delete",
      `${BUCKET}/${fighter.cutout.slice("/media/".length)}`,
      scope,
    ]).catch(() => {});
  }
}

// ------------------------------------------------------------------- main

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

/**
 * Runnable on its own as well as folded into `npm run render`.
 *
 * It earns a command because it is the slow, network-facing, model-dependent half
 * of preparing a card, and the half that fails for reasons nothing else here
 * fails for. An operator who has just collected a run of photographs can prepare
 * every cutout in under two minutes and see exactly which ones did not work,
 * without also committing to a quarter of an hour of Chrome and ffmpeg — and
 * without a failure in the slow half being reported as a render that stopped.
 */
async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("Pass --slug <event-slug>");

  const scope = arg("remote") ? "--remote" : "--local";
  const only = arg("only");
  const timeout = arg("cutout-timeout");

  const summary = await ensureCutouts({
    slug,
    scope,
    refresh: Boolean(arg("refresh-cutouts")),
    only: typeof only === "string" ? only.split(",").map((s) => s.trim()) : null,
    timeoutMs: timeout && timeout !== true ? Number(timeout) : DEFAULT_TIMEOUT_MS,
  });

  console.log(
    `${summary.considered} on the card, ${summary.attempted} attempted, ` +
      `${summary.made} made, ${summary.failed} left without one`,
  );
}

// Only when run directly, so the renderer can import ensureCutouts.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
