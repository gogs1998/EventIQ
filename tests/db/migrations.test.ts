import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";
import { INVITE_TTL_MS } from "@/lib/invite-token";
import { applyMigrations, migrationFiles, startPlatform, type Platform } from "./platform";

/**
 * The migration rehearsal: a database from 0000 with a real card in it, brought
 * all the way forward.
 *
 * `npm run db:migrate` on a fresh checkout only ever proves that the chain runs
 * against nothing. Every interesting thing a migration here does, it does to
 * rows that were already there — the invite expiry backfilled in 0010, the
 * rendered video carried from `r2_key` to `current_r2_key` in 0005 before 0006
 * drops the column it came from — and a mistake in any of those is a live show
 * losing its links or its videos on the morning of a deploy. That is the one
 * failure this project cannot rehearse in production.
 *
 * The data is dated 2026-08, before the wave that wrote these migrations, and
 * the shape is the one the initial schema had: invites holding a token in the
 * clear, render jobs holding `r2_key`.
 */

const AUGUST = Date.UTC(2026, 7, 3);
const files = migrationFiles();
const [initial, ...later] = files;

let platform: Platform;
const d1 = () => platform.d1;

beforeAll(async () => {
  platform = await startPlatform([initial]);
  await plantAugust();
  await applyMigrations(platform.d1, later);
}, 60_000);

afterAll(async () => {
  await platform.dispose();
});

/** A promoter, a show, five bouts, ten invites in the clear and five render jobs. */
async function plantAugust(): Promise<void> {
  const fighters = [...Array(10)].map((_, at) => `fighter-${at + 1}`);
  const rows = [
    `INSERT INTO promoters (id, slug, name, password_hash, created_at) VALUES ('pr_cage', 'cage-county', 'Cage County', 'pbkdf2$100000$abc$def', ${AUGUST});`,
    `INSERT INTO events (id, promoter_id, slug, name, date, doors_time, first_bell_time, venue, city, published, created_at, updated_at) VALUES ('ev_cc12', 'pr_cage', 'cage-county-12', 'Cage County 12', '2026-08-15', '18:00', '19:00', 'Town Hall', 'Grangemouth', 1, ${AUGUST}, ${AUGUST});`,
    ...fighters.map(
      (id) =>
        `INSERT INTO fighters (id, name, gym, created_at, updated_at) VALUES ('${id}', '${id}', 'Bryn Athletic', ${AUGUST}, ${AUGUST});`,
    ),
    ...[...Array(5)].map(
      (_, at) =>
        `INSERT INTO bouts (id, event_id, number, discipline, weight_kg, womens, rounds, round_minutes, red_id, blue_id) VALUES ('bo_${at + 1}', 'ev_cc12', ${at + 1}, 'MMA', 70, 0, 3, 3, '${fighters[at * 2]}', '${fighters[at * 2 + 1]}');`,
    ),
    ...fighters.map(
      (id, at) =>
        `INSERT INTO invites (id, token, event_id, fighter_id, sent_at, created_at) VALUES ('in_${at + 1}', 'plaintext-token-${at + 1}', 'ev_cc12', '${id}', ${AUGUST}, ${AUGUST});`,
    ),
    // Four bouts rendered and published, one that never got that far. Only the
    // four have a video the programme is playing.
    ...[...Array(4)].map(
      (_, at) =>
        `INSERT INTO render_jobs (id, event_id, bout_number, status, r2_key, input_hash, requested_at, finished_at) VALUES ('rj_${at + 1}', 'ev_cc12', ${at + 1}, 'done', 'renders/cage-county-12/${at + 1}-abc.mp4', 'hash-${at + 1}', ${AUGUST}, ${AUGUST});`,
    ),
    `INSERT INTO render_jobs (id, event_id, bout_number, status, r2_key, input_hash, requested_at) VALUES ('rj_5', 'ev_cc12', 5, 'queued', NULL, 'hash-5', ${AUGUST});`,
  ];
  await platform.d1.exec(rows.join("\n"));
}

