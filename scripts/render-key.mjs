/**
 * Mints, revokes and lists the keys the mp4 renderer presents.
 *
 *   node scripts/render-key.mjs mint --label "GitHub Actions" --days 90
 *   node scripts/render-key.mjs mint --promoter cage-county --label "Ross's laptop"
 *   node scripts/render-key.mjs revoke --id rk_...
 *   node scripts/render-key.mjs list --remote
 *
 * There used to be one render key, `wrangler secret put RENDER_KEY`, and it read
 * every card on the instance published or not. With one promoter that is the
 * right size of credential. With two it is a cross-tenant read, so a key is a
 * row now: db/schema.ts `render_keys`, and lib/visibility.ts decides what one
 * opens.
 *
 * **A key minted without --promoter reaches every promoter.** That is the
 * runner's key and it has to be, because the hourly workflow renders whatever is
 * queued and does not know whose show it will be. Anything held by a person, or
 * by a machine doing one promoter's shows, wants --promoter.
 *
 * The key is printed once. Only its SHA-256 is stored, so a copy of the database
 * is not a set of working keys and nothing can print an existing one back —
 * losing one costs a mint and a revoke, which is two commands and no data.
 *
 * It talks to D1 through wrangler for the same reason the renderer does: anybody
 * who can run this already holds the Cloudflare credentials, and a mint endpoint
 * on the public site would be a way in for no gain. Local by default, so a
 * mistyped command cannot put a credential on the live database.
 */
import { execFileSync } from "node:child_process";
// Node strips the types on the way in, so the digest a key is stored as is
// computed by the same function the Worker checks it with. A second
// implementation of "what is stored" is a key that silently never matches.
import { newId, newToken, secretDigest } from "../lib/auth.ts";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";

const [command] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const remote = Boolean(arg("remote"));
const scope = remote ? "--remote" : "--local";

/** Single-quoted SQL literal. Operator input, but there is no reason to trust it. */
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

function d1(sql) {
  let out;
  try {
    out = execFileSync(
      ...localBin(["wrangler", "d1", "execute", DATABASE, scope, "--json", "--command", sql]),
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const said = `${error.stderr ?? ""}${error.stdout ?? ""}`;
    if (/no such table: render_keys/i.test(said)) {
      fail(
        "There is no render_keys table on this database yet.",
        remote ? "  npm run db:migrate:remote" : "  npm run db:migrate",
      );
    }
    fail("wrangler could not run that statement.", said.trim().slice(0, 800));
  }
  return JSON.parse(out)[0]?.results ?? [];
}

function fail(...lines) {
  for (const line of lines) if (line) console.error(line);
  process.exit(1);
}

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

// -------------------------------------------------------------------- mint

async function mint() {
  const slug = arg("promoter");
  const label = arg("label");
  const days = arg("days");

  if (slug === true) fail("--promoter takes a promoter's slug, e.g. --promoter cage-county");
  if (days !== undefined && !/^\d+$/.test(String(days))) fail("--days takes a number of days.");

  let promoterId = null;
  if (slug) {
    const [promoter] = d1(`SELECT id FROM promoters WHERE slug = ${lit(slug)}`);
    if (!promoter) fail(`There is no promoter with the slug "${slug}" on this database.`);
    promoterId = promoter.id;
  }

  const now = Date.now();
  const expiresAt = days ? now + Number(days) * 86_400_000 : null;
  const key = newToken();
  const id = newId("rk");

  d1(
    `INSERT INTO render_keys (id, promoter_id, digest, label, created_at, expires_at, revoked_at)` +
      ` VALUES (${lit(id)}, ${promoterId ? lit(promoterId) : "NULL"},` +
      ` ${lit(await secretDigest(key))}, ${label && label !== true ? lit(label) : "NULL"},` +
      ` ${now}, ${expiresAt ?? "NULL"}, NULL)`,
  );

  console.log(
    `\nMinted ${id} — ${slug ? `${slug}'s shows only` : "every promoter, which is the runner's key"}` +
      `${expiresAt ? `, until ${day(expiresAt)}` : ", with no expiry"}.\n`,
  );
  console.log(`  ${key}\n`);
  console.log("That is the only time it is printed: only its digest is stored.");
  console.log("The renderer reads it from RENDER_KEY, in the shell or in .dev.vars:\n");
  console.log(`  export RENDER_KEY='${key}'\n`);
  if (!slug) {
    console.log("Unscoped, so it reads every promoter's cards, published or not.");
    console.log("Give it --promoter unless it is the runner's.\n");
  }
}

// ------------------------------------------------------------------ revoke

function revoke() {
  const id = arg("id");
  if (!id || id === true) fail("revoke takes the id of a key: --id rk_...", "", "  render-key list");

  const [key] = d1(`SELECT id, revoked_at FROM render_keys WHERE id = ${lit(id)}`);
  if (!key) fail(`There is no render key with the id "${id}" on this database.`);
  if (key.revoked_at) {
    console.log(`${id} was already revoked on ${day(key.revoked_at)}. Nothing to do.`);
    return;
  }

  d1(`UPDATE render_keys SET revoked_at = ${Date.now()} WHERE id = ${lit(id)}`);
  console.log(`Revoked ${id}. It opens nothing from the next request onwards.`);
}

// -------------------------------------------------------------------- list

function list() {
  const rows = d1(
    `SELECT k.id, k.label, k.created_at, k.expires_at, k.revoked_at, p.slug` +
      ` FROM render_keys k LEFT JOIN promoters p ON p.id = k.promoter_id` +
      ` ORDER BY k.created_at`,
  );

  if (rows.length === 0) {
    console.log("No render keys on this database.");
    console.log("The renderer is running on the RENDER_KEY secret, if it is running at all.");
    return;
  }

  const now = Date.now();
  for (const row of rows) {
    const state = row.revoked_at
      ? `revoked ${day(row.revoked_at)}`
      : row.expires_at && row.expires_at <= now
        ? `expired ${day(row.expires_at)}`
        : row.expires_at
          ? `until ${day(row.expires_at)}`
          : "no expiry";
    console.log(
      [
        row.id.padEnd(20),
        (row.slug ?? "every promoter").padEnd(16),
        state.padEnd(20),
        row.label ?? "",
      ]
        .join("  ")
        .trimEnd(),
    );
  }
}

// -------------------------------------------------------------------------

const commands = { mint, revoke, list };
if (!commands[command]) {
  fail(
    "Usage:",
    "  npm run render-key -- mint [--promoter <slug>] [--label <text>] [--days <n>] [--remote]",
    "  npm run render-key -- revoke --id <id> [--remote]",
    "  npm run render-key -- list [--remote]",
    "",
    "Local by default. --remote acts on the deployed database.",
  );
}

await commands[command]();
