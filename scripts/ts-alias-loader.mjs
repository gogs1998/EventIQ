import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Teaches Node's ES module resolver the `@/` alias from tsconfig.json.
 *
 * The seed script shares lib/seed.ts with the application so that the demo card
 * and the fixture the tests run against cannot drift apart. That module imports
 * with `@/`, which the bundler understands and plain Node does not, and Node's
 * type stripping also wants an explicit extension. Fifteen lines of resolver is
 * a smaller price than either a second copy of the seed logic or a build step
 * for one script.
 */
const root = pathToFileURL(`${process.cwd()}/`);

export function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);

  const base = new URL(specifier.slice(2), root);
  for (const candidate of [`${base.href}.ts`, `${base.href}/index.ts`, base.href]) {
    if (existsSync(fileURLToPath(candidate))) return next(candidate, context);
  }
  return next(base.href, context);
}
