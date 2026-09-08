import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The command and arguments that run a locally installed package binary.
 *
 * The scripts used to spawn `npx` by name. On Windows `npx` is a batch file,
 * and Node has refused to spawn batch files without a shell since the
 * command-injection fix, so the spawn fails with ENOENT before wrangler is ever
 * reached. Going through a shell instead would mean quoting every argument
 * ourselves, and one of them is a generated SQL statement.
 *
 * Resolving the package's own bin entry and running it under the Node that is
 * already running sidesteps the shell on every platform. It also means the
 * version that runs is the one in the lockfile, rather than whatever `npx`
 * decides to offer.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Which package provides each command name the scripts ask for. */
const PACKAGES = {
  wrangler: "wrangler",
  "opennextjs-cloudflare": "@opennextjs/cloudflare",
};

/**
 * Turns `["wrangler", ...args]` into `[node, [wrangler.js, ...args]]`, ready to
 * spread into spawn or execFileSync in place of `"npx", [...]`.
 */
export function localBin([name, ...args]) {
  const pkg = PACKAGES[name];
  if (!pkg) throw new Error(`no local package registered for the "${name}" command`);
  const dir = path.join(ROOT, "node_modules", ...pkg.split("/"));
  const { bin } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const entry = typeof bin === "string" ? bin : bin?.[name];
  if (!entry) throw new Error(`${pkg} does not provide a "${name}" binary`);
  return [process.execPath, [path.join(dir, entry), ...args]];
}
