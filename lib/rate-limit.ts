import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Rate limiting for the three things a stranger can reach.
 *
 * /api/import-record takes no token, because the more valuable half of the
 * importer is the promoter filling in the fighters who never reply and putting it
 * behind an invite would remove that. What it does instead is refuse to be a
 * general-purpose proxy: a strict host and path allowlist, one canonical cache
 * row per fighter, and a week's cache in front of the source site.
 *
 * The login form and /api/track are open for their own reasons — one has to be
 * reachable to sign in and the other is called by every spectator's programme —
 * and neither of them bounds how often somebody can ask. So this does. It uses
 * Cloudflare's own rate limiting binding rather than a counter of our own,
 * because the counter is the thing being protected: a D1-backed limiter answers
 * an unauthenticated flood with a database write per request, which is the shape
 * of the problem rather than the fix.
 *
 * A missing binding refuses in production. There is one exception and it is only
 * for development: a limiter that is not there would otherwise take the login
 * form with it, and a laptop is not the thing being defended. Anything deployed
 * that has lost its binding fails closed, because a deployment missing its own
 * protection must not look like a working one.
 *
 * The per-address limiter is not the whole of the login defence. It counts
 * callers, and a password guessed from a thousand addresses is not a caller —
 * that is what the per-account lockout in lib/lockout.ts is for.
 */

/** Ten a minute per address. Nobody pastes links faster than that by hand. */
export const IMPORT_LOOKUPS_PER_MINUTE = 10;

/** Ten a minute per address. Somebody who has forgotten their password tries three. */
export const LOGIN_ATTEMPTS_PER_MINUTE = 10;

/**
 * Sixty a minute per address. A spectator reading a fifteen-bout card sends an
 * open, a handful of expands and the sponsors they tap, so this is loose enough
 * that a hall of people on one venue wifi are not counting against each other
 * and tight enough that a script cannot fill the table.
 */
export const TRACK_WRITES_PER_MINUTE = 60;

/**
 * Who is asking, as the edge sees it.
 *
 * `CF-Connecting-IP` is set by Cloudflare on every request that reaches a Worker
 * and cannot be spoofed by the client, which is why it is preferred over
 * `X-Forwarded-For` — that one is a header the caller writes. The forwarded
 * headers are read only as a fallback for running behind something else.
 *
 * Everything unattributable shares one bucket. That is deliberate: it means a
 * caller cannot escape the limit by arriving without an address, and it costs
 * only that local development shares its allowance with itself.
 */
/** Headers, from a request or from next/headers, which is read-only. */
export type HeaderReader = { get(name: string): string | null };

export function callerKey(headers: HeaderReader): string {
  const direct = headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;

  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  return "unattributed";
}

/** Keep in step with the ratelimits block in wrangler.jsonc. */
type Limiter = "IMPORT_LOOKUPS" | "LOGIN_ATTEMPTS" | "TRACK_WRITES";

async function within(name: Limiter, key: string): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const limiter = env[name];
  if (!limiter) return process.env.NODE_ENV !== "production";

  const { success } = await limiter.limit({ key });
  return success;
}

/** True while this caller is inside their allowance. */
export async function withinImportLimit(request: Request): Promise<boolean> {
  return within("IMPORT_LOOKUPS", callerKey(request.headers));
}

/**
 * Headers rather than a request, because the login form posts to a server action
 * and there is no Request to hand there.
 */
export async function withinLoginLimit(headers: HeaderReader): Promise<boolean> {
  return within("LOGIN_ATTEMPTS", callerKey(headers));
}

export async function withinTrackLimit(request: Request): Promise<boolean> {
  return within("TRACK_WRITES", callerKey(request.headers));
}
