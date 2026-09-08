/**
 * Clears fighters nobody is putting on a card any more.
 *
 *   npm run retention                          # local, dry run
 *   npm run retention -- --apply               # local, for real
 *   npm run retention -- --remote --apply      # against the deployed database
 *   npm run retention -- --days 90 --remote
 *
 * The policy this enforces is the one the questionnaire's notice and /privacy
 * both state, and it takes the number of days from the same constant they do
 * (RETENTION_DAYS in lib/consent.ts), so a fighter cannot be told one figure and
 * swept at another.
 *
 * **Who it takes.** A fighter whose latest connection to any show — through a
 * bout on a card or through an invite that was issued to them — is older than
 * the cutoff. A fighter still on a card for a show that has not happened is
 * therefore never touched, however old their other shows are, and a fighter
 * orphaned by a bout being removed is still reachable through their invite and
 * so still has a date. Anyone with no show at all is measured from when the row
 * was created, because there is nothing else true to measure them by.
 *
 * **What it does to them.** Exactly what "Remove my details" does: every field
 * they sent set back to null, their sponsor choices deleted, their photograph,
 * cutout and stylised portrait deleted out of the bucket, and any invite of
 * theirs revoked. The name and the gym stay, because those are the promoter's
 * running order rather than the fighter's answers and clearing them would leave
 * a hole in a published card. lib/consent.ts holds that column list for both.
 *
 * **Dry run by default.** It prints who it would take and changes nothing until
 * `--apply`. A retention sweep is the one script here that destroys data on
 * purpose, so the default has to be the one that cannot.
 *
 * Do not run this against `--local` while `npm run dev` is up: it is a second
 * writer on the same Miniflare database and it loses. Stop the server first.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RETENTION_DAYS, clearedFighterColumns } from "@/lib/consent";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";
const BUCKET = "eventiq-media";

/** camelCase on the drizzle model, snake_case on disk. One place, so they agree. */
const COLUMN_NAMES = {
  nickname: "nickname",
  hometown: "hometown",
  age: "age",
  heightCm: "height_cm",
  reachCm: "reach_cm",
  stance: "stance",
  photo: "photo",
  cutout: "cutout",
  stylised: "stylised",
  instagram: "instagram",
  recordW: "record_w",
  recordL: "record_l",
  recordD: "record_d",
  finishKo: "finish_ko",
  finishSub: "finish_sub",
  walkoutTitle: "walkout_title",
  walkoutArtist: "walkout_artist",
  bio: "bio",
  styleTags: "style_tags",
};

// --------------------------------------------------------------- pure parts

/** Single-quoted SQL literal. Operator input, but there is no reason to trust it. */
export const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** The calendar day N days before this instant, as the ISO text events.date holds. */
export function cutoffDate(now, days) {
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Whether this row is past the cutoff.
 *
 * The two dates are ISO `YYYY-MM-DD`, which sorts as text, so the latest of them
 * is a plain comparison. Null on both means the fighter has never been attached
 * to a show and is measured from when the row was made instead.
 */
export function pastRetention(row, cutoff, cutoffMs) {
  const last = [row.on_card, row.invited].filter(Boolean).sort().pop();
  if (last) return last < cutoff;
  return Number(row.created_at) < cutoffMs;
}

/** Nothing left to clear. Reported separately, so a re-run reads as a no-op rather than as work. */
export function alreadyClear(row) {
  return Number(row.already_clear) === 1;
}

/** The objects in the bucket that belong to this fighter. Committed assets are not ours. */
export function bucketKeys(row) {
  return [row.photo, row.cutout, row.stylised]
    .filter((value) => typeof value === "string" && value.startsWith("/media/"))
    .map((value) => value.slice("/media/".length))
    .filter((key) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) && !key.includes(".."));
}

/** The statements that clear one fighter. The same set the removal action writes. */
export function clearStatements(id, now) {
  const columns = clearedFighterColumns(now);
  const assignments = Object.entries(COLUMN_NAMES)
    .map(([key, column]) => `${column} = ${columns[key] === null ? "NULL" : lit(columns[key])}`)
    .concat(`updated_at = ${now}`)
    .join(", ");

  return [
    `UPDATE fighters SET ${assignments} WHERE id = ${lit(id)};`,
    `DELETE FROM fighter_sponsors WHERE fighter_id = ${lit(id)};`,
    `UPDATE invites SET revoked_at = ${now} WHERE fighter_id = ${lit(id)} AND revoked_at IS NULL;`,
  ];
}

// --------------------------------------------------------------- plumbing

