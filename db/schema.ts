import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The D1 schema.
 *
 * Two things shape it more than anything else.
 *
 * First, almost every column describing a fighter is nullable, because on a real
 * amateur card most of them are missing for most of the bill. That is the
 * central design constraint of the product rather than an edge case, so the
 * database has to be as relaxed about absence as the UI is. Nothing here has a
 * default that could be mistaken for an answer: a fighter with no record stored
 * is a fighter who has not told us, never a debutant.
 *
 * Second, fighters are their own table rather than rows hanging off a bout,
 * because the same person comes back for the promoter's next show and should get
 * "confirm your details" rather than a blank form. That is the retention hook,
 * and it only works if identity survives the event.
 *
 * Timestamps are stored as Unix milliseconds. SQLite has no date type and D1 has
 * no timezone, so a number avoids a class of string-comparison bug that is very
 * hard to see. Dates that are calendar facts rather than instants — the day of
 * the show — stay as ISO `YYYY-MM-DD` text, because that is what they are.
 */

export const promoters = sqliteTable("promoters", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  mark: text("mark"),
  instagram: text("instagram"),
  /** PBKDF2 verifier, `iterations:salt:hash` in base64. Never the password. */
  passwordHash: text("password_hash"),
  createdAt: integer("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  promoterId: text("promoter_id")
    .notNull()
    .references(() => promoters.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  /** Calendar day of the show, ISO `YYYY-MM-DD`. */
  date: text("date").notNull(),
  doorsTime: text("doors_time").notNull(),
  firstBellTime: text("first_bell_time").notNull(),
  venue: text("venue").notNull(),
  city: text("city").notNull(),
  sanctioning: text("sanctioning"),
  backdrop: text("backdrop"),
  /** Unpublished events are visible to their promoter and nobody else. */
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sponsors = sqliteTable("sponsors", {
  id: text("id").primaryKey(),
  promoterId: text("promoter_id")
    .notNull()
    .references(() => promoters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  qualifier: text("qualifier"),
  mark: text("mark"),
  url: text("url"),
  createdAt: integer("created_at").notNull(),
});

export const fighters = sqliteTable("fighters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  gym: text("gym").notNull(),
  nickname: text("nickname"),
  hometown: text("hometown"),
  age: integer("age"),
  heightCm: integer("height_cm"),
  reachCm: integer("reach_cm"),
  stance: text("stance"),
  photo: text("photo"),
  cutout: text("cutout"),
  instagram: text("instagram"),
  /**
   * Null across all three means the fighter has not given us a record, which is
   * different from 0-0-0 meaning a debut. Keeping them separate is the whole
   * point of isDebut and the database must not blur it.
   */
  recordW: integer("record_w"),
  recordL: integer("record_l"),
  recordD: integer("record_d"),
  finishKo: integer("finish_ko"),
  finishSub: integer("finish_sub"),
  walkoutTitle: text("walkout_title"),
  walkoutArtist: text("walkout_artist"),
  bio: text("bio"),
  /** JSON array. Free text chosen from a fixed list, so a table would not earn its keep. */
  styleTags: text("style_tags"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const bouts = sqliteTable(
  "bouts",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Running order position. 1 is the opener; the highest number is the main event. */
    number: integer("number").notNull(),
    discipline: text("discipline").notNull(),
    weightKg: integer("weight_kg").notNull(),
    classLabel: text("class_label"),
    titleLabel: text("title_label"),
    womens: integer("womens", { mode: "boolean" }).notNull().default(false),
    rounds: integer("rounds").notNull(),
    roundMinutes: integer("round_minutes").notNull(),
    billing: text("billing"),
    redId: text("red_id")
      .notNull()
      .references(() => fighters.id),
    blueId: text("blue_id")
      .notNull()
      .references(() => fighters.id),
    /** Bout sponsorship is a line promoters already sell, so it lives on the bout. */
    sponsorId: text("sponsor_id").references(() => sponsors.id, { onDelete: "set null" }),
  },
  (table) => [uniqueIndex("bouts_event_number").on(table.eventId, table.number)],
);

export const eventSponsors = sqliteTable(
  "event_sponsors",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    sponsorId: text("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    /** The strip is ordered and the order was sold, so it is stored rather than derived. */
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.sponsorId] })],
);

export const fighterSponsors = sqliteTable(
  "fighter_sponsors",
  {
    fighterId: text("fighter_id")
      .notNull()
      .references(() => fighters.id, { onDelete: "cascade" }),
    sponsorId: text("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.fighterId, table.sponsorId] })],
);

/**
 * A fighter's way in. There is no fighter account: the token in the URL is the
 * credential, which is the only thing that gets a form filled in by someone who
 * is not going to create a password for a programme entry.
 *
 * The three timestamps are the promoter's nudge signal and they mean different
 * things. Never sent is the promoter's own job. Sent and never opened is a wrong
 * number or an ignored message. Opened and not submitted is the warmest lead on
 * the list, and it is only worth anything because it is recorded when it really
 * happens rather than guessed from how full the profile looks.
 */
export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    fighterId: text("fighter_id")
      .notNull()
      .references(() => fighters.id, { onDelete: "cascade" }),
    sentAt: integer("sent_at"),
    lastOpenedAt: integer("last_opened_at"),
    submittedAt: integer("submitted_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("invites_event_fighter").on(table.eventId, table.fighterId)],
);

/**
 * Video rendering runs outside Workers, so this table is the whole interface
 * between the app and the renderer: the app writes a request, the renderer polls
 * for it, and the app reads back the key. See scripts/render-tape.mjs.
 */
export const renderJobs = sqliteTable(
  "render_jobs",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    boutNumber: integer("bout_number").notNull(),
    /** queued | running | done | failed */
    status: text("status").notNull(),
    /** Key in the media bucket once it exists. */
    r2Key: text("r2_key"),
    error: text("error"),
    /**
     * Fingerprint of the two fighters at request time, so a finished render can
     * be invalidated when either of them changes their details rather than
     * silently showing a video of last week's record.
     */
    inputHash: text("input_hash"),
    requestedAt: integer("requested_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [uniqueIndex("render_jobs_event_bout").on(table.eventId, table.boutNumber)],
);

/**
 * One row per interaction. Deliberately append-only and unaggregated: the value
 * to a promoter is a report they can send a sponsor, and the questions a sponsor
 * asks are not known in advance.
 *
 * There is no user identifier here and none is wanted. `sessionId` is a random
 * value held for the length of one visit so that opens can be counted per
 * spectator rather than per reload, and it is not stored anywhere else.
 */
export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** programme_open | bout_expand | tape_play | sponsor_tap | profile_view */
    kind: text("kind").notNull(),
    boutNumber: integer("bout_number"),
    fighterId: text("fighter_id"),
    sponsorId: text("sponsor_id"),
    sessionId: text("session_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("analytics_event_kind").on(table.eventId, table.kind)],
);

/**
 * Fetched record pages, keyed by canonical URL.
 *
 * Caching is not an optimisation here, it is the good manners that keep this
 * defensible: one fighter's link should cost the source site one request no
 * matter how many times the form is reopened.
 */
export const importCache = sqliteTable("import_cache", {
  url: text("url").primaryKey(),
  source: text("source").notNull(),
  /** JSON ImportedTape, or null when the page parsed to nothing useful. */
  payload: text("payload"),
  fetchedAt: integer("fetched_at").notNull(),
});
