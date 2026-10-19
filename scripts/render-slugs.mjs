/**
 * The shows the hourly render run should look at, out of `wrangler d1 execute
 * --json` on stdin, one slug per line on stdout.
 *
 *   npx wrangler d1 execute eventiq --remote --json --command "SELECT slug ..." \
 *     | node scripts/render-slugs.mjs
 *
 * It exists because the workflow used to do this in an inline `node -e` that
 * read `JSON.parse(s)[0]?.results ?? []`. Anything that was not the shape it
 * expected — wrangler's own `{"error": ...}` when D1 could not be reached, an
 * empty answer, a login prompt — came out as no slugs at all, and no slugs is
 * the ordinary quiet hour: "No published show is close enough to want
 * rendering", a green tick, and nothing rendered on the day of a show. So this
 * refuses anything it does not recognise and exits 1, and the workflow's
 * pipefail carries wrangler's own exit code as well.
 */
import { pathToFileURL } from "node:url";

/** The slugs in one wrangler JSON answer, or a thrown error saying why not. */
export function slugsFrom(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`wrangler did not answer with JSON: ${String(raw).trim().slice(0, 200) || "(nothing)"}`);
  }
  if (parsed && !Array.isArray(parsed) && parsed.error) {
    const error = parsed.error;
    throw new Error(`wrangler answered with an error: ${error.text ?? error.message ?? JSON.stringify(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`wrangler's answer was not a list of results: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  const [first] = parsed;
  if (first?.success === false || first?.error) {
    throw new Error(`the query failed: ${JSON.stringify(first.error ?? first).slice(0, 200)}`);
  }
  if (!Array.isArray(first?.results)) {
    throw new Error(`the query answered with no results list: ${JSON.stringify(first).slice(0, 200)}`);
  }
  return first.results.map((row) => {
    if (typeof row?.slug !== "string" || !row.slug) {
      throw new Error(`a row had no slug: ${JSON.stringify(row)}`);
    }
    return row.slug;
  });
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    for (const slug of slugsFrom(raw)) console.log(slug);
  } catch (error) {
    console.error(`::error title=Could not list the shows to render::${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
