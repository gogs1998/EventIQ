import { existsSync, readFileSync } from "node:fs";

/**
 * The values `wrangler dev` will hand the Worker.
 *
 * Wrangler treats .dev.vars as the environment and pays no attention to the
 * shell, so any tool that reads the same names outside the Worker has to do the
 * same or the two quietly disagree. That is not hypothetical: with a
 * SEED_PROMOTER_PASSWORD exported in the shell, the seed set one password and
 * the login page expected another, which reads as "the password is wrong" and
 * takes a while to stop believing.
 *
 * Node's own process.loadEnvFile is the wrong way round for this — it leaves an
 * existing environment variable in place — so the file is parsed here instead.
 */
export function devVars(file = ".dev.vars") {
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}
