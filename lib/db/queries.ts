import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { newId } from "@/lib/auth";
import { inviteSecret, type Db } from "@/lib/db";
import type { Card } from "@/lib/card";
import {
  digestToken,
  inviteLive,
  isSentChannel,
  newInviteToken,
  openToken,
} from "@/lib/invite-token";
import { logWarning } from "@/lib/log";
import { renderUrl, sponsorMark, type Renders } from "@/lib/renders";
import type {
  AnalyticsKind,
  Billing,
  Bout,
  Discipline,
  FightEvent,
  Fighter,
  Invite,
  Sponsor,
  Stance,
} from "@/lib/types";

/**
 * The seam between rows and the shapes the rest of the app understands.
 *
 * Nothing outside this file knows what the tables look like, and nothing inside
 * it knows what the pages look like. That is what lets lib/tape.ts stay a pure
 * function of Fighter and Bout, which is what lets it keep its tests.
 *
 * The mapping is deliberately strict about absence. A null column becomes an
 * absent field, never a zero and never an empty string, because every surface in
 * this product treats "they did not say" differently from "they said none".
 */

type FighterRow = typeof schema.fighters.$inferSelect;
type BoutRow = typeof schema.bouts.$inferSelect;
type SponsorRow = typeof schema.sponsors.$inferSelect;
type EventRow = typeof schema.events.$inferSelect;
type PromoterRow = typeof schema.promoters.$inferSelect;
type InviteRow = typeof schema.invites.$inferSelect;

function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/**
 * The one column here holding JSON, read for every fighter on every card.
 *
 * We wrote it, so it should always parse — but this runs six rows before
 * anything renders, so a value that does not costs the whole show its programme,
 * its dashboard and its renders rather than costing one fighter their tags. A
 * column that cannot be read is treated as a column nobody filled in, which is a
 * state every surface downstream already handles.
 */
function toStyleTags(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    const tags = Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
    return tags.length ? tags : undefined;
  } catch {
    return undefined;
  }
}

export function toFighter(row: FighterRow, sponsorIds: string[]): Fighter {
  return {
    id: row.id,
    name: row.name,
    gym: row.gym,
    nickname: optional(row.nickname),
    hometown: optional(row.hometown),
    age: optional(row.age),
    heightCm: optional(row.heightCm),
    reachCm: optional(row.reachCm),
    stance: optional(row.stance) as Stance | undefined,
    photo: optional(row.photo),
    cutout: optional(row.cutout),
    stylised: optional(row.stylised),
    instagram: optional(row.instagram),
    // All three or none. A partly stored record would be a bug upstream, and
    // reading it as 0 would turn a fighter with fights into a debutant.
    record:
      row.recordW !== null && row.recordL !== null && row.recordD !== null
        ? { w: row.recordW, l: row.recordL, d: row.recordD }
        : undefined,
    finishes:
      row.finishKo !== null && row.finishSub !== null
        ? { ko: row.finishKo, sub: row.finishSub }
        : undefined,
    walkoutSong: row.walkoutTitle
      ? { title: row.walkoutTitle, artist: row.walkoutArtist ?? "Unknown" }
      : undefined,
    bio: optional(row.bio),
    styleTags: toStyleTags(row.styleTags),
    sponsorIds: sponsorIds.length ? sponsorIds : undefined,
  };
}

function toSponsor(row: SponsorRow): Sponsor {
  return {
    id: row.id,
    name: row.name,
    qualifier: optional(row.qualifier),
    // The promoter's own upload where there is one, the curated artwork
    // otherwise. Resolved here so the strip, the lockup and the tape all get the
    // same answer from the one place that reads the columns.
    mark: sponsorMark(row),
    url: optional(row.url),
  };
}

function toBout(row: BoutRow): Bout {
  return {
    number: row.number,
    discipline: row.discipline as Discipline,
    weightKg: row.weightKg,
    classLabel: optional(row.classLabel),
    titleLabel: optional(row.titleLabel),
    womens: row.womens || undefined,
    rounds: row.rounds,
    roundMinutes: row.roundMinutes,
    billing: optional(row.billing) as Billing | undefined,
    redId: row.redId,
    blueId: row.blueId,
    sponsorId: optional(row.sponsorId),
    cancelled: row.cancelled || undefined,
    cancelledNote: optional(row.cancelledNote),
  };
}

