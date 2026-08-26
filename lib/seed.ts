import { INVITE_OVERRIDES } from "@/data/promoter";
import { newId, newToken } from "@/lib/auth";
import { completeness } from "@/lib/tape";
import type { FightEvent, Fighter, InviteStatus, Sponsor } from "@/lib/types";

/**
 * Turns the demo card into real rows.
 *
 * Cage County 12 started life as a typed fixture and it stays the seed rather
 * than becoming a hardcoded special case, because its unevenness is the argument
 * for the product: the top of the bill is complete, bout eleven has one full
 * column and one row of dashes, and the openers are a name and a gym. Reproducing
 * that by hand in SQL would guarantee it drifts away from the fixture the tests
 * use. Generating it means the demo card and the test card cannot disagree.
 *
 * The SQL is generated at seed time and not committed. Invite tokens are the
 * only thing standing between a stranger and a fighter's profile, so a file of
 * known ones in a public repository would be a way of shipping a vulnerability
 * that looks like a convenience.
 */

const DAY = 86_400_000;

/**
 * How far out the demo show sits when it is seeded.
 *
 * A fortnight is the moment the dashboard is worth looking at: the invites have
 * been out long enough for the pattern of who has answered to mean something,
 * and there is still time to do anything about it. The chase list is the pitch,
 * and a chase list for a show eighty days away is a to-do list nobody is going
 * to open.
 */
export const SHOW_LEAD_DAYS = 14;

/**
 * The demo show's date, a fortnight or so after it is seeded.
 *
 * It used to be a literal in the fixture, and the dashboard used to pin the
 * clock to match it. Pinning the clock had to go once the database held real
 * shows — a promoter cannot be shown a date that is not today. But taking the
 * pin out left the demo card announcing eighty days to go, which reads as a
 * product with nothing to say.
 *
 * Moving the show instead is the honest version of the same thing: the seeded
 * card is genuinely imminent rather than pretending to be, and every real event
 * keeps its own date and the real clock. The trade is that it ages — a demo
 * seeded and left alone drifts past its own show date — so re-seeding is what
 * brings it back, which is the same command that already refreshes the invite
 * timestamps sitting beside it.
 *
 * Snapped to the nearest Saturday, because that is when a fight card runs, and a
 * demo card billed for a Tuesday is the sort of detail a promoter notices.
 */
export function showDateFor(now: number): string {
  const target = new Date(now + SHOW_LEAD_DAYS * DAY);
  // Saturday is 6. Nearest rather than next, so the lead time stays near a
  // fortnight in both directions instead of stretching towards three weeks.
  const drift = ((6 - target.getUTCDay() + 10) % 7) - 3;
  target.setUTCDate(target.getUTCDate() + drift);
  return target.toISOString().slice(0, 10);
}

/** SQL string literal. Everything here comes from our own fixture, but a seed
 * script that concatenates unescaped text is a habit worth not forming. */
