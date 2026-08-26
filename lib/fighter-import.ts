/**
 * Importing a fighter's tape from their existing record page.
 *
 * A fighter pastes their Sherdog or Tapology link and the boring half of the
 * questionnaire fills itself in. That is the half they abandon: nobody walks
 * away from picking a nickname, plenty walk away from "reach in centimetres".
 *
 * WHAT THESE SOURCES ACTUALLY CARRY
 *
 * Between them: record broken down by knockout, submission and decision;
 * height; date of birth; association or team; and often a nickname. Sherdog
 * keeps amateur bouts in a table separate from the professional record, which
 * matters here because amateur is all we care about.
 *
 * Neither reliably carries reach, stance, walkout song, sponsors, Instagram or
 * anything a fighter would say about themselves. Those stay manual, which is
 * fine, because those are the fields that make a spectator care.
 *
 * TAPOLOGY CANNOT BE READ FROM A SERVER
 *
 * The earlier research here assumed Tapology would be the better primary source,
 * because its UK and Ireland amateur coverage is much stronger than Sherdog's.
 * That assumption is wrong in practice. Tapology sits behind a Cloudflare
 * interactive challenge and returns 403 with "Just a moment..." to any request
 * that is not a real browser, including from a Worker. Sherdog returns clean
 * HTML to a plain fetch.
 *
 * So Tapology links are still recognised, and the fighter is told plainly that
 * we cannot read that site and asked for a Sherdog link or the boxes below.
 * Guessing at their record would be worse than asking, and driving a headless
 * browser to get past a challenge that exists to stop exactly that is not a
 * thing to build into a product.
 *
 * IMPORTED VALUES ARE SUGGESTIONS, NOT FACTS
 *
 * Amateur records go stale. A programme that misstates a fighter's record in
 * front of a room that knows better is worse than one that says nothing, which
 * is the same principle behind isDebut refusing to treat silence as a debut. So
 * everything imported is marked with where it came from and has to be confirmed
 * by the fighter, who is the only person who actually knows.
 */

export type ImportSource = "sherdog" | "tapology";

export type ProfileRef = {
  source: ImportSource;
  /**
   * The URL we would fetch, rebuilt from the host and the slug rather than
   * passed through. Whatever the caller pasted — extra path segments, a query
   * string, a fragment — one fighter resolves to one address.
   */
  url: string;
  /**
   * The row this is cached under. The same URL lowercased, because Sherdog
   * redirects a lowercased slug to its own casing anyway, so treating the two as
   * one page costs a redirect on the first fetch and saves a cache row and an
   * outbound request on every case-shuffled repeat.
   */
  cacheKey: string;
  /** Slug portion, useful for echoing the name back before any fetch. */
  slug?: string;
};

export type ImportedTape = {
  source: ImportSource;
  nickname?: string;
  age?: number;
  heightCm?: number;
  gym?: string;
  record?: { w: number; l: number; d: number };
  finishes?: { ko: number; sub: number };
  /**
   * Which of a fighter's two records this is. Somebody with both will see very
   * different numbers depending on the answer, so it is never left implied.
   */
  recordKind?: "amateur" | "professional";
  /** Fields no record site carries, so the fighter still has to answer them. */
  notCovered: string[];
};

const HOSTS: {
  pattern: RegExp;
  source: ImportSource;
  path: RegExp;
  /** Rebuilt rather than reused, which is what makes one fighter one address. */
  canonical: (slug: string) => string;
}[] = [
  {
    pattern: /(^|\.)sherdog\.com$/i,
    source: "sherdog",
    path: /^\/fighter\/([^/?#]+)/i,
    canonical: (slug) => `https://www.sherdog.com/fighter/${slug}`,
  },
  {
    pattern: /(^|\.)tapology\.com$/i,
    source: "tapology",
    path: /^\/fightcenter\/fighters\/([^/?#]+)/i,
    canonical: (slug) => `https://www.tapology.com/fightcenter/fighters/${slug}`,
  },
];

/**
 * Recognises a fighter profile URL. Returns null rather than guessing, so a
 * mistyped link produces a clear message instead of a silent no-op.
 *
 * The URL that comes back is rebuilt from the allowlisted host and the matched
 * slug, so the query string, the fragment and any trailing path are gone. That
 * matters beyond tidiness: /api/import-record is open by design and writes a
 * cache row per distinct URL, so passing the pasted string through made
 * `?bust=1`, `?bust=2` and so on an unbounded number of rows in D1 and an
 * unbounded number of requests to somebody else's website.
 */
export function parseProfileUrl(input: string): ProfileRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  for (const host of HOSTS) {
    if (!host.pattern.test(parsed.hostname)) continue;
    const match = parsed.pathname.match(host.path);
    if (!match) return null;

    const url = host.canonical(match[1]);
    return { source: host.source, url, cacheKey: url.toLowerCase(), slug: match[1] };
  }

  return null;
}

export const SOURCE_LABEL: Record<ImportSource, string> = {
  sherdog: "Sherdog",
  tapology: "Tapology",
};

export type ImportOutcome =
  | { ok: true; tape: ImportedTape & { name?: string } }
  /** Recognised the link but could not read the page. `reason` is shown as-is. */
  | { ok: false; kind: "unreadable"; source: ImportSource; reason: string }
  /**
   * Too many lookups from one caller. Nothing wrong with the link, so the
   * message says so and points at the boxes rather than blaming the fighter.
   */
  | { ok: false; kind: "too-many"; reason: string }
  | { ok: false; kind: "not-a-profile" };

/**
 * Asks the server to fetch and parse the one pasted URL.
 *
 * The URL is validated here as well as on the server, so an obvious typo costs
 * nothing and never reaches the other site. Fetching a single page, on the
 * fighter's own instruction, at human rate is a far more defensible posture than
 * bulk crawling, and it is worth keeping it that way deliberately.
 */
export async function lookupTape(input: string): Promise<ImportOutcome> {
  const ref = parseProfileUrl(input);
  if (!ref) return { ok: false, kind: "not-a-profile" };

  const response = await fetch("/api/import-record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: ref.url }),
  });

  // A refusal on grounds of rate carries its own message and its own status, so
  // it is read rather than flattened into "something went wrong".
  if (response.status === 429) return (await response.json()) as ImportOutcome;

  if (!response.ok) {
    return {
      ok: false,
      kind: "unreadable",
      source: ref.source,
      reason: "Something went wrong looking that up. Try again, or fill the boxes in below.",
    };
  }

  return (await response.json()) as ImportOutcome;
}