function toEvent(
  row: EventRow,
  promoter: PromoterRow,
  bouts: Bout[],
  showSponsorIds: string[],
): FightEvent {
  return {
    slug: row.slug,
    name: row.name,
    tagline: optional(row.tagline),
    date: row.date,
    doorsTime: row.doorsTime,
    firstBellTime: row.firstBellTime,
    venue: row.venue,
    city: row.city,
    sanctioning: optional(row.sanctioning),
    promoter: {
      name: promoter.name,
      mark: optional(promoter.mark),
      instagram: optional(promoter.instagram),
    },
    backdrop: optional(row.backdrop),
    showSponsorIds,
    bouts,
  };
}

/**
 * The token is passed in rather than read off the row, because getting it back
 * out of the row is an async decryption and this mapping is not. The caller that
 * has the key does that once for the whole card; everything else gets an invite
 * with no token on it, which is all any other surface needs.
 */
export function toInvite(row: InviteRow, token?: string): Invite {
  return {
    fighterId: row.fighterId,
    token,
    sentAt: optional(row.sentAt),
    sentChannel: isSentChannel(row.sentChannel) ? row.sentChannel : undefined,
    lastOpenedAt: optional(row.lastOpenedAt),
    submittedAt: optional(row.submittedAt),
    expiresAt: optional(row.expiresAt),
    revokedAt: optional(row.revokedAt),
  };
}

// ------------------------------------------------------------------- reads

export type LoadedCard = Card & { eventId: string; promoterId: string; published: boolean };

/**
 * Everything one show needs, in a fixed number of queries.
 *
 * Six round trips regardless of how many bouts are on the card, rather than one
 * per fighter. D1 charges per row read and a fifteen-bout card touches thirty
 * fighters, so the difference between this and the obvious loop is the
 * difference between a page that is cheap and one that is not.
 */
export async function loadCard(db: Db, slug: string): Promise<LoadedCard | null> {
  const [eventRow] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.slug, slug))
    .limit(1);
  if (!eventRow) return null;

  const [promoterRow] = await db
    .select()
    .from(schema.promoters)
    .where(eq(schema.promoters.id, eventRow.promoterId))
    .limit(1);
  if (!promoterRow) return null;

  const boutRows = await db
    .select()
    .from(schema.bouts)
    .where(eq(schema.bouts.eventId, eventRow.id))
    .orderBy(schema.bouts.number);

  const fighterIds = [...new Set(boutRows.flatMap((bout) => [bout.redId, bout.blueId]))];

  const fighterRows = fighterIds.length
    ? await db.select().from(schema.fighters).where(inArray(schema.fighters.id, fighterIds))
    : [];

  const fighterSponsorRows = fighterIds.length
    ? await db
        .select()
        .from(schema.fighterSponsors)
        .where(inArray(schema.fighterSponsors.fighterId, fighterIds))
        .orderBy(schema.fighterSponsors.position)
    : [];

  const eventSponsorRows = await db
    .select()
    .from(schema.eventSponsors)
    .where(eq(schema.eventSponsors.eventId, eventRow.id))
    .orderBy(schema.eventSponsors.position);

  // Every sponsor this promoter has, so bout sponsors, show sponsors and fighter
  // sponsors all resolve from one map. A promoter's book is a few dozen rows.
  const sponsorRows = await db
    .select()
    .from(schema.sponsors)
    .where(eq(schema.sponsors.promoterId, eventRow.promoterId));

  const sponsorsByFighter = new Map<string, string[]>();
  for (const link of fighterSponsorRows) {
    const list = sponsorsByFighter.get(link.fighterId) ?? [];
    list.push(link.sponsorId);
    sponsorsByFighter.set(link.fighterId, list);
  }

  const fighters: Record<string, Fighter> = {};
  for (const row of fighterRows) {
    fighters[row.id] = toFighter(row, sponsorsByFighter.get(row.id) ?? []);
  }

  const sponsors: Record<string, Sponsor> = {};
  for (const row of sponsorRows) sponsors[row.id] = toSponsor(row);

  return {
    eventId: eventRow.id,
    promoterId: eventRow.promoterId,
    published: eventRow.published,
    event: toEvent(
      eventRow,
      promoterRow,
      boutRows.map(toBout),
      eventSponsorRows.map((link) => link.sponsorId),
    ),
    fighters,
    sponsors,
  };
}

