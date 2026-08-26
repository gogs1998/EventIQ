import { getDb } from "@/lib/db";
import { TOO_MANY_LOOKUPS, importRecord } from "@/lib/record-import";
import { withinImportLimit } from "@/lib/rate-limit";

/**
 * Fetches and parses the one URL a fighter pasted.
 *
 * Open without a token on purpose. It reads nothing and writes nothing except a
 * cache row, and putting it behind an invite would stop a promoter using the
 * same tool to fill in the fighters who never reply — which is the more valuable
 * half of this feature.
 *
 * Three things keep that from being a liability. parseProfileUrl is a strict
 * allowlist of two hosts and one path shape each, so the reachable set is
 * Sherdog fighter pages and nothing else. The URL it returns is rebuilt from the
 * slug, so one fighter is one cache row and one outbound request however the
 * link was decorated. And the caller is rate limited, because neither of the
 * other two bounds how often somebody can ask.
 */
export async function POST(request: Request) {
  if (!(await withinImportLimit(request))) {
    return Response.json(TOO_MANY_LOOKUPS, { status: 429 });
  }

  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return Response.json({ ok: false, kind: "not-a-profile" });
  }

  if (typeof url !== "string") {
    return Response.json({ ok: false, kind: "not-a-profile" });
  }

  const outcome = await importRecord(await getDb(), url);
  return Response.json(outcome);
}
