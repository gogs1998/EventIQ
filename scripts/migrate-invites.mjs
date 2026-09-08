/**
 * Seals the invite tokens that migration 0007 left in the clear.
 *
 *   npm run db:migrate-invites                       # the local D1
 *   npm run db:migrate-invites -- --remote           # the live one
 *   npm run db:migrate-invites -- --remote --dry-run # count them, write nothing
 *
 * The backfill cannot be in the migration SQL, because sealing a token needs
 * `INVITE_KEY` and SQLite has no HMAC and no AES. So it is this, run once after
 * the migration and after the Worker holding the same key is up.
 *
 * It is safe to run twice: it only touches rows that still have a plaintext
 * token, and it writes the digest, the ciphertext and the expiry in one
 * statement per row before clearing the plaintext. A row it has already done is
 * a row it does not select.
 *
 * The key has to be the one the Worker reads. Locally that comes from .dev.vars,
 * the same file the dev server reads; remotely it has to be exported, because
 * `wrangler secret put` is one-way and there is nothing to read it back out of.
 * Getting it wrong produces links nobody can open, so it stops rather than
 * guessing.
 *
 * Runs under Node's type stripping with the alias resolver so it can use
 * lib/invite-token.ts rather than reimplementing the derivation beside it. Two
 * implementations of a key schedule is how the two come to disagree.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INVITE_TTL_MS, inviteSecretFrom, sealedColumns } from "@/lib/invite-token";
import { devVars } from "./dev-vars.mjs";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const dryRun = args.includes("--dry-run");

const vars = remote ? {} : devVars();
let secret;
try {
  secret = inviteSecretFrom(
    {
      INVITE_KEY: vars.INVITE_KEY ?? process.env.INVITE_KEY,
      SESSION_SECRET: vars.SESSION_SECRET ?? process.env.SESSION_SECRET,
    },
    !remote,
  );
} catch {
  console.error(
    "\nINVITE_KEY is not set, so there is nothing to seal these tokens under.\n" +
      "It has to be the value the Worker holds, or every link this rewrites stops\n" +
      "opening. Export the one from the password manager and run this again:\n\n" +
      "  INVITE_KEY='...' npm run db:migrate-invites -- --remote\n",
  );
  process.exit(1);
}

/** One statement in, the rows out. `--json` prints a result object per statement. */
function query(sql) {
  const out = execFileSync(
    ...localBin([
      "wrangler",
      "d1",
      "execute",
      DATABASE,
      remote ? "--remote" : "--local",
      "--json",
      "--command",
      sql,
    ]),
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out)[0]?.results ?? [];
}

/** SQL string literal. Everything written here is base64url, but the habit is worth keeping. */
const lit = (value) => (value === null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

const pending = query(
  "SELECT id, token, expires_at FROM invites WHERE token IS NOT NULL AND token <> ''",
);

if (pending.length === 0) {
  console.log("Nothing to do: no invite is stored in the clear.");
  process.exit(0);
}

console.log(
  `${pending.length} invite${pending.length === 1 ? "" : "s"} still stored in the clear on the ${remote ? "remote" : "local"} database.`,
);

if (dryRun) {
  console.log("--dry-run, so nothing was written.");
  process.exit(0);
}

const now = Date.now();
const statements = [];
for (const invite of pending) {
  const { tokenDigest, tokenCipher } = await sealedColumns(secret, invite.token);
  // The expiry is only set where the migration did not manage to: a row that
  // already has one has been sent to somebody with that date on it.
  const expiresAt = invite.expires_at ?? now + INVITE_TTL_MS;
  statements.push(
    `UPDATE invites SET token = NULL, token_digest = ${lit(tokenDigest)}, ` +
      `token_cipher = ${lit(tokenCipher)}, expires_at = ${expiresAt} ` +
      `WHERE id = ${lit(invite.id)};`,
  );
}

// A file rather than --command, which takes one statement, and a file also means
// D1 applies the batch rather than this script holding a half-migrated table
// open across a few hundred round trips.
const file = path.join(mkdtempSync(path.join(tmpdir(), "eventiq-invites-")), "seal.sql");
writeFileSync(file, `${statements.join("\n")}\n`);

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

const left = query("SELECT COUNT(*) AS n FROM invites WHERE token IS NOT NULL AND token <> ''");
console.log(
  `Sealed ${statements.length}. ${Number(left[0]?.n ?? 0)} still in the clear.\n` +
    "Every link already sent out goes on working: the token did not change, only what is kept of it.",
);
