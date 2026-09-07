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
import { NO_FAILURES, afterFailure, lockedOut } from "@/lib/lockout";

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
 * Wrong password, unknown promoter and locked-out account all give the same
 * answer, and all three take about as long, because saying which is which turns
 * a login form into a way of finding out who exists — and a lockout that
 * announces itself tells an attacker their guessing is working.
 *
 * The counting is the half the edge limiter cannot do: it bounds callers, and
 * one password guessed slowly from many addresses is many callers. See
 * lib/lockout.ts for why the window does not extend while the door is shut.
 */
export async function attemptLogin(db: Db, slug: string, password: string): Promise<LoginResult> {
  const [promoter] = await db
    .select()
    .from(schema.promoters)
    .where(eq(schema.promoters.slug, slug))
    .limit(1);

  const now = Date.now();

  if (!promoter?.passwordHash || lockedOut(promoter, now)) {
    // Still do the work, so an unknown promoter is not distinguishable by timing.
    // A locked account is not counted against again either: the window closes
    // fifteen minutes after it opened however hard anybody keeps knocking.
    await verifyPassword(password, ABSENT_PROMOTER_HASH);
    return { ok: false };
  }

  if (!(await verifyPassword(password, promoter.passwordHash))) {
    await recordFailure(db, promoter, now);
    return { ok: false };
  }

  // Cleared only when it is holding something, so the ordinary sign-in is still
  // a read and no write.
  if (promoter.failedLogins > 0) {
    await db
      .update(schema.promoters)
      .set(NO_FAILURES)
      .where(eq(schema.promoters.id, promoter.id));
  }

  return { ok: true, promoterId: promoter.id };
}

async function recordFailure(db: Db, promoter: Promoter, now: number): Promise<void> {
  await db
    .update(schema.promoters)
    .set(afterFailure(promoter, now))
    .where(eq(schema.promoters.id, promoter.id));
}
