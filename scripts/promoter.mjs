/**
 * Promoter accounts, from the operator's side.
 *
 *   npm run promoter -- list
 *   npm run promoter -- create --slug budo --name "BUDO" --generate
 *   npm run promoter -- set-password --slug budo --password '...'
 *   npm run promoter -- reset-link --slug budo
 *
 * Add `--remote` to work on the live database; without it everything happens on
 * the local Miniflare D1 under .wrangler.
 *
 * There is no self-service signup and this is the reason there does not need to
 * be one: onboarding a promoter is an operator running one command. That is a
 * product decision rather than an unfinished feature — a fight promoter is a
 * person somebody has already spoken to, and an open signup form on a product
 * with one operator is a way of acquiring spam accounts and a support burden
 * rather than customers.
 *
 * It hashes with lib/auth.ts rather than with a copy of the algorithm, so the
 * verifier this writes is the one the login reads, at the iteration count the
 * edge will actually run. Getting that wrong is HANDOVER bug 17 and it does not
 * show up until somebody tries to sign in on the live site. Running under Node's
 * type stripping with the alias loader is what makes sharing it possible; see
 * scripts/seed.ts, which does the same for the same reason.
 *
 * Everything it writes goes through `wrangler d1 execute`, spawned via
 * scripts/local-bin.mjs so the pinned wrangler runs and Windows can spawn it.
 * **Not while a dev server is up**: two writers on one Miniflare SQLite file and
 * the second one loses, silently. Stop the server, run this, start it again.
 */

import { execFileSync } from "node:child_process";
import {
  PASSWORD_MIN_LENGTH,
  digestToken,
  hashPassword,
  newId,
  newToken,
  passwordLongEnough,
} from "@/lib/auth";
import { RESET_TOKEN_TTL_MS, resetExpiry } from "@/lib/password-reset";
import { lit, row } from "@/lib/seed";
import { localBin } from "./local-bin.mjs";

const USAGE = `
Usage: npm run promoter -- <command> [options]

  list                                             every promoter on the database
  create --slug <slug> --name <name> --generate    a new account with a password made here
  create --slug <slug> --name <name> --password <p>
  set-password --slug <slug> --generate|--password <p>
  reset-link --slug <slug>                         a one-time link, good for half an hour

  --remote      the live database. Local Miniflare D1 without it.
`.trim();

