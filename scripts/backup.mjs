/**
 * Exports the live D1 database and puts the file in R2.
 *
 *   npm run db:backup                    # export, upload as backups/<today>.sql
 *   npm run db:backup -- --out backups   # and keep a copy on this machine
 *   npm run db:backup -- --dry-run       # export and check it, upload nothing
 *
 * D1 has time travel for thirty days, which is a recovery mechanism and not a
 * backup: it lives inside the same account, it cannot be inspected without
 * restoring, and it says nothing about a database that was quietly wrong for a
 * fortnight. This produces a plain .sql file somebody can open, diff and count
 * rows in.
 *
 * It is deliberately a script rather than a workflow, because the thing it needs
 * is a token with D1 and R2 edit rights and there is no good reason to put one
 * in a repository that does not otherwise hold any credentials. Scheduling is a
 * cron line on any machine that has the token — see DEPLOY.md.
 *
 * Two honest limits, both in DEPLOY.md as well:
 *   - R2 is in the same Cloudflare account as D1, so this protects against a bad
 *     migration or a wrong DELETE, and not against losing the account. Use
 *     --out on a machine you control for that half.
 *   - Nothing here prunes. The R2 lifecycle rule does; DEPLOY.md has the command.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";
const BUCKET = "eventiq-media";
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
