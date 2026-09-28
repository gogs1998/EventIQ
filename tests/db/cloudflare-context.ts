/**
 * Stands in for `@opennextjs/cloudflare` in the database suite.
 *
 * lib/db is aliased to ./bindings.ts, which covers every binding read through
 * that module. What it does not cover is lib/rate-limit.ts, which reaches for
 * the request context itself to find a rate-limiting binding — so anything
 * behind a limiter, the login form included, threw here rather than running.
 *
 * The env is empty on purpose rather than carrying a fake limiter. An absent
 * binding allows outside production and refuses inside it, which is the rule
 * lib/rate-limit.ts states, and it is the state a dev server is in as well. The
 * limiter's own behaviour is not what these tests are about; what is behind one
 * is.
 */
export async function getCloudflareContext(): Promise<{ env: Record<string, undefined> }> {
  return { env: {} };
}
