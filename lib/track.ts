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
