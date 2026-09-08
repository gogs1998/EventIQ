import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  /**
   * Failed sign-ins in the window that began at `firstFailedLoginAt`, and the
   * whole of the per-account lockout. The limiter at the edge counts callers,
   * and a password guessed from a thousand addresses is not a caller — so the
   * account has to hold a count of its own. Cleared by a sign-in that works.
   * See lib/lockout.ts.
   */
  failedLogins: integer("failed_logins").notNull().default(0),
  firstFailedLoginAt: integer("first_failed_login_at"),
  /**
   * Which generation of sessions this account still accepts. It is carried
   * inside the signed cookie, and `currentPromoter` refuses a cookie that does
   * not name the number on the row.
   *
   * The session was deliberately stateless — a signature can be checked without
   * a read — and it stays so for everything but this one column, which costs
   * nothing because the promoter row is read on every request anyway. What it
   * buys is the thing a stateless cookie cannot do: changing a password signs
   * out every other device at once, which is the point of changing it after a
   * laptop goes missing. Rotating SESSION_SECRET is still how everybody,
   * including the promoter doing the rotating, gets signed out.
   */
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

/**
 * A one-time way back in for a promoter who has forgotten their password.
 *
 * There is no email and no SMS here, so nothing sends anything: an operator
 * mints a link with `npm run promoter -- reset-link` and hands it over by
 * whatever means they already use to talk to that promoter. That is the whole
 * design, and it is why the link is short-lived and single-use rather than
 * merely secret — it travels through a channel nobody here controls.
 *
 * Only the digest is stored. This row is what a copy of the database hands over,
 * and a stored token would be a working credential in it; the digest of 32
 * random bytes is not reversible and is all the check needs.
 */
export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    promoterId: text("promoter_id")
      .notNull()
      .references(() => promoters.id, { onDelete: "cascade" }),
    /** SHA-256 of the token, base64url. Never the token itself. */
    tokenDigest: text("token_digest").notNull(),
    /** Unix milliseconds, half an hour after it was minted. */
    expiresAt: integer("expires_at").notNull(),
    /** Stamped the moment it is spent, so a link forwarded twice works once. */
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  // The digest is the only thing the page can look a row up by, and it is unique
  // because two rows sharing one would be one link opening two accounts.
  (table) => [uniqueIndex("password_resets_token_digest").on(table.tokenDigest)],
);


/**
 * The keys the mp4 renderer presents instead of a session.
 *
 * There used to be one, `RENDER_KEY`, set with `wrangler secret put`, and it
 * read every card on the instance published or not. With one promoter that is
 * the right size of credential; with two it is a cross-tenant read, and the
 * machine holding it is a GitHub runner rather than the operator's laptop.
 *
 * So a key is a row. `promoterId` is the whole tenancy decision: null is the
 * runner, which renders whatever is queued and therefore has to reach every
 * promoter, and a slug-scoped key reaches one promoter's shows and answers 404
 * on everybody else's — which is what a promoter renders their own drafts with.
 *
 * Only the digest is stored, so a copy of the database is not a set of working
 * keys, and the key itself is printed once by scripts/render-key.mjs and never
 * again. Expiry and revocation are timestamps rather than a deletion, because
 * the question "what could read this card, and when did it stop" is worth being
 * able to answer after the fact.
 */
export const renderKeys = sqliteTable(
  "render_keys",
  {
    id: text("id").primaryKey(),
    /** Null means every promoter: that is the runner's key, and nothing else. */
    promoterId: text("promoter_id").references(() => promoters.id, { onDelete: "cascade" }),
    /** SHA-256 of the key, base64url. Never the key. */
    digest: text("digest").notNull(),
    /** Whose machine holds it, in words, so revoking the right one is possible. */
    label: text("label"),
    createdAt: integer("created_at").notNull(),
    /** Null never expires. A dated key is the one to hand to somebody else. */
    expiresAt: integer("expires_at"),
    revokedAt: integer("revoked_at"),
  },
  // Two rows must never carry the same digest: that would be two labels for one
  // credential, and only one of them would ever be revoked.
  (table) => [uniqueIndex("render_keys_digest").on(table.digest)],
);

