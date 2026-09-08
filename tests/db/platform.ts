import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";
import * as schema from "@/db/schema";

/**
 * A real local D1, opened from the project's own wrangler.jsonc.
 *
 * **Why this rather than @cloudflare/vitest-pool-workers.** The pool runs the
 * tests themselves inside workerd, which is the more faithful arrangement and is
 * also a second runtime to keep working on Windows, a second module resolver for
 * the `@/` alias, and an isolate per test file with a workerd behind each. This
 * machine has three agents on eight gigabytes. `getPlatformProxy` is wrangler's
 * own supported Node API for exactly this — it reads wrangler.jsonc, starts one
 * Miniflare, and hands back the same `env.DB` and `env.MEDIA` the Worker gets —
 * so the database is real, the bindings are real, and the tests are ordinary
 * Node tests that run in about a second and a half a file.
 *
 * `persist: false` matters more than it looks. Wrangler's default is
 * `.wrangler/state`, which is the development database the dev server has open,
 * and a second writer on that file is the trap CLAUDE.md warns about twice. This
 * database is in memory and goes when the process does.
 *
 * `remoteBindings: false` for the reason next.config.ts gives: the moment
 * anything tries to open a remote proxy session without a Cloudflare token, the
 * bindings it was going to provide come back poisoned instead.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATIONS = path.join(ROOT, "db/migrations");

export type Db = DrizzleD1Database<typeof schema>;

export type Platform = {
  d1: D1Database;
  db: Db;
  media: R2Bucket;
  dispose: () => Promise<void>;
};

/** Every migration file, in the order wrangler would apply them. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * The statements of one migration.
 *
 * Split on drizzle's own marker rather than on semicolons, because several of
 * these files carry a semicolon inside a comment and one of them rebuilds a
 * table across four statements.
 */
export function migrationStatements(file: string): string[] {
  return readFileSync(path.join(MIGRATIONS, file), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Applies migrations to a database, one batch per call.
 *
 * A batch rather than a statement at a time because each one is a round trip to
 * workerd, and the whole chain is about forty of them — a second a file against
 * a tenth of a second for the lot.
 */
export async function applyMigrations(d1: D1Database, files: string[]): Promise<void> {
  const statements = files.flatMap(migrationStatements);
  if (!statements.length) return;
  await d1.batch(statements.map((statement) => d1.prepare(statement)));
}

/**
 * A fresh database with the named migrations applied, defaulting to all of them.
 *
 * The caller disposes it. One of these is one workerd, so the suite opens one
 * per test file and shuts it again rather than leaving several running.
 */
export async function startPlatform(files: string[] = migrationFiles()): Promise<Platform> {
  const proxy = await getPlatformProxy<{ DB: D1Database; MEDIA: R2Bucket }>({
    configPath: path.join(ROOT, "wrangler.jsonc"),
    persist: false,
    remoteBindings: false,
  });

  const d1 = proxy.env.DB;
  await applyMigrations(d1, files);

  return {
    d1,
    db: drizzle(d1, { schema }),
    media: proxy.env.MEDIA,
    dispose: proxy.dispose,
  };
}

/**
 * Runs writes the fast way: one `exec` with the parameters written into the SQL.
 *
 * The measurement behind this is worth writing down, because it decides whether
 * a database suite is something anybody runs. A write statement through the D1
 * binding costs about forty milliseconds, and batching does not help — twenty
 * inserts in one `batch()` cost the same forty each. The same twenty through
 * `exec()` cost forty milliseconds for all of them. So planting a card is one
 * `exec` rather than nine writes, and the suite runs in seconds.
 *
 * The SQL still comes out of drizzle and therefore out of db/schema.ts: only the
 * binding is undone, and only for statements this file wrote. Nothing here ever
 * sees a value from outside the tests.
 */
export async function execWrites(
  d1: D1Database,
  writes: readonly { toSQL: () => { sql: string; params: unknown[] } }[],
): Promise<void> {
  if (!writes.length) return;
  await d1.exec(writes.map((write) => inlined(write.toSQL())).join("\n"));
}

function inlined(query: { sql: string; params: unknown[] }): string {
  let at = 0;
  const sql = query.sql.replace(/\?/g, () => literal(query.params[at++]));
  if (at !== query.params.length) throw new Error(`Could not inline: ${query.sql}`);
  return `${sql};`;
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = String(value);
  // `exec` splits on newlines, so a fixture value carrying one would be sent as
  // two broken statements rather than as itself.
  if (/[\r\n]/.test(text)) throw new Error("A fixture value cannot contain a newline");
  return `'${text.replaceAll("'", "''")}'`;
}

let active: Platform | null = null;

/**
 * The platform the code under test reads its bindings from.
 *
 * A module-level handle rather than something passed in, because the point of
 * the suite is to run the real `getDb()` callers unchanged — a server action
 * takes a slug and a form, not a database.
 */
export function setPlatform(platform: Platform | null): void {
  active = platform;
}

export function currentPlatform(): Platform {
  if (!active) throw new Error("No test platform. Call setPlatform() in beforeAll.");
  return active;
}

/**
 * Empties every table, children first.
 *
 * Cheaper than a database per test and, unlike dropping the schema, it keeps the
 * indexes and the foreign keys that half of these tests are actually about.
 *
 * Through `exec` rather than a batch, and the difference is not small: a write
 * statement through the binding costs about forty milliseconds whether it is on
 * its own or in a batch of twenty, and the same thirteen statements through
 * `exec` cost nine milliseconds for the lot. It is the reason this suite runs in
 * seconds rather than minutes. `exec` splits on newlines, so nothing here may
 * span one.
 */
export async function emptyTables(d1: D1Database): Promise<void> {
  const tables = [
    "analytics_events",
    "fighter_sponsors",
    "event_sponsors",
    "invites",
    "render_jobs",
    "bouts",
    "events",
    "fighters",
    "sponsors",
    "render_keys",
    "password_resets",
    "promoters",
    "import_cache",
  ];
  await d1.exec(tables.map((table) => `DELETE FROM ${table};`).join("\n"));
}
