import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  ABSENT_PROMOTER_HASH,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  readSession,
  signSession,
  verifyPassword,
} from "@/lib/auth";
import { getDb, requireSecret, type Db } from "@/lib/db";

/**
 * Server-side session handling.
 *
 * The cookie is httpOnly and sameSite lax. Lax rather than strict because a
 * promoter following a link to their own dashboard from an email should not land
 * on a login screen, and there is nothing here a cross-site GET could damage.
 * Secure is set outside development, where there is no https to attach it to.
 */

const isProduction = process.env.NODE_ENV === "production";

export async function signIn(promoterId: string): Promise<void> {
  const secret = await requireSecret("SESSION_SECRET");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const value = await signSession({ promoterId, expiresAt }, secret);

  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export type Promoter = typeof schema.promoters.$inferSelect;

/**
 * The signed-in promoter, or null.
 *
 * The row is re-read rather than trusted from the cookie, so deleting a promoter
 * logs them out on their next request instead of at the end of the fortnight.
 */
export async function currentPromoter(): Promise<Promoter | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const session = await readSession(cookie, await requireSecret("SESSION_SECRET"));
  if (!session) return null;

  const db = await getDb();
  const [promoter] = await db
    .select()
    .from(schema.promoters)
    .where(eq(schema.promoters.id, session.promoterId))
    .limit(1);
  return promoter ?? null;
}

/**
 * For anything that must not run without a promoter. Throws rather than
 * returning null so a forgotten check is a crash rather than a data leak.
 */
export async function requirePromoter(): Promise<Promoter> {
  const promoter = await currentPromoter();
  if (!promoter) throw new Error("Not signed in");
  return promoter;
}

export type LoginResult = { ok: true; promoterId: string } | { ok: false };

/**
 * Wrong password and unknown promoter give the same answer, and both take about
 * as long, because saying which is which turns a login form into a way of
 * finding out who exists.
 */
export async function attemptLogin(db: Db, slug: string, password: string): Promise<LoginResult> {
  const [promoter] = await db
    .select()
    .from(schema.promoters)
    .where(eq(schema.promoters.slug, slug))
    .limit(1);

  if (!promoter?.passwordHash) {
    // Still do the work, so an unknown promoter is not distinguishable by timing.
    await verifyPassword(password, ABSENT_PROMOTER_HASH);
    return { ok: false };
  }

  return (await verifyPassword(password, promoter.passwordHash))
    ? { ok: true, promoterId: promoter.id }
    : { ok: false };
}
