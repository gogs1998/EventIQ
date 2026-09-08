/**
 * Deploys EventIQ to Cloudflare Workers.
 *
 *   node scripts/deploy.mjs --check           # what works and what is missing
 *   node scripts/deploy.mjs --dry-run         # that, plus what is about to happen
 *   node scripts/deploy.mjs --provision       # create D1 and R2, run migrations
 *   node scripts/deploy.mjs                   # migrate, build and deploy
 *   node scripts/deploy.mjs --attach-domain   # point eventiq.win at the Worker
 *
 * Every one of those takes `--env staging`, which is a second Worker with its
 * own database, its own bucket and its own secrets. Without it they mean
 * production, because that is what they have always meant.
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
import { execFileSync, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { environmentFrom, wranglerEnvArgs } from "./environments.mjs";
import { localBin } from "./local-bin.mjs";

const API = "https://api.cloudflare.com/client/v4";

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const TARGET = environmentFrom(args, fail);
const { worker: NAME, database: DATABASE, bucket: BUCKET, domain: DOMAIN } = TARGET;
const WRANGLER_ENV = wranglerEnvArgs(TARGET.name);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${DOMAIN}`;

/**
 * The branch production is deployed from.
 *
 * Everything here is developed on side branches that are merged into it, and
 * several of them exist at once. A deploy is a thing somebody types, usually
 * after doing something else, and typing it in the wrong worktree puts half a
 * feature on eventiq.win with the migrations to match — and migrations here are
 * additive with no down path, so that is not a `wrangler rollback` away.
 */
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH ?? "cursor/eventiq-digital-fight-programme";

/** Null where this is not a git checkout, which is a state to report, not to guess at. */
function currentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Staging is deployed from anywhere — that is what it is for. Production is
 * deployed from the working branch, or with --force from somebody who means it.
 */
function requireDeployableBranch() {
  if (TARGET.name !== "production" || has("force")) return;

  const branch = currentBranch();
  if (branch === DEPLOY_BRANCH) return;

  fail(
    [
      branch === null
        ? "This is not a git checkout, so there is no way to tell what would go up."
        : `This is branch "${branch}", not "${DEPLOY_BRANCH}".`,
      "",
      "Deploying production from a side branch puts whatever is in this worktree",
      "on eventiq.win, migrations included, and migrations here are additive with",
      "no down path.",
      "",
      "  node scripts/deploy.mjs --env staging     # the same thing, somewhere safe",
      "  node scripts/deploy.mjs --force           # if this is deliberate",
    ].join("\n"),
  );
}

function sh(command, commandArgs, { capture = false, env = {} } = {}) {
  // "npx" is a batch file on Windows and cannot be spawned directly; see local-bin.mjs.
  if (command === "npx") [command, commandArgs] = localBin(commandArgs);
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

const PLACEHOLDER = "PLACEHOLDER_SET_BY_WRANGLER_D1_CREATE";

/**
 * Where the id for one named database sits in wrangler.jsonc.
 *
 * Found by walking from the database's own name to the next `database_id` after
 * it, rather than by taking the first one in the file: there are two of these
 * now, and writing the wrong one would bind an environment to the other
 * environment's data. Null where the block is not there at all, which is a
 * config somebody has edited and not a case to guess at.
 */
function databaseIdSpan(config, database) {
  const name = config.indexOf(`"database_name": "${database}"`);
  if (name === -1) return null;

  const key = config.indexOf('"database_id": "', name);
  if (key === -1) return null;

  const from = key + '"database_id": "'.length;
  const to = config.indexOf('"', from);
  return to === -1 ? null : { from, to };
}

function databaseIdFor(config, database) {
  const span = databaseIdSpan(config, database);
  return span ? config.slice(span.from, span.to) : null;
}

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
    const span = databaseIdSpan(config, DATABASE);
    if (!span) {
      fail(`Could not find the ${DATABASE} database block in wrangler.jsonc to write the id into.`);
    }
    await writeFile(
      "wrangler.jsonc",
      config.slice(0, span.from) + id + config.slice(span.to),
    );
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

  const secretFlags = WRANGLER_ENV.join(" ");
  console.log(
    [
      "",
      `Provisioned ${TARGET.name}. Two things left before the first deploy:`,
      "",
      `  npx wrangler secret put SESSION_SECRET ${secretFlags}`.trimEnd() +
        "     # openssl rand -base64 32",
      `  npx wrangler secret put RENDER_KEY ${secretFlags}`.trimEnd() +
        "         # openssl rand -base64 36",
      "",
      "Secrets are per environment: setting one on production sets nothing here.",
      "",
      "Then, optionally, the demo card:",
      "  npm run db:seed:remote -- --i-understand-this-rewrites-production",
      "",
      "The seed prints the promoter's password and the invite links once. They",
      "are not recoverable afterwards.",
    ].join("\n"),
  );
}

// -------------------------------------------------------------- migrations

/**
 * What `wrangler d1 migrations list` says about the remote database.
 *
 * Returns the migration filenames it is still waiting to apply, or null when
 * the output is not in a shape this understands — which is a different answer
 * from "none", and the caller treats it as one.
 */
