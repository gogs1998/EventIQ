/**
 * Folds the counting table into a row per day, and deletes what it folded.
 *
 *   npm run analytics:rollup                       # local, dry run
 *   npm run analytics:rollup -- --apply            # local, for real
 *   npm run analytics:rollup -- --remote --apply   # the live database
 *   npm run analytics:rollup -- --hours 0 --apply  # fold everything complete
 *
 * `analytics_events` is one row per tap and only ever grows, and every read of a
 * show's numbers scans its whole slice of it. That is the right shape while a
 * show is a few thousand rows and the wrong one by a promoter's third season, so
 * this sums each day into `analytics_daily` — same grouping columns, so nothing
 * a sponsor asks stops being answerable — and removes the rows it summed.
 *
 * **The dashboard's numbers do not move when this runs.** It reads the folded
 * days plus everything still in `analytics_events`, whole, and adds them
 * together (`analyticsStatements` in lib/db/queries.ts). Nothing is read from a
 * time boundary on either side, so the only thing the fold changes is which
 * table a count is sitting in.
 *
 * **The sum and the delete are not one transaction, and cannot be.** D1 runs
 * each statement of a file in its own transaction — the restore rehearsal found
 * that out about `PRAGMA defer_foreign_keys` and it is true of everything else
 * too. So the sum goes first, because a delete that then fails leaves a day
 * counted twice, which is visible and fixable, where the other order would lose
 * it. A run that is interrupted between the two is not repaired by running this
 * again: the second run would sum the same rows on top. It is detected instead —
 * a day that is both summed and still live refuses, and says what to delete.
 *
 * **Whole days only.** The cutoff is the start of the UTC day containing "48
 * hours ago", so a day is never half in one table and half in the other — which
 * is the case that would double-count a session that appeared on both sides. The
 * window is generous on purpose: nothing depends on folding promptly, and a
 * promoter reading the morning after their show is reading unfolded rows. It is
 * also what makes the check above sound: a day's rows are all written on that
 * day, so a day already in `analytics_daily` with live rows left underneath it
 * is an interrupted run rather than counting that arrived late.
 *
 * **Dry run by default**, like scripts/retention.mjs, because this deletes rows
 * that cannot be reconstructed from what is left.
 *
 * Do not run this against `--local` while `npm run dev` is up: it is a second
 * writer on the same Miniflare database and it loses. Stop the server first.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";

/**
 * How long a day is left alone. Two days rather than two hours because the value
 * of folding is in a season of counting rather than in yesterday's, and because
 * a wide window means the arithmetic never has to think about a row arriving for
 * a day that has already been summed.
 */
export const ROLLUP_HOURS = 48;

// --------------------------------------------------------------- pure parts

/**
 * The instant everything before is foldable: midnight UTC at the start of the
 * day that contains `now - hours`.
 *
 * Rounding down to a whole day is the point. Folding to the hour would leave a
 * day with some of its rows summed and some of them not, and the two halves
 * would each contribute their own count of distinct sessions for a day that only
 * had one set of spectators in it.
 */
export function foldBefore(now, hours = ROLLUP_HOURS) {
  const at = new Date(now - hours * 3_600_000);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}

/** The UTC day an instant falls in, as the ISO text `analytics_daily.day` holds. */
export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * What is waiting to be folded, per show and day, and whether that day has been
 * summed already.
 *
 * `summed` is the interrupted run: rows still live under a day that is in
 * `analytics_daily`. Read before anything is written, so the dry run says
 * exactly what would move and the real run can refuse rather than double it.
 */
export function foldableSql(before) {
  return `
    SELECT e.event_id AS event_id,
           date(e.created_at / 1000, 'unixepoch') AS day,
           COUNT(*) AS rows_folded,
           EXISTS (SELECT 1 FROM analytics_daily d
                    WHERE d.event_id = e.event_id
                      AND d.day = date(e.created_at / 1000, 'unixepoch')) AS summed
      FROM analytics_events e
     WHERE e.created_at < ${before}
     GROUP BY e.event_id, day
     ORDER BY day, e.event_id`;
}

