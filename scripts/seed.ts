/**
 * Seeds the database from the demo fixture.
 *
 *   npm run db:seed              # local Miniflare D1 under .wrangler
 *   npm run db:seed:remote       # the real D1 database
 *
 * The SQL is generated here and piped straight into wrangler rather than being
 * written to a file in the repository. Invite tokens are the entire security of
 * a fighter's questionnaire, so a committed seed file would be a list of working
 * credentials sitting in a public repository.
 *
 * Runs under Node's type stripping with the alias resolver in
 * scripts/ts-alias-loader.mjs, so it can share lib/seed.ts with the app. That
 * sharing is the point: the card that gets seeded and the card the tests assert
 * against are built from the same code.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { event, fighters, sponsors } from "@/data/event";
import { hashPassword } from "@/lib/auth";
import { buildSeed } from "@/lib/seed";
import { devVars } from "./dev-vars.mjs";

const remote = process.argv.includes("--remote");

/**
 * Development default. Fine for a local database that only ever holds invented
 * fighters; the remote seed refuses to run without a real one, because a known
 * password on a live promoter account is the same as no password.
 */
const DEV_PASSWORD = "cagecounty";

// Locally, .dev.vars wins, because that is the file the server reads and a
// password the server will not accept is worse than useless. Remotely there is
// no such file and the environment is the only source.
const password = remote
  ? (process.env.SEED_PROMOTER_PASSWORD ?? "")
  : (devVars().SEED_PROMOTER_PASSWORD ?? process.env.SEED_PROMOTER_PASSWORD ?? DEV_PASSWORD);

if (!password) {
  console.error(
    "SEED_PROMOTER_PASSWORD must be set when seeding the remote database.\n" +
      "  SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote",
  );
  process.exit(1);
}

const renderedBouts = event.bouts
  .map((bout) => bout.number)
  .filter((n) => existsSync(path.join(process.cwd(), "public", "renders", `bout-${n}.mp4`)));

const { sql, inviteLinks } = buildSeed({
  event,
  fighters,
  sponsors,
  passwordHash: await hashPassword(password),
  renderedBouts,
  now: Date.now(),
});

// A file rather than --command, because the seed is a few hundred statements and
// D1's command flag takes one.
const file = path.join(mkdtempSync(path.join(tmpdir(), "eventiq-seed-")), "seed.sql");
writeFileSync(file, sql);

// Wrangler prints a JSON result object per statement, which for a few hundred
// statements buries the invite links this script exists to show. Swallowed on
// success, surfaced by execFileSync throwing on failure.
execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "eventiq", remote ? "--remote" : "--local", "--file", file, "--yes"],
  { stdio: ["inherit", "ignore", "inherit"] },
);

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
console.log(`\nSeeded ${event.name}: ${event.bouts.length} bouts, ${inviteLinks.length} invites.`);
console.log(`Promoter sign in at ${site}/promoter/login as "cage-county".`);
// Printed for the local database only. It holds invented fighters and the
// alternative is guessing which of .dev.vars and the shell won.
if (!remote) console.log(`The password is "${password}".`);
console.log(`\nA few invite links, for trying the questionnaire:`);
for (const { fighter, token } of inviteLinks.slice(0, 3)) {
  console.log(`  ${fighter.padEnd(18)} ${site}/f/${token}`);
}
console.log(`\nThe rest are on the promoter dashboard once you are signed in.`);
