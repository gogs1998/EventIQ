/**
 * The two places this application runs, and what each thing is called there.
 *
 * Every script that touches Cloudflare — the deploy, the backup, the renderer,
 * the cutout step — used to carry `const DATABASE = "eventiq"` at the top of it.
 * That was fine while there was one environment and is exactly the shape of
 * mistake a second one creates: a script pointed at the staging Worker and
 * writing to the production database looks like it is working.
 *
 * So the names live here once, and every script takes the same `--env` flag.
 * Production is the default, because it is what the existing commands in
 * DEPLOY.md mean and a flag that has to be passed to reach production is a flag
 * somebody will get wrong in the other direction.
 */

export const ENVIRONMENTS = {
  production: {
    worker: "eventiq",
    database: "eventiq",
    bucket: "eventiq-media",
    // The zone this sits in, for the custom domain. Not derived from the
    // hostname: a rule that takes the last two labels is wrong for a .co.uk.
    zone: "eventiq.win",
    domain: process.env.SITE_DOMAIN ?? "eventiq.win",
  },
  staging: {
    worker: "eventiq-staging",
    database: "eventiq-staging",
    bucket: "eventiq-media-staging",
    zone: "eventiq.win",
    domain: process.env.STAGING_DOMAIN ?? "staging.eventiq.win",
  },
};

/**
 * The environment named by `--env`, or production.
 *
 * An unknown name stops the script rather than falling back, because the two
 * ways of being wrong here are a typo and a shell that lost an argument, and
 * both of them silently mean production.
 */
export function environmentFrom(argv, fail) {
  const at = argv.indexOf("--env");
  const name = at === -1 ? "production" : argv[at + 1];
  const target = ENVIRONMENTS[name];
  if (!target) {
    fail(
      `There is no "${name}" environment. Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`,
    );
  }
  return { name, ...target };
}

/**
 * What wrangler needs to be told to reach a named environment, and nothing at
 * all for production, which is the top level of wrangler.jsonc.
 */
export function wranglerEnvArgs(name) {
  return name === "production" ? [] : ["--env", name];
}
