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
  /** The town they are billed out of, not the country. */
  hometown?: string;
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

/**
 * What an import would do to one box, shown before it does it.
 *
 * The promoter's paste box writes to somebody else's profile — a fighter who has
 * not answered, on the promoter's own card — so it does not simply save. It
 * shows what is on the card, what is on the page, and which of the two would
 * win, and waits. That is the same principle as the badge on the fighter's own
 * form: an imported value is a suggestion, and amateur records go stale.
 */
export type ImportField = "name" | "record" | "finishes" | "age" | "hometown";

export type RecordFill = {
  key: ImportField;
  label: string;
  /** What the card says now, or null where the box is empty. */
  from: string | null;
  /** What the page says. */
  to: string;
  /**
   * Whether confirming would write it. False wherever the card already has an
   * answer: anything a person typed wins over anything a page said, and the row
   * is still shown so the promoter can see the two disagree.
   */
  fills: boolean;
};

/** "From" rather than "Hometown", because that is what the tape row is called. */
const FIELD_LABEL: Record<ImportField, string> = {
  name: "Name",
  record: "Record",
  finishes: "Finishes",
  age: "Age",
  hometown: "From",
};

/** What the card holds now for the five boxes an import can fill. */
export type ImportTarget = {
  name?: string | null;
  record?: { w: number; l: number; d: number } | null;
  finishes?: { ko: number; sub: number } | null;
  age?: number | null;
  hometown?: string | null;
};

/** The way a card prints a record: the draws only where there are any. */
function recordLabel(record: { w: number; l: number; d: number }): string {
  return record.d > 0 ? `${record.w}-${record.l}-${record.d}` : `${record.w}-${record.l}`;
}

/**
 * How the wins finished, spelled out rather than totalled.
 *
 * The tape prints one number, because that is the row it contests. This is a
 * confirmation the promoter reads before anything is written, and the two
 * columns are stored separately and answered separately on the fighter's own
 * form, so both are named. Zeroes are said rather than dropped: a page reporting
 * no knockouts is telling us something, and a half-shown pair would leave the
 * promoter agreeing to a number they had not been shown.
 */
function finishesLabel(finishes: { ko: number; sub: number }): string {
  return `${finishes.ko} by knockout, ${finishes.sub} by submission`;
}

/** Text somebody has actually given us. A box of spaces is an empty box. */
function given(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

/**
 * Every box this import has something to say about, and which of them it would
 * fill. Pure, so the confirmation the promoter reads and the write that follows
 * it are worked out by the same function rather than by two that might differ.
 */
export function recordDiff(
  target: ImportTarget,
  tape: ImportedTape & { name?: string },
): RecordFill[] {
  const rows: RecordFill[] = [];

  const add = (key: ImportField, from: string | undefined, to: string | undefined) => {
    if (!to) return;
    rows.push({ key, label: FIELD_LABEL[key], from: from ?? null, to, fills: !from });
  };

  add("name", given(target.name), given(tape.name));
  add("record", target.record ? recordLabel(target.record) : undefined, tape.record ? recordLabel(tape.record) : undefined);
  // Sherdog counts the knockouts and submissions it lists and the parser has
  // always carried them; the promoter's importer wrote four fields and dropped
  // them, so the finish rate — a hook and a contested row on the tape — stayed
  // empty on a fighter whose record had just been filled in from the same page.
  add(
    "finishes",
    target.finishes ? finishesLabel(target.finishes) : undefined,
    tape.finishes ? finishesLabel(tape.finishes) : undefined,
  );
  add("age", target.age ? String(target.age) : undefined, tape.age ? String(tape.age) : undefined);
  add("hometown", given(target.hometown), given(tape.hometown));

  return rows;
}

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
 *
 * `slug` is the show the fighter is on. It is not a credential and is not
 * treated as one — this endpoint takes none, by design — it is only what the
 * hourly ceiling is counted against, so one show's thirty fighters cannot use up
 * another show's allowance. A caller who names somebody else's show is choosing
 * which bounded allowance to spend, which is not worth anything to them.
 *
 * The promoter's own paste box does not come through here at all: it goes to a
 * server action with their session on it, and is counted against them.
 */
export async function lookupTape(input: string, slug?: string): Promise<ImportOutcome> {
  const ref = parseProfileUrl(input);
  if (!ref) return { ok: false, kind: "not-a-profile" };

  const response = await fetch("/api/import-record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: ref.url, slug }),
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
