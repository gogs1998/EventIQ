import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/lib/db";
import type { Card } from "@/lib/card";
import { renderUrl, type Renders } from "@/lib/renders";
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
    styleTags: row.styleTags ? (JSON.parse(row.styleTags) as string[]) : undefined,
    sponsorIds: sponsorIds.length ? sponsorIds : undefined,
  };
}

function toSponsor(row: SponsorRow): Sponsor {
  return {
    id: row.id,
    name: row.name,
    qualifier: optional(row.qualifier),
    mark: optional(row.mark),
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

export function toInvite(row: InviteRow): Invite {
  return {
    fighterId: row.fighterId,
    token: row.token,
    sentAt: optional(row.sentAt),
    lastOpenedAt: optional(row.lastOpenedAt),
    submittedAt: optional(row.submittedAt),
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
 * The card that the pitch page, the sitemap and the bare /qr route fall back to.
 *
 * The published show with the furthest-out date, because that is the one a
 * promoter is currently selling. Returns null when nothing is published, and
 * every caller says so rather than inventing a card to fill the space.
 *
 * A show with no bouts on it is skipped where there is any alternative. A
 * promoter can create next month's show and publish it before typing the running
 * order in, and that show has the furthest-out date by definition — so without
 * this the shop window would swap a full card for an empty one the moment a draft
 * went live. It is a preference rather than a filter: if the only published show
 * is empty, that is still the show, and the pages leave out the parts that need a
 * bout.
 */
export async function loadShowcase(db: Db): Promise<LoadedCard | null> {
  const rows = await db
    .select({ slug: schema.events.slug, bouts: sql<number>`count(${schema.bouts.id})` })
    .from(schema.events)
    .leftJoin(schema.bouts, eq(schema.bouts.eventId, schema.events.id))
    .where(eq(schema.events.published, true))
    .groupBy(schema.events.id)
    .orderBy(desc(schema.events.date));

  const pick = rows.find((row) => row.bouts > 0) ?? rows[0];
  return pick ? loadCard(db, pick.slug) : null;
}

export async function loadInvites(db: Db, eventId: string): Promise<Record<string, Invite>> {
  const rows = await db.select().from(schema.invites).where(eq(schema.invites.eventId, eventId));
  const invites: Record<string, Invite> = {};
  for (const row of rows) invites[row.fighterId] = toInvite(row);
  return invites;
}

/**
 * An invite looked up by the token in the URL, with the show and the fighter it
 * belongs to. One query, because this runs on every keystroke's autosave.
 */
export async function loadInviteByToken(db: Db, token: string) {
  const [row] = await db
    .select({
      invite: schema.invites,
      fighter: schema.fighters,
      event: schema.events,
    })
    .from(schema.invites)
    .innerJoin(schema.fighters, eq(schema.fighters.id, schema.invites.fighterId))
    .innerJoin(schema.events, eq(schema.events.id, schema.invites.eventId))
    .where(eq(schema.invites.token, token))
    .limit(1);
  return row ?? null;
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

/** Bout number to playable URL, for the renders that have actually finished. */
export async function loadRenders(db: Db, eventId: string): Promise<Renders> {
  const rows = await db
    .select({ boutNumber: schema.renderJobs.boutNumber, r2Key: schema.renderJobs.r2Key })
    .from(schema.renderJobs)
    .where(and(eq(schema.renderJobs.eventId, eventId), eq(schema.renderJobs.status, "done")));

  const renders: Renders = {};
  for (const row of rows) if (row.r2Key) renders[row.boutNumber] = renderUrl(row.r2Key);
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