const columnsOf = async (table: string) =>
  (await d1().prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results.map(
    (column) => column.name,
  );

const count = async (table: string) =>
  (await d1().prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

describe("the migration chain, over a card that was already there", () => {
  it("runs at all, which is the only thing a fresh checkout ever proves", () => {
    expect(later.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^0000_/);
  });

  it("leaves the show, its running order and its people where they were", async () => {
    expect(await count("promoters")).toBe(1);
    expect(await count("events")).toBe(1);
    expect(await count("bouts")).toBe(5);
    expect(await count("fighters")).toBe(10);
    expect(await count("invites")).toBe(10);
    expect(await count("render_jobs")).toBe(5);
  });

  it("lands on exactly the columns db/schema.ts describes, and none of them twice", async () => {
    for (const table of [
      schema.promoters,
      schema.events,
      schema.bouts,
      schema.fighters,
      schema.invites,
      schema.sponsors,
      schema.renderJobs,
      schema.renderKeys,
      schema.analyticsEvents,
      schema.importCache,
      schema.passwordResets,
    ]) {
      const config = getTableConfig(table);
      const actual = await columnsOf(config.name);

      expect(new Set(actual).size, `${config.name} has a column twice`).toBe(actual.length);
      expect([...actual].sort(), config.name).toEqual(
        config.columns.map((column) => column.name).sort(),
      );
    }
  });

  it("carries a published video across the column that replaced it, then drops the old one", async () => {
    const rows = await d1()
      .prepare("SELECT id, status, current_r2_key, current_hash FROM render_jobs ORDER BY id")
      .all<{ id: string; status: string; current_r2_key: string | null; current_hash: string | null }>();

    expect(rows.results.slice(0, 4).map((row) => row.current_r2_key)).toEqual([
      "renders/cage-county-12/1-abc.mp4",
      "renders/cage-county-12/2-abc.mp4",
      "renders/cage-county-12/3-abc.mp4",
      "renders/cage-county-12/4-abc.mp4",
    ]);
    expect(rows.results.slice(0, 4).map((row) => row.current_hash)).toEqual([
      "hash-1",
      "hash-2",
      "hash-3",
      "hash-4",
    ]);
    // The one that never finished has no video, and must not be given one: a
    // key carried over from a failed attempt is a 404 on a published programme.
    expect(rows.results[4]).toMatchObject({ status: "queued", current_r2_key: null });

    expect(await columnsOf("render_jobs")).not.toContain("r2_key");
  });

  it("gives every invite an expiry dated from the migration, not from the row", async () => {
    const rows = await d1()
      .prepare("SELECT id, token, token_digest, expires_at, revoked_at FROM invites ORDER BY id")
      .all<{
        id: string;
        token: string | null;
        token_digest: string | null;
        expires_at: number | null;
        revoked_at: number | null;
      }>();

    for (const row of rows.results) {
      // Ninety days from now rather than ninety from a row written in August,
      // which would have expired every link on the card as it was upgraded.
      expect(row.expires_at).toBeGreaterThan(Date.now());
      expect(row.expires_at).toBeLessThanOrEqual(Date.now() + INVITE_TTL_MS + 60_000);
      expect(row.revoked_at).toBeNull();
      // Still in the clear, and still the fighter's way in. Encrypting them is
      // scripts/migrate-invites.mjs, deliberately a separate step: a fighter
      // must not lose their form to our own migration window.
      expect(row.token).toMatch(/^plaintext-token-/);
      expect(row.token_digest).toBeNull();
    }
  });

  it("adds the later columns with defaults that claim nothing", async () => {
    const bout = await d1()
      .prepare("SELECT cancelled, cancelled_note FROM bouts WHERE id = 'bo_1'")
      .first<{ cancelled: number; cancelled_note: string | null }>();
    expect(bout).toEqual({ cancelled: 0, cancelled_note: null });

    const promoter = await d1()
      .prepare("SELECT session_version, failed_logins, first_failed_login_at FROM promoters")
      .first<{ session_version: number; failed_logins: number; first_failed_login_at: number | null }>();
    expect(promoter).toEqual({
      session_version: 0,
      failed_logins: 0,
      first_failed_login_at: null,
    });

    // Nothing here invents a consent for a fighter nobody asked, which is the
    // one thing 0011 exists to avoid.
    const invite = await d1()
      .prepare("SELECT consented_at, consent_version FROM invites WHERE id = 'in_1'")
      .first<{ consented_at: number | null; consent_version: string | null }>();
    expect(invite).toEqual({ consented_at: null, consent_version: null });

    const fighter = await d1()
      .prepare("SELECT stylised FROM fighters WHERE id = 'fighter-1'")
      .first<{ stylised: string | null }>();
    expect(fighter).toEqual({ stylised: null });
  });

  it("keeps the password hash it was minted with, so nobody is locked out by a deploy", async () => {
    const promoter = await d1()
      .prepare("SELECT password_hash FROM promoters WHERE id = 'pr_cage'")
      .first<{ password_hash: string }>();
    expect(promoter?.password_hash).toBe("pbkdf2$100000$abc$def");
  });

  it("still refuses a second show at the same address", async () => {
    await expect(
      d1()
        .prepare(
          "INSERT INTO events (id, promoter_id, slug, name, date, doors_time, first_bell_time, venue, city, published, created_at, updated_at) VALUES ('ev_two', 'pr_cage', 'cage-county-12', 'Again', '2026-09-01', '18:00', '19:00', 'Hall', 'Town', 0, 1, 1)",
        )
        .run(),
    ).rejects.toThrow();
  });
});
