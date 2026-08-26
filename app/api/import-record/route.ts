import { getDb } from "@/lib/db";
import { importRecord } from "@/lib/record-import";

/**
 * Fetches and parses the one URL a fighter pasted.
 *
 * Open without a token on purpose. It reads nothing and writes nothing except a
 * cache row, and putting it behind an invite would stop a promoter using the
 * same tool to fill in the fighters who never reply — which is the more valuable
 * half of this feature.
 *
 * What stops it being a general-purpose proxy is parseProfileUrl, which is a
 * strict allowlist of two hosts and one path shape each. The reachable set is
 * therefore Sherdog fighter pages and nothing else, and every one of those is
 * cached for a week after the first fetch.
 */
export async function POST(request: Request) {
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
