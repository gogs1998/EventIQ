/**
 * Builds the static export and pushes it to Cloudflare Pages.
 *
 *   node scripts/deploy.mjs                     # build, then deploy
 *   node scripts/deploy.mjs --skip-build        # deploy whatever is in out/
 *   node scripts/deploy.mjs --attach-domain     # also point eventiq.win at it
 *
 * Nothing here needs a running server: the site is a static export, so the
 * deploy is a file upload. Credentials come from the environment and are never
 * written to disk. See DEPLOY.md for how to create them.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PROJECT = process.env.CF_PAGES_PROJECT ?? "eventiq";
const DOMAIN = process.env.SITE_DOMAIN ?? "eventiq.win";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${DOMAIN}`;

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
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
      "Create a Cloudflare API token at",
      "  https://dash.cloudflare.com/profile/api-tokens  →  Create Custom Token",
      "",
      "with these permissions:",
      "  Account · Cloudflare Pages · Edit          (required)",
      "  Account · Account Settings · Read          (required)",
      `  Zone · DNS · Edit, scoped to ${DOMAIN}     (only for --attach-domain)`,
      "",
      "The account ID is on the right-hand side of any domain's overview page,",
      "or from `npx wrangler whoami`.",
      "",
      "Then:",
      "  export CLOUDFLARE_API_TOKEN=...",
      "  export CLOUDFLARE_ACCOUNT_ID=...",
      "  npm run deploy",
      "",
      "Full instructions in DEPLOY.md.",
    ].join("\n"),
  );
}

function sh(command, commandArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

/**
 * Attaching the domain is a single API call rather than a wrangler command
 * because wrangler has no equivalent. It is idempotent enough: Cloudflare
 * returns an error we can recognise if the domain is already attached.
 */
async function attachDomain() {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT}/domains`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: DOMAIN }),
    },
  );
  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    console.log(`\n${DOMAIN} attached. DNS may take a few minutes to settle.`);
    return;
  }

  const already = body.errors?.some((e) => /already/i.test(e.message ?? ""));
  if (already) {
    console.log(`\n${DOMAIN} is already attached.`);
    return;
  }

  fail(
    [
      `Could not attach ${DOMAIN} (HTTP ${res.status}).`,
      JSON.stringify(body.errors ?? body, null, 2),
      "",
      `If the zone for ${DOMAIN} is not in this Cloudflare account yet, add it`,
      "first and change the nameservers at the registrar. See DEPLOY.md.",
    ].join("\n"),
  );
}

async function main() {
  requireCredentials();

  if (!has("skip-build")) {
    console.log(`Building for ${SITE_URL}`);
    await sh("npm", ["run", "build"], { NEXT_PUBLIC_SITE_URL: SITE_URL });
  }

  if (!existsSync("out/index.html")) {
    fail("No out/index.html. Run without --skip-build.");
  }

  await sh("npx", [
    "wrangler",
    "pages",
    "deploy",
    "out",
    `--project-name=${PROJECT}`,
    "--branch=main",
    "--commit-dirty=true",
  ]);

  if (has("attach-domain")) await attachDomain();
}

await main();