function lit(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${value.replace(/'/g, "''")}'`;
}

function row(table: string, values: Record<string, string | number | boolean | null | undefined>) {
  const columns = Object.keys(values);
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns
    .map((column) => lit(values[column]))
    .join(", ")});`;
}

// ------------------------------------------------------------------ invites

export type SeedInvite = {
  status: InviteStatus;
  sentAt?: number;
  lastOpenedAt?: number;
  submittedAt?: number;
};

/**
 * Fields the promoter already holds from their own entry and matchmaking
 * paperwork. Their presence says nothing about whether the fighter has been near
 * the link.
 */
function onlyPromoterKnows(fighter: Fighter): boolean {
  const self =
    fighter.photo ??
    fighter.nickname ??
    fighter.bio ??
    fighter.instagram ??
    fighter.walkoutSong ??
    fighter.heightCm ??
    fighter.reachCm ??
    fighter.sponsorIds?.length;
  return !self;
}

/**
 * Invite history for a seeded fighter.
 *
 * Deliberately not derived from the completeness score. A fighter with a record
 * and an age has a score above zero, but those came off the promoter's own entry
 * form, so scoring it that way had twenty-one people who had never touched the
 * link seeded as "opened, unfinished" — which destroys the one distinction the
 * promoter dashboard exists to draw. Same principle as isDebut: absence is not
 * evidence.
 *
 * This runs once, at seed time. After that the timestamps are real, written when
 * a fighter actually opens their link.
 */
export function seedInviteFor(fighter: Fighter, now: number): SeedInvite {
  const override = INVITE_OVERRIDES[fighter.id];
  const sentAt = now - 10 * DAY;

  if (override) {
    if (override.status === "not-sent") return { status: "not-sent" };
    return {
      status: override.status,
      sentAt,
      // Overrides exist to say "opened it, had a look, did nothing", which is
      // the warmest lead on the list and the one signal that has to be real.
      lastOpenedAt: override.lastOpenedAt ? now - 3 * DAY : undefined,
    };
  }

  if (completeness(fighter).score >= 70) {
    return { status: "submitted", sentAt, lastOpenedAt: now - 8 * DAY, submittedAt: now - 8 * DAY };
  }
  if (onlyPromoterKnows(fighter)) return { status: "sent", sentAt };
  return { status: "opened", sentAt, lastOpenedAt: now - 5 * DAY };
}

// --------------------------------------------------------------------- SQL

export type SeedInput = {
  event: FightEvent;
  fighters: Record<string, Fighter>;
  sponsors: Record<string, Sponsor>;
  /** PBKDF2 verifier for the promoter login. Never a plaintext password. */
  passwordHash: string;
  /**
   * Bouts whose mp4 is already committed under public/renders. Passed in rather
   * than discovered here, because this module also runs inside the Worker where
   * there is no filesystem to look at.
   */
  renderedBouts: number[];
  now: number;
};

export type SeedResult = {
  sql: string;
  /** Printed once so the operator can open a questionnaire without a database client. */
  inviteLinks: { fighter: string; token: string }[];
};

export function buildSeed({
  event,
  fighters,
  sponsors,
  passwordHash,
  renderedBouts,
  now,
}: SeedInput): SeedResult {
  const promoterId = `pr_${event.slug.split("-").slice(0, 2).join("-")}`;
  const eventId = `ev_${event.slug}`;
  const statements: string[] = [];
  const inviteLinks: SeedResult["inviteLinks"] = [];

  // Only the fighters actually on this card. The fixture holds exactly those,
  // but relying on that rather than saying it is how orphan rows appear.
  const onCard = new Set(event.bouts.flatMap((bout) => [bout.redId, bout.blueId]));
  const seededFighters = Object.values(fighters).filter((fighter) => onCard.has(fighter.id));
  const fighterIds = seededFighters.map((fighter) => lit(fighter.id)).join(", ");

  // Scoped to this promoter and in dependency order, so re-seeding is safe and
  // does not need foreign keys switched off. Analytics for the event go too:
  // counts recorded against a card that is about to be rebuilt would be
  // attributed to bouts that may no longer exist.
  //
  // Fighters are deleted by id rather than by promoter, because a fighter is not
  // owned by one. If the same person turns up on somebody else's card the
  // foreign key will refuse this, which is the right outcome: it would be far
  // worse for a re-seed of the demo to quietly rewrite a real fighter's profile.
  statements.push(
    `DELETE FROM analytics_events WHERE event_id = ${lit(eventId)};`,
    `DELETE FROM render_jobs WHERE event_id = ${lit(eventId)};`,
    `DELETE FROM invites WHERE event_id = ${lit(eventId)};`,
    `DELETE FROM bouts WHERE event_id = ${lit(eventId)};`,
    `DELETE FROM event_sponsors WHERE event_id = ${lit(eventId)};`,
    `DELETE FROM fighter_sponsors WHERE fighter_id IN (${fighterIds});`,
    `DELETE FROM fighters WHERE id IN (${fighterIds});`,
    `DELETE FROM events WHERE id = ${lit(eventId)};`,
    `DELETE FROM sponsors WHERE promoter_id = ${lit(promoterId)};`,
    `DELETE FROM promoters WHERE id = ${lit(promoterId)};`,
  );

  statements.push(
    row("promoters", {
      id: promoterId,
      slug: "cage-county",
      name: event.promoter.name,
      mark: event.promoter.mark,
      instagram: event.promoter.instagram,
      password_hash: passwordHash,
      created_at: now,
    }),
  );

  for (const sponsor of Object.values(sponsors)) {
    statements.push(
      row("sponsors", {
        id: sponsor.id,
        promoter_id: promoterId,
        name: sponsor.name,
        qualifier: sponsor.qualifier,
        mark: sponsor.mark,
        url: sponsor.url,
        created_at: now,
      }),
    );
  }

  statements.push(
    row("events", {
      id: eventId,
      promoter_id: promoterId,
      slug: event.slug,
      name: event.name,
      tagline: event.tagline,
      // Not the fixture's date. See showDateFor: the seeded demo show is dated
      // from when it was seeded so it presents as imminent, which is the only
      // state in which the dashboard argues for itself.
      date: showDateFor(now),
      doors_time: event.doorsTime,
      first_bell_time: event.firstBellTime,
      venue: event.venue,
      city: event.city,
      sanctioning: event.sanctioning,
      backdrop: event.backdrop,
      published: true,
      created_at: now,
      updated_at: now,
    }),
  );

  event.showSponsorIds.forEach((sponsorId, position) => {
    statements.push(row("event_sponsors", { event_id: eventId, sponsor_id: sponsorId, position }));
  });

  for (const fighter of seededFighters) {
    statements.push(
      row("fighters", {
        id: fighter.id,
        name: fighter.name,
        gym: fighter.gym,
        nickname: fighter.nickname,
        hometown: fighter.hometown,
        age: fighter.age,
        height_cm: fighter.heightCm,
        reach_cm: fighter.reachCm,
        stance: fighter.stance,
        photo: fighter.photo,
        cutout: fighter.cutout,
        instagram: fighter.instagram,
        record_w: fighter.record?.w,
        record_l: fighter.record?.l,
        record_d: fighter.record?.d,
        finish_ko: fighter.finishes?.ko,
        finish_sub: fighter.finishes?.sub,
        walkout_title: fighter.walkoutSong?.title,
        walkout_artist: fighter.walkoutSong?.artist,
        bio: fighter.bio,
        style_tags: fighter.styleTags ? JSON.stringify(fighter.styleTags) : null,
        created_at: now,
        updated_at: now,
      }),
    );

    (fighter.sponsorIds ?? []).forEach((sponsorId, position) => {
      statements.push(
        row("fighter_sponsors", { fighter_id: fighter.id, sponsor_id: sponsorId, position }),
      );
    });

    const invite = seedInviteFor(fighter, now);
    const token = newToken();
    inviteLinks.push({ fighter: fighter.id, token });
    statements.push(
      row("invites", {
        id: newId("in"),
        token,
        event_id: eventId,
        fighter_id: fighter.id,
        sent_at: invite.sentAt,
        last_opened_at: invite.lastOpenedAt,
        submitted_at: invite.submittedAt,
        created_at: now,
      }),
    );
  }

  for (const bout of event.bouts) {
    statements.push(
      row("bouts", {
        id: `bo_${event.slug}_${bout.number}`,
        event_id: eventId,
        number: bout.number,
        discipline: bout.discipline,
        weight_kg: bout.weightKg,
        class_label: bout.classLabel,
        title_label: bout.titleLabel,
        womens: bout.womens ?? false,
        rounds: bout.rounds,
        round_minutes: bout.roundMinutes,
        billing: bout.billing,
        red_id: bout.redId,
        blue_id: bout.blueId,
        sponsor_id: bout.sponsorId,
      }),
    );
  }

  // The renders that already exist. They predate the bucket and are committed
  // under public/, so the job records where they are rather than claiming the
  // renderer produced them: the app only ever asks this table what is playable.
  for (const boutNumber of renderedBouts) {
    statements.push(
      row("render_jobs", {
        id: `rj_${event.slug}_${boutNumber}`,
        event_id: eventId,
        bout_number: boutNumber,
        status: "done",
        r2_key: `/renders/bout-${boutNumber}.mp4`,
        requested_at: now,
        finished_at: now,
      }),
    );
  }

  return { sql: `${statements.join("\n")}\n`, inviteLinks };
}
