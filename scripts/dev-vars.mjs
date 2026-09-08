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
 *
 * Split on `\r?\n` rather than `\n`. In JavaScript `$` without the `m` flag
 * asserts the end of the string and nothing else, and `.` will not cross a
 * carriage return, so every line of a CRLF file failed to match and this
 * returned an empty object — on Windows, where the repository's files are CRLF,
 * for every caller. What that looked like was the renderer insisting RENDER_KEY
 * was not set with the key sitting in the file it names, and the seed quietly
 * ignoring SEED_PROMOTER_PASSWORD, which is the exact confusion this file was
 * written to prevent.
 */
export function devVars(file = ".dev.vars") {
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}
