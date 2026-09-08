import { getDb } from "@/lib/db";
import { eventVisibility } from "@/lib/db/queries";
import {
  TOO_MANY_LOOKUPS,
  UNATTRIBUTED_SCOPE,
  eventScope,
  importRecord,
} from "@/lib/record-import";
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
  let slug: unknown;
  try {
    ({ url, slug } = (await request.json()) as { url?: unknown; slug?: unknown });
  } catch {
    return Response.json({ ok: false, kind: "not-a-profile" });
  }

  if (typeof url !== "string") {
    return Response.json({ ok: false, kind: "not-a-profile" });
  }

  const db = await getDb();

  // Which allowance this lookup is counted against. The show a fighter is on,
  // where they named one we recognise, so one card's thirty fighters cannot use
  // up another card's hour. It is not a credential and grants nothing: naming
  // somebody else's show only chooses which bounded allowance to spend.
  const event = typeof slug === "string" && slug ? await eventVisibility(db, slug) : null;
  const scope = event ? eventScope(event.id) : UNATTRIBUTED_SCOPE;

  const outcome = await importRecord(db, url, scope);
  return Response.json(outcome);
}