/**
 * The one show the shop window runs on: the pitch page, the sitemap, `/f/demo`
 * and the bare `/qr` route.
 *
 * It used to be "the published show with the furthest-out date", picked across
 * the whole instance. With one promoter that was a fair guess at which card was
 * being sold. With two it is a leak in the ordinary course of business: the
 * second promoter publishes a show dated later than the demo, and EventIQ's own
 * front page, its sitemap and its printable table card all swing onto their
 * event, their venue and their fighters, with nobody having done anything and
 * nothing on the page to say it has happened.
 *
 * So the demo is named rather than inferred, in `SHOWCASE_SLUG`. Unset, unknown
 * or unpublished all mean no showcase, and the pages make their argument without
 * a live card — which is the state a fresh instance is in anyway.
 *
 * **Published only**, rather than the `visibleTo` rule the public routes use.
 * This is a shop window and there is no viewer to ask about: a draft named here
 * must not become a public page by being named.
 */
export async function loadShowcase(
  db: Db,
  slug: string | null | undefined,
): Promise<LoadedCard | null> {
  if (!slug) return null;
  const card = await loadCard(db, slug);
  return card?.published ? card : null;
}

/**
 * Every invite on a card, with the links decrypted.
 *
 * The dashboard is the reason the token is encrypted rather than hashed, so this
 * is the one place that undoes it. The key is fetched once for the whole card
 * and only where a row actually needs it, so a card whose rows are still
 * plaintext — the window between the migration and the backfill — never asks for
 * a secret it does not need.
 */
export async function loadInvites(db: Db, eventId: string): Promise<Record<string, Invite>> {
  const rows = await db.select().from(schema.invites).where(eq(schema.invites.eventId, eventId));
  const secret = rows.some((row) => !row.token && row.tokenCipher) ? await inviteSecret() : null;

  const invites: Record<string, Invite> = {};
  for (const row of rows) {
    const token =
      row.token ?? (secret && row.tokenCipher ? await openToken(secret, row.tokenCipher) : null);
    invites[row.fighterId] = toInvite(row, token ?? undefined);
  }
  return invites;
}

/**
 * The row for a brand new invite, and the link to go with it.
 *
 * Every place that issues one goes through here — the card editor, the seed, the
 * dashboard's "New link" — so a token cannot come to be written in the clear by
 * somebody adding a fourth. The plaintext column is explicitly null rather than
 * left out, because leaving it out is what a row half-migrated looks like.
 */
export async function newInviteValues(
  eventId: string,
  fighterId: string,
  now: number,
): Promise<{ token: string; values: typeof schema.invites.$inferInsert }> {
  const { token, columns } = await newInviteToken(now, await inviteSecret());
  return {
    token,
    values: { id: newId("in"), eventId, fighterId, createdAt: now, ...columns },
  };
}

/**
 * An invite looked up by the token in the URL, with the show and the fighter it
 * belongs to. One query, because this runs on every keystroke's autosave.
 *
 * A revoked invite is not found. That is how "remove my details" revokes a link
 * without deleting the row that records the fighter asked: the token is the
 * whole of the authorisation, so a token that cannot be looked up is a link that
 * opens nothing, and the caller gets the same answer as for a made-up one.
 *
 * The match is on the digest, so nothing compares a presented token against a
 * stored copy of itself. The plaintext column is still in the `or` because a row
 * that has not been through `scripts/migrate-invites.mjs` yet has nothing else to
 * match on, and a fighter must not lose their form to our own migration window.
 * It is logged when it happens, because that state is meant to be temporary and
 * nothing else would ever say so.
 *
 * A revoked or expired invite comes back as null, which is the same answer as a
 * token nobody ever issued. The three are indistinguishable to the holder on
 * purpose: "that link has been cancelled" tells a stranger they have found a
 * real fighter.
 */
