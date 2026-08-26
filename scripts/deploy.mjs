/**
 * Deploys EventIQ to Cloudflare Workers.
 *
 *   node scripts/deploy.mjs --check           # what works and what is missing
 *   node scripts/deploy.mjs --provision       # create D1 and R2, run migrations
 *   node scripts/deploy.mjs                   # build and deploy
 *   node scripts/deploy.mjs --attach-domain   # point eventiq.win at the Worker
 *
 * This used to push a folder of files to Pages. It cannot any more: the app has
 * a database behind it, so there is a Worker to deploy, a D1 database to create
 * and migrate, and an R2 bucket to hold photographs. Those need permissions the
 * old token did not have, which is why --check exists and why it names the exact
 * permission behind every failure rather than reporting "403".
 *
 * Credentials come from the environment and are never written to disk.
 * See DEPLOY.md.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const NAME = "eventiq";
const DATABASE = "eventiq";
const BUCKET = "eventiq-media";
const DOMAIN = process.env.SITE_DOMAIN ?? "eventiq.win";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${DOMAIN}`;
const API = "https://api.cloudflare.com/client/v4";

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function sh(command, commandArgs, { capture = false, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ------------------------------------------------------------ permissions

/**
 * Every account-level permission the deploy needs, with the name it has in the
 * token editor. Read access is enough to tell whether the permission is there:
 * a token with Edit can always read, and one with neither returns 401 or 403.
 */
const NEEDED = [
  {
    label: "Account · Workers Scripts · Edit",
    why: "deploying the Worker itself",
    probe: (account) => `/accounts/${account}/workers/scripts`,
  },
  {
    label: "Account · D1 · Edit",
    why: "creating the database, running migrations, seeding",
    probe: (account) => `/accounts/${account}/d1/database`,
  },
  {
    label: "Account · Workers R2 Storage · Edit",
    why: "the bucket holding fighter photographs and rendered video",
    probe: (account) => `/accounts/${account}/r2/buckets`,
  },
  {
    label: "Account · Account Settings · Read",
    why: "wrangler resolving the account before it does anything",
    probe: (account) => `/accounts/${account}`,
  },
];

async function checkPermissions() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const results = [];
  for (const item of NEEDED) {
    const { status } = await api(item.probe(account));
    results.push({ ...item, ok: status === 200, status });
    console.log(`  ${status === 200 ? "yes" : "NO "}  ${item.label}`);
  }
  return results;
}

function requireCredentials() {
  const missing = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter(
    (name) => !process.env[name],
  );
  if (missing.length === 0) return;

  fail(
    [
      `Cannot deploy: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set.`,
      "",
      "Create a token at https://dash.cloudflare.com/profile/api-tokens",
      "(Create Custom Token) with:",
      ...NEEDED.map((n) => `  ${n.label.padEnd(42)} ${n.why}`),
      "",
      `and, only for --attach-domain, Zone · Workers Routes · Edit and`,
      `Zone · DNS · Edit scoped to ${DOMAIN}.`,
      "",
      "  export CLOUDFLARE_API_TOKEN=...",
      "  export CLOUDFLARE_ACCOUNT_ID=...",
      "",
      "Full instructions in DEPLOY.md.",
    ].join("\n"),
  );
}

function reportMissing(results) {
  const missing = results.filter((r) => !r.ok);
  if (!missing.length) return;
  fail(
    [
      "The token is missing permissions this deploy needs:",
      "",
      ...missing.map((m) => `  ${m.label.padEnd(42)} (${m.why}) — HTTP ${m.status}`),
      "",
      "Add them at https://dash.cloudflare.com/profile/api-tokens, either by",
      "editing the existing token or by creating a new one. Nothing else here",
      "can be done until they are there.",
    ].join("\n"),
  );
}

// ------------------------------------------------------------ provisioning

/**
 * Creates the database and bucket if they are not there, then writes the
 * database id into wrangler.jsonc.
 *
 * The id has to be in the committed config for a deploy to bind anything, and
 * it is not a secret: it identifies a database that only this account's tokens
 * can reach.
 */
