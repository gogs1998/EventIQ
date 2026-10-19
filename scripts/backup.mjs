/**
 * Exports the live D1 database and puts the file in R2.
 *
 *   npm run db:backup                    # export, upload as backups/<today>.sql
 *   npm run db:backup -- --out backups   # and keep a copy on this machine
 *   npm run db:backup -- --dry-run       # export and check it, upload nothing
 *   npm run db:backup -- --env staging   # the staging database, into its bucket
 *
 * D1 has time travel for thirty days, which is a recovery mechanism and not a
 * backup: it lives inside the same account, it cannot be inspected without
 * restoring, and it says nothing about a database that was quietly wrong for a
 * fortnight. This produces a plain .sql file somebody can open, diff and count
 * rows in.
 *
 * It runs nightly from .github/workflows/backup.yml, with the repository's
 * Cloudflare token, followed by a restore rehearsal of the file it uploaded and
 * then scripts/prune-backups.mjs. It is still a script first, so the same
 * command works from a laptop or a cron line — see DEPLOY.md.
 *
 * Two honest limits, both in DEPLOY.md as well:
 *   - R2 is in the same Cloudflare account as D1, so this protects against a bad
 *     migration or a wrong DELETE, and not against losing the account. Use
 *     --out on a machine you control for that half.
 *   - Nothing here prunes. scripts/prune-backups.mjs does, by exact key, and
 *     the R2 lifecycle rule is the backstop; DEPLOY.md has both.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { environmentFrom } from "./environments.mjs";
import { localBin } from "./local-bin.mjs";

const PREFIX = "backups";

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

// Each environment's export goes into its own bucket. A staging backup landing
// on top of a production one under the same key would be the one file nobody
// checks quietly becoming the wrong file.
const { database: DATABASE, bucket: BUCKET } = environmentFrom(args, (message) => fail(message));

function wrangler(commandArgs) {
  execFileSync(...localBin(["wrangler", ...commandArgs]), { stdio: "inherit" });
}

// UTC, so a backup taken at half past midnight in one timezone and half past
// eleven in another does not overwrite yesterday's.
const date = new Date().toISOString().slice(0, 10);

const outDir = value("out");
if (outDir) mkdirSync(outDir, { recursive: true });
const file = path.join(outDir ?? mkdtempSync(path.join(tmpdir(), "eventiq-backup-")), `${date}.sql`);

if (!process.env.CLOUDFLARE_API_TOKEN) {
  fail(
    "CLOUDFLARE_API_TOKEN is not set, so there is nothing to export from.",
    "",
    "  export CLOUDFLARE_API_TOKEN=...",
    "  export CLOUDFLARE_ACCOUNT_ID=...",
  );
}

console.log(`Exporting the remote ${DATABASE} database`);
try {
  wrangler(["d1", "export", DATABASE, "--remote", "--output", file, "--skip-confirmation"]);
} catch (error) {
  fail(`The export failed, so no backup was taken: ${error.message}`);
}

// An empty file and a file full of an error message both exit zero somewhere in
// a pipeline. A backup nobody checked is a backup nobody has.
const bytes = statSync(file).size;
const head = readFileSync(file, "utf8").slice(0, 4000);
if (bytes === 0 || !/CREATE TABLE/i.test(head)) {
  fail(
    `The export is ${bytes} bytes and does not look like a schema, so it has not been uploaded.`,
    "",
    `The file is at ${file} if you want to look at it.`,
  );
}
console.log(`  ${file} — ${(bytes / 1024).toFixed(0)}KB`);

const key = `${PREFIX}/${date}.sql`;
if (has("dry-run")) {
  console.log(`\nWould upload it to ${BUCKET}/${key}. Nothing was uploaded.`);
  process.exit(0);
}

console.log(`\nUploading to ${BUCKET}/${key}`);
try {
  wrangler([
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--file",
    file,
    "--remote",
    "--content-type",
    "application/sql",
    // Skips the data catalog prompt, so this runs unattended from cron.
    "--force",
  ]);
} catch (error) {
  fail(
    `The upload failed: ${error.message}`,
    "",
    `The export itself is fine and is at ${file}. Put it somewhere before that`,
    "temporary directory is cleared.",
  );
}

// The workflow rehearses exactly the file this run uploaded, rather than
// working the date out again and finding a different one after midnight.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `date=${date}\nkey=${key}\n`);

console.log(
  [
    "",
    `Backed up to ${BUCKET}/${key}.`,
    outDir ? `A copy is at ${file}.` : "",
    "",
    "Rehearse restoring it — a backup nobody has restored is a hope:",
    `  npm run db:restore-rehearsal -- --date ${date}`,
  ]
    .filter(Boolean)
    .join("\n"),
);