export async function loadInviteByToken(db: Db, token: string, now = Date.now()) {
  const digest = await digestToken(await inviteSecret(), token);
  const [row] = await db
    .select({
      invite: schema.invites,
      fighter: schema.fighters,
      event: schema.events,
    })
    .from(schema.invites)
    .innerJoin(schema.fighters, eq(schema.fighters.id, schema.invites.fighterId))
    .innerJoin(schema.events, eq(schema.events.id, schema.invites.eventId))
    .where(or(eq(schema.invites.tokenDigest, digest), eq(schema.invites.token, token)))
    .limit(1);

  if (!row) return null;
  if (!row.invite.tokenDigest) {
    logWarning(
      { event: "plaintextInvite", eventId: row.invite.eventId, fighterId: row.invite.fighterId },
      "This invite is still stored in the clear. Run scripts/migrate-invites.mjs.",
    );
  }
  return inviteLive(row.invite, now) ? row : null;
}

/**
 * Whether this token belongs to a link the fighter switched off themselves.
 *
 * A made-up token and a regenerated one answer alike, and deliberately so. This
 * is the one exception, and it gets its own rule rather than none: a fighter who
 * has just pressed "remove my details", or who opens the same link again a week
 * later, is told what happened to it instead of being shown the address-does-not-
 * exist page. It tells nobody anything they did not already have — the token is
 * thirty-two random bytes and holding one is holding the credential — and the
 * alternative is a fighter left wondering whether their request went through.
 */
export async function inviteWasRevoked(db: Db, token: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(and(eq(schema.invites.token, token), isNotNull(schema.invites.revokedAt)))
    .limit(1);
  return !!row;
}

/**
 * Just enough of a show to decide who may see something of it, without loading
 * the card. `/media` answers a request per photograph on a page, so the gate on
 * it has to cost one narrow query rather than six.
 */
export async function eventVisibility(db: Db, slug: string) {
  const [row] = await db
    .select({
      id: schema.events.id,
      published: schema.events.published,
      promoterId: schema.events.promoterId,
    })
    .from(schema.events)
    .where(eq(schema.events.slug, slug))
    .limit(1);
  return row ?? null;
}

/**
 * The render keys that could be a credential for these promoters' cards: the
 * unscoped ones, which are the runner's, and the ones scoped to a promoter here.
 *
 * Scope is the only thing filtered here. Whether a key has expired or been
 * revoked is decided in lib/visibility.ts alongside everything else about who
 * may see a card, because a rule written half in SQL and half in a function is a
 * rule with two places to forget it — and this is a handful of rows either way.
 */
export async function renderKeysFor(db: Db, promoterIds: readonly string[]) {
  const mine = promoterIds.length
    ? or(
        isNull(schema.renderKeys.promoterId),
        inArray(schema.renderKeys.promoterId, [...promoterIds]),
      )
    : isNull(schema.renderKeys.promoterId);

  return db
    .select({
      promoterId: schema.renderKeys.promoterId,
      digest: schema.renderKeys.digest,
      expiresAt: schema.renderKeys.expiresAt,
      revokedAt: schema.renderKeys.revokedAt,
    })
    .from(schema.renderKeys)
    .where(mine);
}

/**
 * Whether the bout, fighter and sponsor a count names are actually on this show.
 *
 * /api/track takes no credential, so without this the counts are a table anybody
 * can put a row in — and the counts are what a promoter hands a sponsor. The
 * checks are separate queries rather than one join because a programme open
 * names none of the three and runs none of them, and the tap that names all
 * three is one tap.
 */
export async function trackRefsBelong(
  db: Db,
  eventId: string,
  refs: { boutNumber: number | null; fighterId: string | null; sponsorId: string | null },
): Promise<boolean> {
  if (refs.boutNumber !== null) {
    const [bout] = await db
      .select({ redId: schema.bouts.redId, blueId: schema.bouts.blueId })
      .from(schema.bouts)
      .where(and(eq(schema.bouts.eventId, eventId), eq(schema.bouts.number, refs.boutNumber)))
      .limit(1);
    if (!bout) return false;
    // Named together, so they have to agree: a tap on a sponsor inside a bout
    // card carries the corner it was under.
    if (refs.fighterId !== null && refs.fighterId !== bout.redId && refs.fighterId !== bout.blueId) {
      return false;
    }
  } else if (refs.fighterId !== null && !(await fighterOnEvent(db, eventId, refs.fighterId))) {
    return false;
  }

  return refs.sponsorId === null || sponsorOnEvent(db, eventId, refs.sponsorId);
}

