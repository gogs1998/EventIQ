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
 * The environment named by `--env NAME` or `--env=NAME`, or production.
 *
 * An unknown name stops the script rather than falling back, because the two
 * ways of being wrong here are a typo and a shell that lost an argument, and
 * both of them silently mean production. So does anything else that starts
 * with `--env` and is not one of those two spellings: `--env=staging` used to
 * be read as no flag at all, which is production.
 */
export function environmentFrom(argv, fail) {
  const names = [];
  for (let at = 0; at < argv.length; at++) {
    const arg = String(argv[at]);
    if (arg === "--env") {
      names.push(String(argv[at + 1] ?? ""));
      at++;
    } else if (arg.startsWith("--env=")) {
      names.push(arg.slice("--env=".length));
    } else if (arg.startsWith("--env")) {
      fail(`"${arg}" is not a flag this understands. Use --env <name> or --env=<name>.`);
      return refused();
    }
  }

  if (new Set(names).size > 1) {
    fail(`--env was given more than once, as ${names.join(" and ")}. Say it once.`);
    return refused();
  }

  const name = names[0] ?? "production";
  const target = Object.hasOwn(ENVIRONMENTS, name) ? ENVIRONMENTS[name] : undefined;
  if (!target) {
    fail(
      `There is no "${name}" environment. Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`,
    );
    return refused();
  }
  return { name, ...target };
}

/**
 * What a refused call returns when `fail` did not stop the process: nothing a
 * script could mistake for a database.
 */
function refused() {
  return { name: undefined, worker: undefined, database: undefined, bucket: undefined, zone: undefined, domain: undefined };
}

/**
 * What wrangler needs to be told to reach a named environment, and nothing at
 * all for production, which is the top level of wrangler.jsonc.
 */
export function wranglerEnvArgs(name) {
  return name === "production" ? [] : ["--env", name];
}