/** A show-day that is summed and still live: the state a re-run must not touch. */
export function halfFolded(rows) {
  return rows.filter((row) => Number(row.summed) === 1);
}

/**
 * The sum itself.
 *
 * `date(created_at / 1000, 'unixepoch')` is the UTC calendar day: created_at is
 * an integer, so the division is integer division and the seconds are what
 * SQLite wants. Grouping by every column a row carries keeps the breakdown the
 * dashboard and any future report read — taps per sponsor, expands per bout,
 * views per fighter — and drops only the hour and the session id, which is the
 * one value in this table that was never meant to outlive the visit.
 */
export function sumSql(before) {
  return `INSERT INTO analytics_daily
       (event_id, day, kind, bout_number, fighter_id, sponsor_id, count, distinct_sessions)
     SELECT event_id,
            date(created_at / 1000, 'unixepoch'),
            kind,
            bout_number,
            fighter_id,
            sponsor_id,
            COUNT(*),
            COUNT(DISTINCT session_id)
       FROM analytics_events
      WHERE created_at < ${before}
      GROUP BY event_id, 2, kind, bout_number, fighter_id, sponsor_id`;
}

/** The same rows, by the same cutoff. Wider than the sum would be a lost day. */
export function removeSql(before) {
  return `DELETE FROM analytics_events WHERE created_at < ${before}`;
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
 * One statement, through a file rather than `--command`.
 *
 * The sum is several lines long and a Windows shell mangles it as an argument;
 * a file is the same thing scripts/retention.mjs does with its sweep.
 */
async function d1Statement(sql, scope) {
  const dir = await mkdtemp(path.join(tmpdir(), "eventiq-rollup-"));
  const file = path.join(dir, "rollup.sql");
  try {
    await writeFile(file, `${sql};`, "utf8");
    await run("npx", ["wrangler", "d1", "execute", DATABASE, scope, "--file", file]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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
  const hoursArg = arg("hours");
  const hours = hoursArg !== undefined && hoursArg !== true ? Number(hoursArg) : ROLLUP_HOURS;
  if (!Number.isFinite(hours) || hours < 0) throw new Error("--hours wants a number of hours");

  const before = foldBefore(Date.now(), hours);
  const pending = await d1Query(foldableSql(before), scope);
  const rows = pending.reduce((total, row) => total + Number(row.rows_folded), 0);

  console.log(
    `${rows} rows in ${pending.length} show-day${pending.length === 1 ? "" : "s"} ` +
      `before ${utcDay(before)} (${hours}h window)`,
  );
  for (const row of pending) {
    console.log(
      `  ${apply ? "folding" : "would fold"} ${String(row.event_id).padEnd(24)} ${row.day} ` +
        `${row.rows_folded} row${Number(row.rows_folded) === 1 ? "" : "s"}`,
    );
  }

  if (!rows) return;

  // Summed once already and still here: a previous run got the insert in and not
  // the delete. Summing again would put that day in the numbers twice, and no
  // later run could tell. The rows are already counted, so the repair is to
  // remove them, and an operator does that knowingly rather than a script doing
  // it on a guess about what happened last night.
  const half = halfFolded(pending);
  if (half.length) {
    const days = half.map((row) => `${row.event_id} ${row.day}`).join(", ");
    throw new Error(
      `${days} already counted in analytics_daily with rows left in analytics_events. ` +
        `A previous run was interrupted between the two. Those rows are counted, so remove ` +
        `them rather than folding again: DELETE FROM analytics_events WHERE created_at < ${before};`,
    );
  }

  if (!apply) {
    console.log("\nDry run. Nothing has been changed. Pass --apply to fold these.");
    return;
  }

  await d1Statement(sumSql(before), scope);
  try {
    await d1Statement(removeSql(before), scope);
  } catch (error) {
    throw new Error(
      `summed ${rows} rows but could not remove them, so this show is counted twice until ` +
        `they go: DELETE FROM analytics_events WHERE created_at < ${before}; (${error.message})`,
    );
  }
  console.log(`\n${rows} rows folded into analytics_daily and removed from analytics_events`);
}

// Only when run directly, so the pure parts above can be imported by a test.
// Through pathToFileURL because a Windows path is not a file URL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
