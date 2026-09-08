/**
 * Seeds the database from the demo fixture.
 *
 *   npm run db:seed              # local Miniflare D1 under .wrangler
 *   npm run db:seed:remote -- --i-understand-this-rewrites-production
 *   npm run db:seed:remote -- --env staging --i-understand-this-rewrites-production
 *
 * The remote form wants that flag, a SEED_PROMOTER_PASSWORD, and a live database
 * holding nobody but the seeded promoter. All three are there because this is a
 * rewrite rather than an insert — see checkRemoteIsStillTheDemo below.
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
import { buildSeed, SEED_PROMOTER_SLUG } from "@/lib/seed";
import { devVars } from "./dev-vars.mjs";
import { environmentFrom } from "./environments.mjs";
import { localBin } from "./local-bin.mjs";

const remote = process.argv.includes("--remote");

/**
 * Which database this rewrites. Production unless `--env staging` says
 * otherwise, so the command that has always meant the demo card still does.
 */
const DATABASE = environmentFrom(process.argv, refuse).database;

/**
 * The flag that has to be typed out in full before this touches a live database.
 *
 * This script is a rewrite, not an insert: it deletes the promoter, their
 * sponsors, their show and its fighters before it puts the demo card back. On
 * the local database that is the point of it. On the remote one it is the
 * difference between refreshing a demo and losing a promoter's card the
 * afternoon before their show, and the two commands differ by one word.
 */
const CONFIRM = "--i-understand-this-rewrites-production";

/**
 * Development default. Fine for a local database that only ever holds invented
 * fighters; the remote seed refuses to run without a real one, because a known
 * password on a live promoter account is the same as no password.
 */
const DEV_PASSWORD = "cagecounty";

// Locally, .dev.vars wins, because that is the file the server reads and a
// password the server will not accept is worse than useless. Remotely there is
// no such file and the environment is the only source.
const vars: Record<string, string | undefined> = remote ? {} : devVars();
const password = remote
  ? (process.env.SEED_PROMOTER_PASSWORD ?? "")
  : (vars.SEED_PROMOTER_PASSWORD ?? process.env.SEED_PROMOTER_PASSWORD ?? DEV_PASSWORD);

if (!password) {
  console.error(
    "SEED_PROMOTER_PASSWORD must be set when seeding the remote database.\n" +
      "  SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote",
  );
  process.exit(1);
}

function refuse(...lines: string[]): never {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

/**
 * Two things have to be true before this writes to the live database, and they
 * guard different mistakes.
 *
 * The flag guards the deliberate command typed in the wrong terminal: it is
 * long, it cannot be reached by tab-completing `npm run db:seed`, and typing it
 * out is the moment somebody notices which database they are pointed at.
 *
 * The promoter check guards the case the flag cannot: somebody who does mean to
 * re-seed, on an instance that has since acquired a real promoter. There is no
 * self-service signup, so the demo instance holds exactly one promoter and it is
 * the seeded one. Anything else is an account somebody made on purpose, and this
 * script would delete their sponsors and their show on the way to putting Cage
 * County 12 back. It asks the database rather than assuming, because the whole
 * point is that the instance changed and nobody updated the note.
 */
function checkRemoteIsStillTheDemo(): void {
  if (!process.argv.includes(CONFIRM)) {
    refuse(
      "Refusing to seed the remote database.",
      "",
      "This rewrites it: the promoter, their sponsors, the show and its fighters",
      "are deleted and rebuilt from the demo card. Nothing is recoverable and the",
      "invite tokens are reissued, so every link already sent out stops working.",
      "",
      "If that is what you want, say so:",
      "",
      `  SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote -- ${CONFIRM}`,
    );
  }

  console.log("Checking the remote database still holds only the demo promoter");
  let out: string;
  try {
    out = execFileSync(
      ...localBin([
        "wrangler",
        "d1",
        "execute",
        DATABASE,
        "--remote",
        "--json",
        "--command",
        "SELECT slug FROM promoters",
      ]),
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
  } catch {
    refuse(
      "Could not read the promoters table on the remote database, so there is no",
      "way to tell whether seeding it would destroy somebody's work. Refusing.",
      "",
      "Check CLOUDFLARE_API_TOKEN is set and that the migrations have been applied:",
      "",
      "  npm run db:migrate:remote",
    );
  }

  // --json prints one result object per statement and no banner.
  let slugs: string[];
  try {
    const results = JSON.parse(out) as { results?: { slug?: string }[] }[];
    slugs = (results[0]?.results ?? []).map((row) => row.slug ?? "");
  } catch {
    refuse(
      "Could not make sense of what wrangler returned for the promoters table, so",
      "there is no way to tell whether seeding would destroy somebody's work.",
      "Refusing. What it printed:",
      "",
      out.slice(0, 500),
    );
  }

  const strangers = slugs.filter((slug) => slug !== SEED_PROMOTER_SLUG);
  if (strangers.length > 0) {
    refuse(
      `Refusing to seed: the remote database holds ${strangers.length === 1 ? "a promoter" : "promoters"} this seed did not create.`,
      "",
      ...strangers.map((slug) => `  ${slug}`),
      "",
      `Only "${SEED_PROMOTER_SLUG}" is expected. Seeding deletes a promoter's`,
      "sponsors, show and fighters before rebuilding the demo card, so on an",
      "instance with a real account on it this is data loss rather than a refresh.",
      "",
      "If the demo card really does need putting back, do it by hand against the",
      "one promoter, or take an export first:",
      "",
      "  npm run db:backup",
    );
  }

  console.log(
    slugs.length === 0
      ? "  empty — nothing to overwrite"
      : `  only "${SEED_PROMOTER_SLUG}", as expected`,
  );
}

if (remote) checkRemoteIsStillTheDemo();

/**
 * What the seeded invite tokens are sealed under, which has to be the value the
 * server will use or the links this script prints open nothing. Same precedence
 * as the password: .dev.vars first locally, because that is the file the dev
 * server reads; the environment only, remotely. Development falls back to
 * SESSION_SECRET exactly as lib/invite-token.ts does.
 */
const inviteSecret = remote
  ? (process.env.INVITE_KEY ?? "")
  : (vars.INVITE_KEY ?? process.env.INVITE_KEY ?? vars.SESSION_SECRET ?? process.env.SESSION_SECRET ?? "");

if (!inviteSecret) {
  console.error(
    "INVITE_KEY must be set when seeding the remote database. Without it the links\n" +
      "this prints would be sealed under a value the Worker cannot read.\n" +
      "  INVITE_KEY='...' npm run db:seed:remote",
  );
  process.exit(1);
}

const renderedBouts = event.bouts
  .map((bout) => bout.number)
  .filter((n) => existsSync(path.join(process.cwd(), "public", "renders", `bout-${n}.mp4`)));

const { sql, inviteLinks } = await buildSeed({
  event,
  fighters,
  sponsors,
  passwordHash: await hashPassword(password),
  renderedBouts,
  inviteSecret,
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
  ...localBin([
    "wrangler",
    "d1",
    "execute",
    DATABASE,
    remote ? "--remote" : "--local",
    "--file",
    file,
    "--yes",
  ]),
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
