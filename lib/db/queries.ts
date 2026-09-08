import { and, desc, eq, inArray, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
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

export type LoadedCard = Card & {
  eventId: string;
  promoterId: string;
  published: boolean;
  /**
   * When each fighter's row was last written, by fighter id.
   *
   * Not part of `Fighter`, because nothing a page draws depends on it. It is
   * here because the render fingerprint does — carrying it on the card is what
   * lets the dashboard work out which videos are stale from the card it has
   * already loaded rather than by loading the same rows a second time.
   */
  fighterUpdatedAt: Record<string, number>;
};

/**
 * Everything one show needs, in two round trips.
 *
 * Two rather than six, and still a fixed number regardless of how many bouts are
 * on the card. D1 charges per row read and a fifteen-bout card touches thirty
 * fighters, so the difference between this and the obvious loop is the
 * difference between a page that is cheap and one that is not — and the
 * difference between six statements and two batches is six edge-to-database
 * waits against two, which is what the promoter's dashboard was spending.
 *
 * It cannot be one batch. Everything in the second batch is keyed on the show's
 * id or on the fighters its running order names, and neither is known until the
 * first batch has answered.
 */
export function loadCard(db: Db, slug: string): Promise<LoadedCard | null> {
  return cardWhere(db, eq(schema.events.slug, slug));
}

/**
 * The same card, addressed by row id rather than by slug.
 *
 * The queue and the dashboard both hold an event id and no slug, and a card
 * loaded twice through two code paths is two code paths that can disagree about
 * what a bout is made of.
 */
export function loadCardById(db: Db, eventId: string): Promise<LoadedCard | null> {
  return cardWhere(db, eq(schema.events.id, eventId));
}

async function cardWhere(db: Db, where: SQL): Promise<LoadedCard | null> {
  // The bouts are fetched beside the event rather than after it, by joining on
  // the same condition, because the fighter ids they carry are what the second
  // batch is keyed on.
  const [eventRows, boutRows] = await db.batch([
    db.select().from(schema.events).where(where).limit(1),
    db
      .select({ bout: schema.bouts })
      .from(schema.bouts)
      .innerJoin(schema.events, eq(schema.events.id, schema.bouts.eventId))
      .where(where)
      .orderBy(schema.bouts.number),
  ]);

  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const bouts = boutRows.map((row) => row.bout);
  const fighterIds = [...new Set(bouts.flatMap((bout) => [bout.redId, bout.blueId]))];

  const [promoterRows, eventSponsorRows, sponsorRows, fighterRows, fighterSponsorRows] =
    await db.batch([
      db
        .select()
        .from(schema.promoters)
        .where(eq(schema.promoters.id, eventRow.promoterId))
        .limit(1),
      db
        .select()
        .from(schema.eventSponsors)
        .where(eq(schema.eventSponsors.eventId, eventRow.id))
        .orderBy(schema.eventSponsors.position),
      // Every sponsor this promoter has, so bout sponsors, show sponsors and
      // fighter sponsors all resolve from one map. A promoter's book is a few
      // dozen rows.
      db.select().from(schema.sponsors).where(eq(schema.sponsors.promoterId, eventRow.promoterId)),
      // An empty id list compiles to `where false`, so a show with no running
      // order costs these two statements and reads no rows.
      db.select().from(schema.fighters).where(inArray(schema.fighters.id, fighterIds)),
      db
        .select()
        .from(schema.fighterSponsors)
        .where(inArray(schema.fighterSponsors.fighterId, fighterIds))
        .orderBy(schema.fighterSponsors.position),
    ]);

  const promoterRow = promoterRows[0];
  if (!promoterRow) return null;

  const sponsorsByFighter = new Map<string, string[]>();
  for (const link of fighterSponsorRows) {
    const list = sponsorsByFighter.get(link.fighterId) ?? [];
    list.push(link.sponsorId);
    sponsorsByFighter.set(link.fighterId, list);
  }

  const fighters: Record<string, Fighter> = {};
  const fighterUpdatedAt: Record<string, number> = {};
  for (const row of fighterRows) {
    fighters[row.id] = toFighter(row, sponsorsByFighter.get(row.id) ?? []);
    fighterUpdatedAt[row.id] = row.updatedAt;
  }

  const sponsors: Record<string, Sponsor> = {};
  for (const row of sponsorRows) sponsors[row.id] = toSponsor(row);

  return {
    eventId: eventRow.id,
    promoterId: eventRow.promoterId,
    published: eventRow.published,
    fighterUpdatedAt,
    event: toEvent(
      eventRow,
      promoterRow,
      bouts.map(toBout),
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
    .where(or(eq(schema.fighters.photo, path), eq(schema.fighters.cutout, path)));
}

/** Whether this invite token belongs to the fighter this portrait is of. */
export async function inviteHoldsPortrait(db: Db, token: string, path: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .innerJoin(schema.fighters, eq(schema.fighters.id, schema.invites.fighterId))
    .where(
      and(
        eq(schema.invites.token, token),
        or(eq(schema.fighters.photo, path), eq(schema.fighters.cutout, path)),
      ),
    )
    .limit(1);
  return !!row;
}

export async function loadPromoterEvents(db: Db, promoterId: string) {
  return db
    .select()
    .from(schema.events)
    .where(eq(schema.events.promoterId, promoterId))
    .orderBy(desc(schema.events.date));
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
export function rendersFrom(
  rows: readonly { boutNumber: number; currentR2Key: string | null }[],
): Renders {
  const renders: Renders = {};
  for (const row of rows) {
    if (row.currentR2Key) renders[row.boutNumber] = renderUrl(row.currentR2Key);
  }
  return renders;
}

export async function loadRenders(db: Db, eventId: string): Promise<Renders> {
  return rendersFrom(
    await db
      .select({
        boutNumber: schema.renderJobs.boutNumber,
        currentR2Key: schema.renderJobs.currentR2Key,
      })
      .from(schema.renderJobs)
      .where(eq(schema.renderJobs.eventId, eventId)),
  );
}

/**
 * Everything the promoter's dashboard reads beside the card, in one round trip.
 *
 * The first three have nothing to do with each other — who has sent their
 * profile in, what the renderer has been doing, and which show came before this
 * one — which is exactly why they belong in a batch. Asked one at a time they
 * were three waits on a page that already had too many.
 *
 * The render jobs come back whole rather than as two selects: the dashboard
 * wants the status and the error, and the video the programme plays is a column
 * on the same row, so `rendersFrom` reads it off these instead of asking again.
 *
 * The counting comes with them, for this show and for the last one. The last
 * show's looks like it cannot be in here, because it counts a show this same
 * batch is still in the middle of naming — so it is keyed on the same subquery
 * that names it. SQLite finds the show twice and the page waits once instead of
 * twice, which is the last dependent step the dashboard had. `previous` is null
 * when the promoter has not run a show before, and the page says so rather than
 * filling the space.
 */
export async function loadDashboardRows(
  db: Db,
  eventId: string,
  promoterId: string,
  before: string,
) {
  const previousShow = db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.promoterId, promoterId), sql`${schema.events.date} < ${before}`))
    .orderBy(desc(schema.events.date))
    .limit(1);

  const [inviteRows, jobRows, previousRows, kinds, taps, previousKinds, previousTaps] =
    await db.batch([
      db.select().from(schema.invites).where(eq(schema.invites.eventId, eventId)),
      db.select().from(schema.renderJobs).where(eq(schema.renderJobs.eventId, eventId)),
      db
        .select()
        .from(schema.events)
        .where(and(eq(schema.events.promoterId, promoterId), sql`${schema.events.date} < ${before}`))
        .orderBy(desc(schema.events.date))
        .limit(1),
      ...analyticsStatements(db, eventId),
      ...analyticsStatements(db, previousShow),
    ]);

  const invites: Record<string, Invite> = {};
  for (const row of inviteRows) invites[row.fighterId] = toInvite(row);

  return {
    invites,
    jobRows,
    analytics: analyticsFrom(kinds, taps),
    previous: previousRows[0] ?? null,
    previousAnalytics: analyticsFrom(previousKinds, previousTaps),
  };
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

export type Analytics = { totals: AnalyticsTotals; taps: Record<string, number> };

type KindRow = { kind: string; count: number; sessions: number };
type TapRow = { sponsorId: string | null; count: number };

/**
 * The two aggregations of `analytics_events`: the five counts, and the sponsor
 * taps broken down, which is the line a sponsor actually asks about.
 *
 * Two statements rather than one because a query cannot group by kind and by
 * sponsor at the same time, and they are handed back unrun so that a caller with
 * other work to do can put them in the same batch as it. `eventId` is a
 * `SQLWrapper` rather than a string for exactly that: the dashboard's last-show
 * panel keys them on the subquery that finds the show, so naming it and counting
 * it is one round trip.
 */
function analyticsStatements(db: Db, eventId: string | SQLWrapper) {
  return [
    db
      .select({
        kind: schema.analyticsEvents.kind,
        count: sql<number>`count(*)`,
        sessions: sql<number>`count(distinct ${schema.analyticsEvents.sessionId})`,
      })
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.eventId, eventId))
      .groupBy(schema.analyticsEvents.kind),
    db
      .select({ sponsorId: schema.analyticsEvents.sponsorId, count: sql<number>`count(*)` })
      .from(schema.analyticsEvents)
      .where(
        and(
          eq(schema.analyticsEvents.eventId, eventId),
          eq(schema.analyticsEvents.kind, "sponsor_tap"),
        ),
      )
      .groupBy(schema.analyticsEvents.sponsorId),
  ] as const;
}

/**
 * Real counts, or zeroes. There is no third option and there must never be one:
 * the whole reason this table exists is so the promoter can hand a sponsor a
 * number that is true, and a plausible-looking estimate would destroy that the
 * first time somebody checked it.
 */
function analyticsFrom(kindRows: readonly KindRow[], sponsorRows: readonly TapRow[]): Analytics {
  const totals: AnalyticsTotals = { ...EMPTY_TOTALS };
  for (const row of kindRows) {
    if (row.kind in totals) totals[row.kind as AnalyticsKind] = row.count;
    if (row.kind === "programme_open") totals.spectators = row.sessions;
  }

  const taps: Record<string, number> = {};
  for (const row of sponsorRows) if (row.sponsorId) taps[row.sponsorId] = row.count;

  return { totals, taps };
}

/** Both aggregations for one show, in one round trip. */
export async function analyticsFor(db: Db, eventId: string): Promise<Analytics> {
  const [kindRows, sponsorRows] = await db.batch([...analyticsStatements(db, eventId)]);
  return analyticsFrom(kindRows, sponsorRows);
}