export const events = sqliteTable(
  "events",
  {
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
  },
  (table) => [
    // Every promoter-scoped read starts here — their shows list, the ownership
    // check on every action, the previous-show panel — and with a second
    // promoter on the instance those stop being a scan of the only account.
    index("events_promoter").on(table.promoterId),
    // What the hourly renderer asks for: published shows dated from a couple of
    // days ago onwards. Published leads because it is the equality half.
    index("events_published_date").on(table.published, table.date),
  ],
);

export const sponsors = sqliteTable(
  "sponsors",
  {
    id: text("id").primaryKey(),
    promoterId: text("promoter_id")
      .notNull()
      .references(() => promoters.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    qualifier: text("qualifier"),
    mark: text("mark"),
    url: text("url"),
    createdAt: integer("created_at").notNull(),
  },
  // loadCard reads a promoter's whole book once per programme page, so this is
  // one indexed read per card rather than a scan of every sponsor on the
  // instance — which is one table a second promoter makes immediately bigger.
  (table) => [index("sponsors_promoter").on(table.promoterId)],
);

export const fighters = sqliteTable(
  "fighters",
  {
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
  },
  // /media looks a stored object back up by the path on the fighter, because a
  // key cannot be read for an id that is itself hyphenated. That happens once
  // per photograph on a page, so it must not be a scan of the table.
  (table) => [index("fighters_photo").on(table.photo), index("fighters_cutout").on(table.cutout)],
);

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
    /**
     * Catchweights are agreed at the half kilo, so this is a real and 61.5 has
     * to survive to the page. The column on disk is still the `integer` the
     * first migration declared: SQLite types are affinities, and INTEGER
     * affinity only converts a real when it can do so losslessly, so 61.5 goes
     * in and comes back as 61.5. Rebuilding the table to change the word would
     * mean DROP TABLE bouts on a live show, and the migration drizzle generates
     * for it wraps that in PRAGMA foreign_keys=OFF, which D1 does not support.
     */
    weightKg: real("weight_kg").notNull(),
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
 * between the app and the renderer: the app queues a request, a runner claims
 * it, and the app reads back the key. See scripts/render-tape.mjs.
 *
 * The row holds two things that used to be one, and keeping them apart is the
 * point of the shape. `status`, `error`, `attempts` and `leaseUntil` describe
 * the *job* — what a runner is doing about this bout. `currentR2Key` and
 * `currentHash` describe the *video* — what the programme plays. A render that
 * is running, or one that has just failed, must never take a working video off a
 * published card, and now it cannot: nothing but a successful publish touches
 * those two columns.
 */
export const renderJobs = sqliteTable(
  "render_jobs",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    boutNumber: integer("bout_number").notNull(),
    /** queued | running | done | failed. The job, not the video. */
    status: text("status").notNull(),
    error: text("error"),
    /**
     * Fingerprint of the bout the current attempt is for, so a queued job
     * records what it was queued about.
     */
    inputHash: text("input_hash"),
    /**
     * The video the programme plays, and the fingerprint it was made from.
     * Written only by a successful publish. Comparing `currentHash` with the
     * bout as it stands now is what "stale" means.
     */
    currentR2Key: text("current_r2_key"),
    currentHash: text("current_hash"),
    /**
     * While a runner holds this bout, when its claim lapses. One UPDATE takes
     * the lease, so two runners cannot render the same bout, and a runner that
     * dies releases it by running out of time rather than by tidying up.
     */
    leaseUntil: integer("lease_until"),
    /** Attempts since it was last asked for. Enqueuing it again resets this. */
    attempts: integer("attempts").notNull().default(0),
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
export const importCache = sqliteTable(
  "import_cache",
  {
    url: text("url").primaryKey(),
    source: text("source").notNull(),
    /** JSON ImportedTape, or null when the page parsed to nothing useful. */
    payload: text("payload"),
    fetchedAt: integer("fetched_at").notNull(),
  },
  // The importer counts the last hour's fetches before it makes another one, so
  // that question has to stay cheap however many rows have accumulated.
  (table) => [index("import_cache_fetched_at").on(table.fetchedAt)],
);
