/**
 * Deletes nightly backups that have aged out of the retention window.
 *
 *   npm run db:prune-backups                      # dry run: names what it would delete
 *   npm run db:prune-backups -- --apply           # delete them
 *   npm run db:prune-backups -- --keep 30 --apply # the default, written out
 *
 * Thirty daily exports are kept. Wrangler cannot list a bucket, so this does not
 * look at what is there and decide: it names exact keys, `backups/<date>.sql`
 * for each of the fourteen days after the window closes, and deletes those. A
 * key that is not there is a no-op. That shape is deliberate — a pruner that
 * matches by pattern is a pruner that can match the wrong thing, and the bucket
 * this runs against also holds every fighter's photograph.
 *
 * The fourteen-day reach means a fortnight of missed nights still catches up.
 * Anything older than that is left for the R2 lifecycle rule on `backups/`,
 * which is the backstop (DEPLOY.md, "The R2 lifecycle rule").
 *
 * The nightly workflow runs this only after that night's export has been
 * uploaded and restored, so a night whose backup failed deletes nothing.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { environmentFrom } from "./environments.mjs";
import { localBin } from "./local-bin.mjs";

export const KEEP_DAYS = 30;
export const REACH_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The keys that have fallen out of a `keep`-day window as of `today`, oldest
 * last. Today's backup is day zero, so keep=30 leaves thirty files in place:
 * today and the twenty-nine before it.
 */
export function expiredBackupKeys(today, keep = KEEP_DAYS, reach = REACH_DAYS) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`keep has to be a whole number of days, got ${keep}`);
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const keys = [];
  for (let age = keep; age < keep + reach; age++) {
    keys.push(`backups/${new Date(midnight - age * DAY_MS).toISOString().slice(0, 10)}.sql`);
  }
  return keys;
}

function main() {
  const args = process.argv.slice(2);
  const fail = (message) => {
    console.error(`\n${message}\n`);
    process.exit(1);
  };
  const { bucket: BUCKET } = environmentFrom(args, fail);

  const at = args.indexOf("--keep");
  const keep = at === -1 ? KEEP_DAYS : Number(args[at + 1]);
  if (!Number.isInteger(keep) || keep < 7) {
    fail(`--keep ${args[at + 1]} is not a retention anybody meant. Use a whole number of days, at least 7.`);
  }

  const keys = expiredBackupKeys(new Date(), keep);
  const apply = args.includes("--apply");
  console.log(`Keeping ${keep} days of ${BUCKET}/backups/. ${apply ? "Deleting" : "Would delete"}, where present:`);
  for (const key of keys) {
    console.log(`  ${key}`);
    if (!apply) continue;
    execFileSync(...localBin(["wrangler", "r2", "object", "delete", `${BUCKET}/${key}`, "--remote"]), {
      stdio: ["ignore", "ignore", "inherit"],
    });
  }
  console.log(apply ? "\nDone." : "\nNothing was deleted. Add --apply to do it.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