async function fighterOnEvent(db: Db, eventId: string, fighterId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.bouts.id })
    .from(schema.bouts)
    .where(
      and(
        eq(schema.bouts.eventId, eventId),
        or(eq(schema.bouts.redId, fighterId), eq(schema.bouts.blueId, fighterId)),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * The three ways a sponsor is on a card, in the order a tap is likely to come
 * from: the show's own strip, one bout's placement, and a fighter's own backers.
 */
async function sponsorOnEvent(db: Db, eventId: string, sponsorId: string): Promise<boolean> {
  const [onStrip] = await db
    .select({ sponsorId: schema.eventSponsors.sponsorId })
    .from(schema.eventSponsors)
    .where(
      and(
        eq(schema.eventSponsors.eventId, eventId),
        eq(schema.eventSponsors.sponsorId, sponsorId),
      ),
    )
    .limit(1);
  if (onStrip) return true;

  const [onBout] = await db
    .select({ id: schema.bouts.id })
    .from(schema.bouts)
    .where(and(eq(schema.bouts.eventId, eventId), eq(schema.bouts.sponsorId, sponsorId)))
    .limit(1);
  if (onBout) return true;

  const [onFighter] = await db
    .select({ id: schema.bouts.id })
    .from(schema.fighterSponsors)
    .innerJoin(
      schema.bouts,
      or(
        eq(schema.bouts.redId, schema.fighterSponsors.fighterId),
        eq(schema.bouts.blueId, schema.fighterSponsors.fighterId),
      ),
    )
    .where(and(eq(schema.bouts.eventId, eventId), eq(schema.fighterSponsors.sponsorId, sponsorId)))
    .limit(1);
  return !!onFighter;
}

/**
 * The shows a stored photograph or cutout appears on, found by the path itself.
 *
 * The key cannot be read back for a fighter id: ids are slugs and carry hyphens,
 * so `fighters/owen-pryce-ab12.jpg` cannot be split into the two parts it was
 * built from without guessing. The path is what the fighter row stores, so the
 * path is what it is looked up by, and both columns are indexed for it.
 *
 * A fighter on two of the promoter's shows gets a row each, and one published
 * show is enough: the photograph is already on a page anybody can open.
 */
export async function eventsShowingPortrait(db: Db, path: string) {
  return db
    .select({ published: schema.events.published, promoterId: schema.events.promoterId })
    .from(schema.fighters)
    .innerJoin(
      schema.bouts,
      or(eq(schema.bouts.redId, schema.fighters.id), eq(schema.bouts.blueId, schema.fighters.id)),
    )
    .innerJoin(schema.events, eq(schema.events.id, schema.bouts.eventId))
    .where(
      or(
        eq(schema.fighters.photo, path),
        eq(schema.fighters.cutout, path),
        eq(schema.fighters.stylised, path),
      ),
    );
}

/**
 * Every show a promoter has, for an object that belongs to the promoter rather
 * than to one card — a sponsor's emblem, which is on the strip of every show
 * they place it on. One published show is enough, for the same reason it is
 * enough for a photograph: the emblem is already on a page anybody can open.
 */
export async function eventsOfPromoter(db: Db, promoterId: string) {
  return db
    .select({ published: schema.events.published, promoterId: schema.events.promoterId })
    .from(schema.events)
    .where(eq(schema.events.promoterId, promoterId));
}

/**
 * Whether this invite token belongs to the fighter this portrait is of.
 *
 * Matched on the digest, and only where the invite is still live: a link that
 * has been revoked stops opening the questionnaire, so it has to stop opening
 * the photographs on it too, or the credential outlives its own revocation.
 */
export async function inviteHoldsPortrait(
  db: Db,
  token: string,
  path: string,
  now = Date.now(),
): Promise<boolean> {
  const digest = await digestToken(await inviteSecret(), token);
  const [row] = await db
    .select({ expiresAt: schema.invites.expiresAt, revokedAt: schema.invites.revokedAt })
    .from(schema.invites)
    .innerJoin(schema.fighters, eq(schema.fighters.id, schema.invites.fighterId))
    .where(
      and(
        or(eq(schema.invites.tokenDigest, digest), eq(schema.invites.token, token)),
        or(
          eq(schema.fighters.photo, path),
          eq(schema.fighters.cutout, path),
          eq(schema.fighters.stylised, path),
        ),
      ),
    )
    .limit(1);
  return !!row && inviteLive(row, now);
}

export async function loadPromoterEvents(db: Db, promoterId: string) {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.promoterId, promoterId))
    .orderBy(desc(schema.events.date));
}