function run(command, args) {
  // "npx" is a batch file on Windows and cannot be spawned directly; see local-bin.mjs.
  if (command === "npx") [command, args] = localBin(args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    // Both streams on a failure: wrangler reports a SQL error on stdout, so an
    // error message built from stderr alone says only that something exited 1.
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`wrangler exited ${code}: ${(err + out).trim() || "no output"}`)),
    );
  });
}

function d1Query(sql, scope) {
  return run("npx", ["wrangler", "d1", "execute", DATABASE, scope, "--json", "--command", sql]).then(
    (raw) => JSON.parse(raw)[0]?.results ?? [],
  );
}

/**
 * Several statements at once, through a file.
 *
 * `--command` takes one statement; a sweep is three per fighter and wants to be
 * one transaction's worth of work rather than a hundred wrangler invocations.
 */
async function d1Script(sql, scope) {
  const dir = await mkdtemp(path.join(tmpdir(), "eventiq-retention-"));
  const file = path.join(dir, "retention.sql");
  try {
    await writeFile(file, sql, "utf8");
    await run("npx", ["wrangler", "d1", "execute", DATABASE, scope, "--file", file]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Every fighter, with the latest show they are attached to and whether there is
 * anything left on them to clear. One query: this is a sweep rather than a page,
 * and a per-fighter round trip to wrangler would take minutes on a real database.
 */
const CANDIDATES_SQL = `
  SELECT f.id AS id,
         f.name AS name,
         f.photo AS photo,
         f.cutout AS cutout,
         f.stylised AS stylised,
         f.created_at AS created_at,
         (SELECT MAX(e.date) FROM bouts b JOIN events e ON e.id = b.event_id
           WHERE b.red_id = f.id OR b.blue_id = f.id) AS on_card,
         (SELECT MAX(e.date) FROM invites i JOIN events e ON e.id = i.event_id
           WHERE i.fighter_id = f.id) AS invited,
         (f.nickname IS NULL AND f.hometown IS NULL AND f.age IS NULL AND f.height_cm IS NULL
          AND f.reach_cm IS NULL AND f.stance IS NULL AND f.photo IS NULL AND f.cutout IS NULL
          AND f.stylised IS NULL AND f.instagram IS NULL AND f.record_w IS NULL
          AND f.finish_ko IS NULL AND f.walkout_title IS NULL AND f.walkout_artist IS NULL
          AND f.bio IS NULL AND f.style_tags IS NULL) AS already_clear
    FROM fighters f
   ORDER BY f.id`;

// ------------------------------------------------------------------- main

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

async function main() {
  const scope = arg("remote") ? "--remote" : "--local";
  const apply = Boolean(arg("apply"));
  const daysArg = arg("days");
  const days = daysArg && daysArg !== true ? Number(daysArg) : RETENTION_DAYS;
  if (!Number.isFinite(days) || days < 0) throw new Error("--days wants a number of days");

  const now = Date.now();
  const cutoff = cutoffDate(now, days);
  const cutoffMs = now - days * 86_400_000;

  const rows = await d1Query(CANDIDATES_SQL, scope);
  const past = rows.filter((row) => pastRetention(row, cutoff, cutoffMs));
  const due = past.filter((row) => !alreadyClear(row));

  console.log(
    `${rows.length} fighters, ${past.length} past ${days} days (last show before ${cutoff}), ` +
      `${due.length} with details still on them`,
  );

  for (const row of due) {
    const last = [row.on_card, row.invited].filter(Boolean).sort().pop() ?? "no show";
    const keys = bucketKeys(row);
    console.log(
      `  ${apply ? "clearing" : "would clear"} ${row.id.padEnd(24)} last ${last}` +
        `${keys.length ? `, ${keys.length} object${keys.length === 1 ? "" : "s"}` : ""}`,
    );
  }

  if (!due.length) return;

  if (!apply) {
    console.log("\nDry run. Nothing has been changed. Pass --apply to clear these.");
    return;
  }

  await d1Script(due.flatMap((row) => clearStatements(row.id, now)).join("\n"), scope);

  // After the database, so a delete that fails leaves an object nothing points
  // at rather than a row pointing at an object that has gone.
  let deleted = 0;
  let missed = 0;
  for (const key of due.flatMap(bucketKeys)) {
    try {
      await run("npx", ["wrangler", "r2", "object", "delete", `${BUCKET}/${key}`, scope]);
      deleted += 1;
    } catch (error) {
      missed += 1;
      console.log(`  could not delete ${key}: ${error.message.split("\n")[0]}`);
    }
  }

  console.log(
    `\n${due.length} cleared, ${deleted} objects deleted` +
      `${missed ? `, ${missed} left in the bucket` : ""}`,
  );
}

// Only when run directly, so the pure parts above can be imported by a test.
// Through pathToFileURL because a Windows path is not a file URL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
