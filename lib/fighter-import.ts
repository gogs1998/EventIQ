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
 * height; weight class; date of birth; association or team; and often a
 * nickname. Sherdog keeps amateur bouts in a separate table from the pro
 * record, which matters here because amateur is all we care about. Tapology has
 * considerably better amateur coverage for the UK and Ireland, including
 * dedicated amateur rankings, so it is the more useful of the two for this
 * audience even though Sherdog is the better known name.
 *
 * Neither reliably carries reach, stance, walkout song, sponsors, Instagram or
 * anything a fighter would say about themselves. Those stay manual, which is
 * fine, because those are the fields that make a spectator care.
 *
 * IMPORTED VALUES ARE SUGGESTIONS, NOT FACTS
 *
 * Amateur records on both sites are frequently stale or wrong. A programme that
 * misstates a fighter's record in front of a room that knows better is worse
 * than a programme that says nothing, which is the same principle behind
 * `isDebut` refusing to treat silence as a debut. So everything imported is
 * marked with where it came from and has to be confirmed by the fighter, who is
 * the only person who actually knows.
 *
 * THIS IMPLEMENTATION IS A STUB
 *
 * Reading a real profile means fetching and parsing HTML, which needs a server;
 * this demo is a static export. `lookupTape` therefore resolves sample data.
 * The signature is the one a real implementation should keep: give it a URL,
 * get back a partial tape or null. The real version belongs behind an endpoint
 * that fetches the single pasted URL server-side — which is also a far more
 * defensible posture than bulk crawling, since it is one page, on the
 * fighter's own instruction, at human rate.
 */

export type ImportSource = "sherdog" | "tapology";

export type ProfileRef = {
  source: ImportSource;
  /** The canonical URL we would fetch. */
  url: string;
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
  /** Fields no record site carries, so the fighter still has to answer them. */
  notCovered: string[];
};

const HOSTS: { pattern: RegExp; source: ImportSource; path: RegExp }[] = [
  {
    pattern: /(^|\.)sherdog\.com$/i,
    source: "sherdog",
    path: /^\/fighter\/([^/?#]+)/i,
  },
  {
    pattern: /(^|\.)tapology\.com$/i,
    source: "tapology",
    path: /^\/fightcenter\/fighters\/([^/?#]+)/i,
  },
];

/**
 * Recognises a fighter profile URL. Returns null rather than guessing, so a
 * mistyped link produces a clear message instead of a silent no-op.
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
    return { source: host.source, url: parsed.toString(), slug: match[1] };
  }

  return null;
}

export const SOURCE_LABEL: Record<ImportSource, string> = {
  sherdog: "Sherdog",
  tapology: "Tapology",
};

/** Fields a fighter always has to supply themselves, whatever we import. */
const NOT_COVERED = ["Reach", "Stance", "Photo", "Instagram", "Sponsors", "Walkout song"];

/**
 * Sample response, standing in for a server-side fetch and parse.
 *
 * Returns the demo fighter's amateur record regardless of which valid profile
 * URL is pasted, because in the walkthrough you are playing that fighter. The
 * UI says as much rather than implying a live lookup happened.
 */
export async function lookupTape(input: string): Promise<ImportedTape | null> {
  const ref = parseProfileUrl(input);
  if (!ref) return null;

  // Enough delay that the interaction reads as a lookup rather than a toggle.
  await new Promise((resolve) => setTimeout(resolve, 900));

  return {
    source: ref.source,
    age: 21,
    heightCm: 174,
    gym: "Bryn Athletic",
    record: { w: 2, l: 1, d: 0 },
    finishes: { ko: 1, sub: 0 },
    notCovered: NOT_COVERED,
  };
}