async function provision() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;

  const existing = await api(`/accounts/${account}/d1/database?name=${DATABASE}`);
  let id = existing.body.result?.find((db) => db.name === DATABASE)?.uuid;

  if (!id) {
    console.log(`Creating D1 database ${DATABASE}`);
    const created = await api(`/accounts/${account}/d1/database`, {
      method: "POST",
      body: JSON.stringify({ name: DATABASE }),
    });
    id = created.body.result?.uuid;
    if (!id) fail(`Could not create the database: ${JSON.stringify(created.body.errors)}`);
  } else {
    console.log(`D1 database ${DATABASE} already exists`);
  }

  const config = await readFile("wrangler.jsonc", "utf8");
  if (config.includes(id)) {
    console.log("wrangler.jsonc already points at it");
  } else {
    await writeFile("wrangler.jsonc", config.replace(/"database_id": "[^"]*"/, `"database_id": "${id}"`));
    console.log(`Wrote the database id into wrangler.jsonc. Commit that change.`);
  }

  const buckets = await api(`/accounts/${account}/r2/buckets`);
  if (buckets.body.result?.buckets?.some((b) => b.name === BUCKET)) {
    console.log(`R2 bucket ${BUCKET} already exists`);
  } else {
    console.log(`Creating R2 bucket ${BUCKET}`);
    const created = await api(`/accounts/${account}/r2/buckets`, {
      method: "POST",
      body: JSON.stringify({ name: BUCKET }),
    });
    if (!created.body.success) {
      fail(`Could not create the bucket: ${JSON.stringify(created.body.errors)}`);
    }
  }

  console.log("\nApplying migrations to the remote database");
  await sh("npx", ["wrangler", "d1", "migrations", "apply", DATABASE, "--remote"]);

  console.log(
    [
      "",
      "Provisioned. Two things left before the first deploy:",
      "",
      "  npx wrangler secret put SESSION_SECRET     # openssl rand -base64 32",
      "  npm run db:seed:remote                     # optional: the demo card",
      "",
      "The seed prints the promoter's password and the invite links once. They",
      "are not recoverable afterwards.",
    ].join("\n"),
  );
}

// ------------------------------------------------------------------ domain

/**
 * Workers custom domains are their own resource rather than a DNS record you
 * add by hand: Cloudflare creates the record and the route together.
 */
async function attachDomain() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zones = await api(`/zones?name=${DOMAIN}`);
  const zone = zones.body.result?.[0];
  if (!zone) {
    fail(
      [
        `No zone for ${DOMAIN} in this account, or the token cannot read zones.`,
        "",
        `Add ${DOMAIN} to Cloudflare and change the nameservers at the registrar`,
        "first, and give the token Zone · DNS · Edit on it.",
      ].join("\n"),
    );
  }

  const { status, body } = await api(`/accounts/${account}/workers/domains`, {
    method: "PUT",
    body: JSON.stringify({
      environment: "production",
      hostname: DOMAIN,
      service: NAME,
      zone_id: zone.id,
    }),
  });

  if (body.success) {
    console.log(`\n${DOMAIN} points at the Worker. DNS takes a minute or two.`);
    return;
  }
  fail(`Could not attach ${DOMAIN} (HTTP ${status}): ${JSON.stringify(body.errors ?? body)}`);
}

// -------------------------------------------------------------------- main

async function main() {
  requireCredentials();

  console.log("Token permissions:");
  const results = await checkPermissions();
  if (has("check")) {
    const missing = results.filter((r) => !r.ok);
    console.log(missing.length ? `\n${missing.length} missing.` : "\nAll present.");
    process.exit(missing.length ? 1 : 0);
  }
  reportMissing(results);

  if (has("provision")) {
    await provision();
    return;
  }

  const config = await readFile("wrangler.jsonc", "utf8");
  if (config.includes("PLACEHOLDER_SET_BY_WRANGLER_D1_CREATE")) {
    fail("wrangler.jsonc has no database id yet. Run with --provision first.");
  }

  if (!has("skip-build")) {
    console.log(`\nBuilding for ${SITE_URL}`);
    // Nested under `env`, because that is where sh() looks. Passed flat it was
    // silently dropped, so SITE_DOMAIN appeared to work and never did.
    await sh("npx", ["opennextjs-cloudflare", "build"], { env: { NEXT_PUBLIC_SITE_URL: SITE_URL } });
  }

  await sh("npx", ["opennextjs-cloudflare", "deploy"]);

  if (has("attach-domain")) await attachDomain();
}

await main();
