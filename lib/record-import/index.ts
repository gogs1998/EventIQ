import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";
import { parseProfileUrl, type ImportOutcome } from "@/lib/fighter-import";
import { parseSherdog } from "@/lib/record-import/sherdog";

/**
 * The server side of the record import: fetch one page, parse it, remember it.
 *
 * Caching is not an optimisation. It is what keeps this defensible: one
 * fighter's link costs the source site one request no matter how many times the
 * form is reopened or how many people look at the card afterwards. A week is
 * long enough to make reopening the form free and short enough that a fighter
 * who has just had a bout added can get the new number by waiting rather than by
 * ringing somebody.
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Long enough that a slow page does not hold a request open indefinitely. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * Identifies the request honestly and gives them somewhere to complain to.
 * Pretending to be Chrome to get past a block would be both dishonest and a
 * declaration that we know we are unwelcome.
 */
const USER_AGENT =
  "EventIQBot/1.0 (+https://eventiq.win/about-the-importer; one page per fighter, on request)";

const TAPOLOGY_MESSAGE =
  "Tapology blocks automated reading, so we can't pull your record from there. Paste a Sherdog link instead, or just fill the boxes in below — it takes a minute.";

function isChallenge(html: string): boolean {
  return html.includes("Just a moment...") || html.includes("cf-browser-verification");
}

async function fetchPage(url: string): Promise<{ html: string } | { failed: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return { failed: "That page didn't respond. Try again in a minute, or fill the boxes in below." };
  }

  if (response.status === 404) {
    return { failed: "There's no fighter at that link. Check it, or fill the boxes in below." };
  }
  if (!response.ok) {
    return { failed: "That site wouldn't let us read the page. Fill the boxes in below instead." };
  }

  const html = await response.text();
  if (isChallenge(html)) {
    return { failed: "That site wouldn't let us read the page. Fill the boxes in below instead." };
  }
  return { html };
}

/**
 * A failure is cached as a null payload as well as a success.
 *
 * Somebody whose page will not parse is the person most likely to press the
 * button again, and re-fetching a page we already know we cannot read is exactly
 * the behaviour that gets a scraper blocked.
 */
export async function importRecord(db: Db, input: string): Promise<ImportOutcome> {
  const ref = parseProfileUrl(input);
  if (!ref) return { ok: false, kind: "not-a-profile" };

  if (ref.source === "tapology") {
    return { ok: false, kind: "unreadable", source: "tapology", reason: TAPOLOGY_MESSAGE };
  }

  const now = Date.now();
  const [cached] = await db
    .select()
    .from(schema.importCache)
    .where(eq(schema.importCache.url, ref.url))
    .limit(1);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload
      ? { ok: true, tape: JSON.parse(cached.payload) }
      : {
          ok: false,
          kind: "unreadable",
          source: ref.source,
          reason: "We couldn't read anything off that page. Fill the boxes in below instead.",
        };
  }

  const fetched = await fetchPage(ref.url);
  const parsed = "html" in fetched ? parseSherdog(fetched.html) : null;

  await db
    .insert(schema.importCache)
    .values({ url: ref.url, source: ref.source, payload: parsed ? JSON.stringify(parsed) : null, fetchedAt: now })
    .onConflictDoUpdate({
      target: schema.importCache.url,
      set: { payload: parsed ? JSON.stringify(parsed) : null, fetchedAt: now },
    });

  if (!parsed) {
    return {
      ok: false,
      kind: "unreadable",
      source: ref.source,
      reason:
        "failed" in fetched
          ? fetched.failed
          : "We couldn't read anything off that page. Fill the boxes in below instead.",
    };
  }

  return { ok: true, tape: parsed };
}
