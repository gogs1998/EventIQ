import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Rate limiting for the one endpoint that is open by design.
 *
 * /api/import-record takes no token, because the more valuable half of the
 * importer is the promoter filling in the fighters who never reply and putting it
 * behind an invite would remove that. What it does instead is refuse to be a
 * general-purpose proxy: a strict host and path allowlist, one canonical cache
 * row per fighter, and a week's cache in front of the source site.
 *
 * None of that bounds how often somebody can ask. So this does. It uses
 * Cloudflare's own rate limiting binding rather than a counter of our own,
 * because the counter is the thing being protected: a D1-backed limiter answers
 * an unauthenticated flood with a database write per request, which is the shape
 * of the problem rather than the fix.
 *
 * It fails closed. If there is no limiter to ask, the answer is no — an endpoint
 * that reaches somebody else's website on request should not be the thing that
 * keeps running when its own protection is missing.
 */

/** Ten a minute per address. Nobody pastes links faster than that by hand. */
export const IMPORT_LOOKUPS_PER_MINUTE = 10;

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
export function callerKey(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  return "unattributed";
}

/** True while this caller is inside their allowance. */
export async function withinImportLimit(request: Request): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const limiter = env.IMPORT_LOOKUPS;
  if (!limiter) return false;

  const { success } = await limiter.limit({ key: callerKey(request) });
  return success;
}
