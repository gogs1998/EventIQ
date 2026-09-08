import { isAutomatedAgent } from "@/lib/bots";
import type { AnalyticsKind } from "@/lib/types";

/**
 * What /api/track will accept before it looks anything up.
 *
 * The endpoint takes no credential and cannot: it is called by every spectator's
 * programme, from a beacon that has already been sent by the time the page has
 * gone. So what it can do is refuse to write anything it has not recognised.
 * Everything here is a shape check with no database in it, which is why it is a
 * function rather than a paragraph inside the route — the counts are the
 * evidence a promoter hands a sponsor, and a table anybody can put rows in is
 * not evidence of anything.
 *
 * Whether the ids in an accepted body actually belong to the show is the other
 * half, and it needs queries: lib/db/queries.ts, trackRefsBelong.
 *
 * There is deliberately nothing here that identifies a person. `sessionId` is a
 * random value from sessionStorage, bounded rather than parsed, and it is the
 * only thing in the row that outlives the request. See section 9.
 */

/**
 * What the request itself says about who is asking. Never the address, never a
 * cookie: nothing here is stored and nothing here identifies a person.
 */
export type RequestSignals = {
  userAgent: string | null;
  secFetchMode: string | null;
  secFetchSite: string | null;
  secFetchDest: string | null;
};

export function trackSignals(headers: Headers): RequestSignals {
  return {
    userAgent: headers.get("user-agent"),
    secFetchMode: headers.get("sec-fetch-mode"),
    secFetchSite: headers.get("sec-fetch-site"),
    secFetchDest: headers.get("sec-fetch-dest"),
  };
}

/** `Sec-Fetch-Site` values that are not a page of ours calling its own endpoint. */
const FOREIGN_SITE = new Set(["none", "cross-site"]);

/**
 * Whether this request is a spectator reading a programme.
 *
 * The guess falls the opposite way from the one in lib/bots.ts, and on purpose.
 * An unrecognised fetcher marking an invite as opened costs a promoter one
 * wasted phone call; an unrecognised fetcher counted as a spectator goes into
 * the report that promoter hands a sponsor, and a number that cannot be defended
 * is worth less than no number. So anything that does not look like a browser is
 * dropped, and the cost of that is under-counting, which is the error this
 * product is allowed to make.
 *
 * Three things, all free, none of them stored:
 *
 * - **The agent.** Crawlers, unfurlers, headless browsers and scripted clients,
 *   by name — `isAutomatedAgent`. A request with no agent at all is dropped as
 *   well: every browser sends one, and the beacon is sent by a browser.
 * - **`Sec-Fetch-*`.** A beacon from our own page arrives with all three set by
 *   the browser, which will not let a caller forge them. A POST with none of
 *   them is something else holding an HTTP client. The cost is Safari before
 *   16.4, which sent none of these — those spectators go uncounted rather than
 *   miscounted, which is the trade this whole function makes.
 * - **Where it came from.** `none` is somebody typing an address, `cross-site`
 *   is another origin posting at us. Neither is a programme counting itself.
 *
 * `same-site` is kept alongside `same-origin` because the programme is reachable
 * on more than one hostname of the same zone and a beacon from one of those is
 * still a spectator.
 */
export function countableRequest(signals: RequestSignals): boolean {
  if (!signals.userAgent || isAutomatedAgent(signals.userAgent)) return false;

  const site = signals.secFetchSite?.toLowerCase() ?? null;
  if (site && FOREIGN_SITE.has(site)) return false;

  return Boolean(signals.secFetchMode || site || signals.secFetchDest);
}

const KINDS = new Set<string>([
  "programme_open",
  "bout_expand",
  "tape_play",
  "sponsor_tap",
  "profile_view",
] satisfies AnalyticsKind[]);

/** Slugs and ids are generated here, so they are known shapes rather than free text. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SESSION_ID = /^[A-Za-z0-9-]{8,36}$/;

/** A fifteen-bout card is a big one. Anything past this is not a running order. */
const MAX_BOUT_NUMBER = 99;

export type TrackWrite = {
  slug: string;
  kind: AnalyticsKind;
  boutNumber: number | null;
  fighterId: string | null;
  sponsorId: string | null;
  sessionId: string | null;
};

/**
 * The row this body would write, or null for anything not recognised.
 *
 * Absent is allowed and malformed is not, which is the distinction that matters:
 * a programme open carries no bout number, but a bout number that is not a bout
 * number is a caller doing something other than reading a programme, and the
 * count it would write is worth less than nothing.
 */
export function parseTrackBody(body: unknown): TrackWrite | null {
  if (typeof body !== "object" || body === null) return null;
  const fields = body as Record<string, unknown>;

  const kind = fields.kind;
  const slug = fields.slug;
  if (typeof kind !== "string" || !KINDS.has(kind)) return null;
  if (typeof slug !== "string" || !SLUG.test(slug)) return null;

  const boutNumber = optionalNumber(fields.boutNumber);
  const fighterId = optionalText(fields.fighterId, ID);
  const sponsorId = optionalText(fields.sponsorId, ID);
  const sessionId = optionalText(fields.sessionId, SESSION_ID);
  if (
    boutNumber === undefined ||
    fighterId === undefined ||
    sponsorId === undefined ||
    sessionId === undefined
  ) {
    return null;
  }

  return { slug, kind: kind as AnalyticsKind, boutNumber, fighterId, sponsorId, sessionId };
}

/** null where the field was left out, undefined where it was there and wrong. */
function optionalText(value: unknown, shape: RegExp): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !shape.test(value)) return undefined;
  return value;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 1 && value <= MAX_BOUT_NUMBER ? value : undefined;
}