async function pendingMigrations() {
  const out = await sh("npx", ["wrangler", "d1", "migrations", "list", DATABASE, "--remote"], {
    capture: true,
  });
  if (/no migrations to apply/i.test(out)) return [];
  const names = [...out.matchAll(/(\d+_[\w-]+\.sql)/g)].map((m) => m[1]);
  return names.length > 0 ? names : null;
}

/**
 * Applies pending migrations, then checks none are left.
 *
 * This runs before the Worker goes up, because the code being uploaded expects
 * the schema that ships with it: upload first and every request in between hits
 * the old tables. It runs *after* the build, so a build that was going to fail
 * fails without having touched a live database. Migrations are additive here and
 * there is no down path, which is what makes that order safe — for the few
 * seconds in between it is the old Worker against a wider schema, which it
 * cannot notice.
 *
 * A failure stops the deploy rather than warning. Half a schema change with a
 * new Worker on top of it is the state nobody can reason about at ten to seven
 * on a show night.
 */
async function migrate() {
  console.log("\nApplying any pending D1 migrations to the remote database");
  try {
    await sh("npx", ["wrangler", "d1", "migrations", "apply", DATABASE, "--remote"]);
  } catch (error) {
    fail(
      [
        `Migrations failed, so nothing has been deployed: ${error.message}`,
        "",
        "The Worker about to go up expects the schema those migrations create, so",
        "uploading it now would put new code on old tables. Fix the migration and",
        "run this again.",
      ].join("\n"),
    );
  }

  // Belt and braces: apply reports success on a no-op as readily as on real
  // work, so the state is read back rather than inferred from an exit code.
  const pending = await pendingMigrations();
  if (pending === null) {
    console.log(
      "  could not read the migrations list back; check it by hand with\n" +
        `  npx wrangler d1 migrations list ${DATABASE} --remote`,
    );
    return;
  }
  if (pending.length > 0) {
    fail(
      [
        "Migrations were applied and the remote database still reports these as",
        "unapplied:",
        "",
        ...pending.map((name) => `  ${name}`),
        "",
        "Nothing has been deployed. Either the migrations table is in a state",
        "wrangler cannot reconcile, or this is pointed at a database nobody meant.",
      ].join("\n"),
    );
  }
  console.log("  up to date");
}

// ------------------------------------------------------------------ domain

/**
 * Workers custom domains are their own resource rather than a DNS record you
 * add by hand: Cloudflare creates the record and the route together.
 */
async function attachDomain() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  // The zone, not the hostname: staging.eventiq.win lives in the eventiq.win
  // zone and asking for a zone by that name finds nothing.
  const zones = await api(`/zones?name=${TARGET.zone}`);
  const zone = zones.body.result?.[0];
  if (!zone) {
    fail(
      [
        `No zone for ${TARGET.zone} in this account, or the token cannot read zones.`,
        "",
        `Add ${TARGET.zone} to Cloudflare and change the nameservers at the registrar`,
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
  // The cheapest refusal first. A deploy started in the wrong worktree should
  // not spend four API calls before finding that out, and --check and --dry-run
  // change nothing, so they are welcome from anywhere.
  if (!has("check") && !has("dry-run")) requireDeployableBranch();

  requireCredentials();

  console.log(`Environment: ${TARGET.name} — Worker ${NAME}, database ${DATABASE}, bucket ${BUCKET}`);
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
  if (databaseIdFor(config, DATABASE) === PLACEHOLDER) {
    fail(
      `wrangler.jsonc has no id for the ${DATABASE} database yet. Run with --provision first` +
        (TARGET.name === "production" ? "." : `:\n\n  node scripts/deploy.mjs --env ${TARGET.name} --provision`),
    );
  }

  if (has("dry-run")) {
    // Every step here is a read. Nothing is built, no migration is applied and
    // no Worker is uploaded — the point is to see what a real run would do
    // against this account before finding out by doing it.
    const pending = await pendingMigrations();
    console.log("\nPending D1 migrations:");
    if (pending === null) {
      console.log("  could not read the list; run the command by hand");
    } else if (pending.length === 0) {
      console.log("  none");
    } else {
      for (const name of pending) console.log(`  ${name}`);
    }
    console.log(
      [
        "",
        "A real run would, in this order:",
        has("skip-build") ? "  skip the build (--skip-build)" : `  build for ${SITE_URL}`,
        `  apply those migrations to the remote ${DATABASE} database`,
        `  upload the Worker as ${NAME}`,
        ...(has("attach-domain") ? [`  point ${DOMAIN} at it`] : []),
        "",
        TARGET.name === "production" && currentBranch() !== DEPLOY_BRANCH && !has("force")
          ? `And would then refuse: this is "${currentBranch()}" rather than "${DEPLOY_BRANCH}".`
          : "Nothing has changed. Drop --dry-run to do it.",
      ].join("\n"),
    );
    return;
  }

  if (!has("skip-build")) {
    console.log(`\nBuilding for ${SITE_URL}`);
    // Nested under `env`, because that is where sh() looks. Passed flat it was
    // silently dropped, so SITE_DOMAIN appeared to work and never did.
    await sh("npx", ["opennextjs-cloudflare", "build"], { env: { NEXT_PUBLIC_SITE_URL: SITE_URL } });
  }

  // Before the upload, and after the build. See migrate().
  await migrate();

  await sh("npx", ["opennextjs-cloudflare", "deploy", ...WRANGLER_ENV]);

  if (has("attach-domain")) await attachDomain();
}

await main();
