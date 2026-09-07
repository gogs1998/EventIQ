/**
 * Restores a backup into a throwaway local database and counts what came back.
 *
 *   npm run db:restore-rehearsal -- --date 2026-09-07   # fetch it from R2 first
 *   npm run db:restore-rehearsal -- --file backups/2026-09-07.sql
 *   npm run db:restore-rehearsal -- --file <path> --keep # leave the scratch db
 *
 * A backup nobody has restored is a hope. This is the cheapest way to find out
 * that the export is truncated, or that it exports a schema and no rows, or that
 * it cannot be fed back into the thing it came out of — all of which are silent
 * until the day somebody needs it.
 *
 * It restores into a **scratch Miniflare state directory**, never into the local
 * development database. The export carries CREATE TABLE statements, so pointing
 * it at .wrangler would collide with the tables already there and, if it did
 * not, would replace the card you were working on. Nothing here touches the
 * remote database at all; the only remote call is the read that fetches the file.
 *
 * **A D1 export cannot be fed straight back in, and finding that out is the
 * first thing this script was worth.** `wrangler d1 export` writes one table at
 * a time in alphabetical order, so `bouts` rows arrive before the `sponsors`
 * table they point at exists. The file opens with `PRAGMA defer_foreign_keys`
 * for exactly this, and `wrangler d1 execute --file` runs each statement in its
 * own transaction, so the pragma is spent before the second statement — as is
 * `PRAGMA foreign_keys=OFF`, which D1 ignores outright. The statements are
 * therefore reordered here: every CREATE first, then the inserts in the order
 * the foreign keys imply, worked out from the schema in the file rather than
 * from a list somebody has to remember to update. A real restore has to do the
 * same thing; see DEPLOY.md.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";
const BUCKET = "eventiq-media";

/**
 * The tables a restored EventIQ database cannot sensibly be empty in.
 *
 * Not every table: analytics_events is legitimately empty on a card nobody has
 * opened yet, and render_jobs is empty until somebody renders. These five are
 * the show itself, and a zero in any of them means the export did not carry the
 * data even if it carried the schema.
 */
const MUST_HAVE_ROWS = ["promoters", "events", "bouts", "fighters", "invites"];
const ALSO_COUNT = ["sponsors", "fighter_sponsors", "event_sponsors", "render_jobs", "analytics_events"];

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);
const value = (flag) => {
  const at = args.indexOf(`--${flag}`);
  return at === -1 ? undefined : args[at + 1];
};