export async function loadRenderJobs(db: Db, eventId: string) {
  return db.select().from(schema.renderJobs).where(eq(schema.renderJobs.eventId, eventId));
}

/**
 * Bout number to playable URL, for the videos that exist.
 *
 * Deliberately says nothing about `status`. A bout being rendered again, or one
 * whose last attempt did not finish, still has the video it had before, and
 * taking it off a published programme because a laptop somewhere is busy would
 * be the worst way to fail. `currentR2Key` is written by a successful publish
 * and by nothing else, which is what makes that safe.
 */
export async function loadRenders(db: Db, eventId: string): Promise<Renders> {
  const rows = await db
    .select({
      boutNumber: schema.renderJobs.boutNumber,
      currentR2Key: schema.renderJobs.currentR2Key,
    })
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.eventId, eventId));

  const renders: Renders = {};
  for (const row of rows) {
    if (row.currentR2Key) renders[row.boutNumber] = renderUrl(row.currentR2Key);
  }
  return renders;
}

// --------------------------------------------------------------- analytics

export type AnalyticsTotals = Record<AnalyticsKind, number> & {
  /** Distinct sessions that opened the programme at all. */
  spectators: number;
};

const EMPTY_TOTALS: AnalyticsTotals = {
  programme_open: 0,
  bout_expand: 0,
  tape_play: 0,
  sponsor_tap: 0,
  profile_view: 0,
  spectators: 0,
};

/**
 * Real counts, or zeroes. There is no third option and there must never be one:
 * the whole reason this table exists is so the promoter can hand a sponsor a
 * number that is true, and a plausible-looking estimate would destroy that the
 * first time somebody checked it.
 */
export async function analyticsTotals(db: Db, eventId: string): Promise<AnalyticsTotals> {
  const rows = await db
    .select({
      kind: schema.analyticsEvents.kind,
      count: sql<number>`count(*)`,
      sessions: sql<number>`count(distinct ${schema.analyticsEvents.sessionId})`,
    })
    .from(schema.analyticsEvents)
    .where(eq(schema.analyticsEvents.eventId, eventId))
    .groupBy(schema.analyticsEvents.kind);

  const totals: AnalyticsTotals = { ...EMPTY_TOTALS };
  for (const row of rows) {
    if (row.kind in totals) totals[row.kind as AnalyticsKind] = row.count;
    if (row.kind === "programme_open") totals.spectators = row.sessions;
  }
  return totals;
}

/** Sponsor taps broken down, which is the line a sponsor actually asks about. */
export async function sponsorTaps(db: Db, eventId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ sponsorId: schema.analyticsEvents.sponsorId, count: sql<number>`count(*)` })
    .from(schema.analyticsEvents)
    .where(
      and(
        eq(schema.analyticsEvents.eventId, eventId),
        eq(schema.analyticsEvents.kind, "sponsor_tap"),
      ),
    )
    .groupBy(schema.analyticsEvents.sponsorId);

  const taps: Record<string, number> = {};
  for (const row of rows) if (row.sponsorId) taps[row.sponsorId] = row.count;
  return taps;
}

/**
 * The promoter's previous show, for the panel that turns a sponsor conversation
 * into a transaction. Returns null when there is not one yet, and the page says
 * so rather than filling the space with something.
 */
export async function previousShow(db: Db, promoterId: string, before: string) {
  const [row] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.promoterId, promoterId), sql`${schema.events.date} < ${before}`))
    .orderBy(desc(schema.events.date))
    .limit(1);
  return row ?? null;
}
