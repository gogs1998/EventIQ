import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/**
 * Access to the bindings.
 *
 * The async form of getCloudflareContext is used everywhere rather than the
 * synchronous one, because the synchronous form is only valid inside a request
 * and this code also runs while Next.js is prerendering. Getting that wrong
 * fails at build time on a page that works perfectly in development, which is a
 * miserable thing to debug.
 *
 * Drizzle rather than Prisma. Prisma's D1 driver adapter works, but it still
 * ships a query engine into the bundle, and on Workers the thing that hurts is
 * bundle size and cold start rather than developer ergonomics. Drizzle compiles
 * to plain SQL with no runtime engine at all, and this schema is small enough
 * that Prisma's modelling advantages never come into play.
 */

export type Db = DrizzleD1Database<typeof schema>;

export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB, { schema });
}

export async function getMedia(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.MEDIA;
}

/**
 * Secrets, read through one place so a missing one fails loudly at the point of
 * use rather than silently disabling a check. An unset session secret must never
 * fall back to a default, because a known signing key is the same as no login.
 */
export async function requireSecret(name: "SESSION_SECRET"): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const value = (env as unknown as Record<string, string | undefined>)[name];
  if (!value) throw new Error(`${name} is not set. See DEPLOY.md.`);
  return value;
}