function fail(...lines) {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

/**
 * `quiet` swallows stdout. Wrangler prints a JSON result object per statement,
 * and a restore is a few hundred statements, which buries the counts this script
 * exists to print. Failures still surface: execFileSync throws on a non-zero
 * exit and stderr is inherited throughout.
 */
function wrangler(commandArgs, { capture = false, quiet = false } = {}) {
  return execFileSync(...localBin(["wrangler", ...commandArgs]), {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : ["inherit", quiet ? "ignore" : "inherit", "inherit"],
  });
}

const tableIn = (statement) =>
  /^(?:CREATE TABLE(?: IF NOT EXISTS)?|INSERT INTO)\s+[`"]?(\w+)[`"]?/i.exec(statement)?.[1];

/**
 * The export, reordered into something that will actually load.
 *
 * Tables are emitted parents-first, worked out by reading the REFERENCES
 * clauses out of the CREATE TABLE statements the export itself carries. Doing it
 * from the file rather than from a hardcoded list means adding a table to
 * db/schema.ts does not quietly break the restore path six months later — the
 * one property this script exists to have.
 *
 * PRAGMA and sqlite_sequence housekeeping are dropped: neither survives
 * statement-at-a-time execution, and leaving them in only produces an error
 * about a table nobody created.
 */
function loadable(sql) {
  const statements = sql
    .split(/;\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const creates = statements.filter((s) => /^CREATE/i.test(s));
  const inserts = statements.filter((s) => /^INSERT INTO/i.test(s));

  // table -> the tables it points at
  const parents = new Map();
  for (const create of creates.filter((s) => /^CREATE TABLE/i.test(s))) {
    const table = tableIn(create);
    if (!table) continue;
    const refs = [...create.matchAll(/REFERENCES\s+[`"]?(\w+)[`"]?/gi)]
      .map((m) => m[1])
      .filter((ref) => ref !== table);
    parents.set(table, new Set(refs));
  }

  const order = [];
  const seen = new Set();
  const visit = (table) => {
    if (seen.has(table)) return;
    seen.add(table);
    for (const parent of parents.get(table) ?? []) visit(parent);
    order.push(table);
  };
  for (const table of parents.keys()) visit(table);

  const rank = (statement) => {
    const at = order.indexOf(tableIn(statement) ?? "");
    // A table the schema section did not describe — d1_migrations, say — has
    // nothing pointing at it, so it can go first.
    return at === -1 ? -1 : at;
  };

  const sorted = [...inserts].sort((a, b) => rank(a) - rank(b));
  return [...creates, ...sorted].join(";\n") + ";\n";
}

const scratch = mkdtempSync(path.join(tmpdir(), "eventiq-rehearsal-"));
let file = value("file");
const date = value("date");

if (!file && !date) {
  fail(
    "Say which backup to rehearse:",
    "",
    "  npm run db:restore-rehearsal -- --date 2026-09-07",
    "  npm run db:restore-rehearsal -- --file backups/2026-09-07.sql",
  );
}

if (!file) {
  file = path.join(scratch, `${date}.sql`);
  console.log(`Fetching ${BUCKET}/backups/${date}.sql`);
  try {
    wrangler(["r2", "object", "get", `${BUCKET}/backups/${date}.sql`, "--file", file, "--remote"]);
  } catch (error) {
    fail(
      `Could not fetch that backup: ${error.message}`,
      "",
      "List what is there with:",
      `  npx wrangler r2 object get ${BUCKET}/backups/<date>.sql --file - --remote`,
    );
  }
}

const bytes = statSync(file).size;
console.log(`Restoring ${file} (${(bytes / 1024).toFixed(0)}KB) into a scratch database`);

const ordered = path.join(scratch, "ordered.sql");
writeFileSync(ordered, loadable(readFileSync(file, "utf8")));

try {
  wrangler(["d1", "execute", DATABASE, "--local", "--persist-to", scratch, "--file", ordered, "--yes"], {
    quiet: true,
  });
} catch (error) {
  fail(
    `The restore failed, which means this backup is not one: ${error.message}`,
    "",
    "That is the whole point of rehearsing it. Take a fresh export and try again",
    "before relying on the ones already in the bucket.",
  );
}

const tables = [...MUST_HAVE_ROWS, ...ALSO_COUNT];
// One statement per table rather than one UNION ALL over all of them: D1 caps
// the terms in a compound SELECT well below ten, and the error it gives back
// ("too many terms in compound SELECT") reads like a broken query rather than
// like a limit. Wrangler returns one result object per statement.
const counts = tables.map((table) => `SELECT count(*) AS n FROM ${table}`).join("; ");

let rows;
try {
  const out = wrangler(
    ["d1", "execute", DATABASE, "--local", "--persist-to", scratch, "--json", "--command", counts],
    { capture: true },
  );
  const results = JSON.parse(out);
  rows = tables.map((name, at) => ({ name, n: results[at]?.results?.[0]?.n ?? 0 }));
} catch (error) {
  fail(`Restored, but the row counts could not be read back: ${error.message}`);
}

console.log("");
for (const { name, n } of rows) console.log(`  ${String(name).padEnd(18)} ${n}`);

const empty = rows.filter((row) => MUST_HAVE_ROWS.includes(row.name) && row.n === 0).map((row) => row.name);

if (!has("keep")) rmSync(scratch, { recursive: true, force: true });

if (empty.length > 0) {
  fail(
    `Restored, and ${empty.join(", ")} came back empty.`,
    "",
    "The schema survived and the rows did not, which is the failure this rehearsal",
    "exists to catch — an export like that restores without an error and gives you",
    "back a database with no show in it.",
  );
}

console.log(
  [
    "",
    "Restored and counted. The backup is usable.",
    has("keep") ? `The scratch database is at ${scratch}; delete it when you are done.` : "",
  ]
    .filter(Boolean)
    .join("\n"),
);