function die(...lines) {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const command = argv[0];
const remote = argv.includes("--remote");

/** The value after a flag, or null. Flags are `--name value`, never `--name=value`. */
function flag(name) {
  const at = argv.indexOf(`--${name}`);
  if (at === -1 || at === argv.length - 1) return null;
  const value = argv[at + 1];
  return value.startsWith("--") ? null : value;
}

/**
 * The slug is the promoter's username, and the login lowercases what is typed
 * into the form before it looks anybody up. So a slug with a capital in it is an
 * account nobody can sign in to, and it is refused here rather than created and
 * puzzled over later. Hyphens because it reads as one word in a URL.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// --------------------------------------------------------------------- wrangler

function d1(sql, { json = false } = {}) {
  const args = [
    "wrangler",
    "d1",
    "execute",
    "eventiq",
    remote ? "--remote" : "--local",
    ...(json ? ["--json"] : []),
    "--command",
    sql,
    "--yes",
  ];
  const out = execFileSync(...localBin(args), {
    encoding: "utf8",
    stdio: ["ignore", json ? "pipe" : "ignore", "inherit"],
  });
  if (!json) return null;
  // --json prints one result object per statement and no banner.
  return JSON.parse(out)[0]?.results ?? [];
}

function promoterRows(where = "") {
  return d1(
    `SELECT id, slug, name, session_version, created_at,
            CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS has_password
       FROM promoters ${where} ORDER BY created_at`,
    { json: true },
  );
}

function findPromoter(slug) {
  const [found] = promoterRows(`WHERE slug = ${lit(slug)}`);
  return found ?? null;
}

// --------------------------------------------------------------------- passwords

/**
 * A generated password. Twenty-two base64url characters is 132 bits, which is
 * far past anything guessable and short enough to read down a phone line once.
 * It is printed and never stored, so nobody here can hand it over a second time
 * — `set-password` or a reset link is what replaces a lost one.
 */
function generated() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Either the one that was typed or one made here, held to the same floor as the form. */
function passwordFrom() {
  const typed = flag("password");
  if (typed && argv.includes("--generate")) {
    die("Pass either --password or --generate, not both.");
  }
  if (typed) {
    if (!passwordLongEnough(typed)) {
      die(
        `That password is shorter than the ${PASSWORD_MIN_LENGTH} characters the account`,
        "will accept from the promoter themselves. Pick a longer one, or use --generate.",
      );
    }
    return { password: typed, made: false };
  }
  if (argv.includes("--generate")) return { password: generated(), made: true };
  die("Say what the password is: --password '…', or --generate to have one made.");
}

/** Printed once, and loudly, because there is no second chance to read it. */
function announce(slug, password, made) {
  if (!made) return;
  console.log("");
  console.log(`  ${slug} password: ${password}`);
  console.log("");
  console.log("  Printed once and stored nowhere. Put it in a password manager now.");
}

// ---------------------------------------------------------------------- commands

async function list() {
  const rows = promoterRows();
  if (rows.length === 0) {
    console.log(`No promoters on the ${remote ? "remote" : "local"} database yet.`);
    return;
  }
  console.log(`${rows.length} promoter${rows.length === 1 ? "" : "s"}:\n`);
  for (const promoter of rows) {
    const when = new Date(promoter.created_at).toISOString().slice(0, 10);
    const password = promoter.has_password ? "password set" : "no password";
    console.log(
      `  ${String(promoter.slug).padEnd(20)} ${String(promoter.name).padEnd(28)} ` +
        `${when}  ${password}  sessions v${promoter.session_version}`,
    );
  }
}

async function create() {
  const slug = flag("slug");
  const name = flag("name");
  if (!slug || !name) die("create needs --slug and --name.", "", USAGE);
  if (!SLUG.test(slug)) {
    die(
      `"${slug}" will not do as a slug. Lower case letters, digits and hyphens,`,
      "because it is what gets typed into the sign-in form and the form lowercases it.",
    );
  }
  // Asked before anything is written. Creating a second account on a slug that
  // is taken would fail on the unique index anyway, but as a wrangler error
  // rather than as a sentence, and after the password had been generated.
  if (findPromoter(slug)) {
    die(
      `There is already a promoter at "${slug}".`,
      "",
      "To give that account a new password instead:",
      "",
      `  npm run promoter -- set-password --slug ${slug} --generate${remote ? " --remote" : ""}`,
    );
  }

  const { password, made } = passwordFrom();
  d1(
    row("promoters", {
      id: newId("pr"),
      slug,
      name,
      password_hash: await hashPassword(password),
      failed_logins: 0,
      session_version: 0,
      created_at: Date.now(),
    }),
  );

  console.log(`Created "${name}" at ${remote ? "the live database" : "the local database"}.`);
  console.log(`Sign in at ${site()}/promoter/login as "${slug}".`);
  announce(slug, password, made);
  console.log("There are no shows on it yet. The promoter makes the first one themselves.");
}

async function setPassword() {
  const slug = flag("slug");
  if (!slug) die("set-password needs --slug.", "", USAGE);
  if (!findPromoter(slug)) die(`No promoter at "${slug}". \`list\` shows who is there.`);

  const { password, made } = passwordFrom();
  // The version bump is the revocation: every cookie already issued for this
  // account names the old generation and stops working on its next request.
  // Failures are cleared with it, so a locked account is opened by this rather
  // than left shut for the rest of the window.
  d1(
    `UPDATE promoters
        SET password_hash = ${lit(await hashPassword(password))},
            session_version = session_version + 1,
            failed_logins = 0,
            first_failed_login_at = NULL
      WHERE slug = ${lit(slug)};`,
  );

  console.log(`Password changed for "${slug}".`);
  announce(slug, password, made);
  console.log("Anywhere that account was signed in has been signed out.");
}

async function resetLink() {
  const slug = flag("slug");
  if (!slug) die("reset-link needs --slug.", "", USAGE);
  const promoter = findPromoter(slug);
  if (!promoter) die(`No promoter at "${slug}". \`list\` shows who is there.`);

  const token = newToken();
  const now = Date.now();
  const expires = resetExpiry(now);

  // Any link already outstanding for this account goes first. Minting a second
  // one is what somebody does when the first went astray, and leaving that one
  // alive would mean the mistake still opens the account for half an hour.
  // Two calls rather than two statements, because D1's --command takes one.
  d1(`DELETE FROM password_resets WHERE promoter_id = ${lit(promoter.id)};`);
  d1(
    row("password_resets", {
      id: newId("rs"),
      promoter_id: promoter.id,
      token_digest: await digestToken(token),
      expires_at: expires,
      used_at: null,
      created_at: now,
    }),
  );

  console.log(`A one-time reset link for "${slug}":\n`);
  console.log(`  ${site()}/promoter/reset/${token}\n`);
  console.log(
    `It works once and stops working at ${new Date(expires).toISOString().slice(11, 16)} UTC, ` +
      `${RESET_TOKEN_TTL_MS / 60000} minutes from now.`,
  );
  console.log("Setting a password with it signs that account out everywhere.");
}

/** Where the link the operator pastes has to point. */
function site() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (remote ? "https://eventiq.win" : "http://localhost:3000");
}

const COMMANDS = { list, create, "set-password": setPassword, "reset-link": resetLink };

if (!command || !COMMANDS[command]) {
  die(command ? `No such command: ${command}` : "Say what to do.", "", USAGE);
}

await COMMANDS[command]();
