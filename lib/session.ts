import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  ABSENT_PROMOTER_HASH,
  SESSION_COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  readSession,
  sessionCookieName,
  sessionIsCurrent,
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
 * Where it is set the cookie also takes the `__Host-` prefix — see
 * sessionCookieName in lib/auth.ts for what that buys and why the name has to
 * change with the attribute rather than being one string everywhere.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Issues a cookie for this promoter, replacing whatever was there.
 *
 * Called on every sign-in and again when a password changes, so the value in the
 * browser is always one minted after the last thing that could have compromised
 * it. A session is never carried over: the cookie is a fresh signature over a
 * fresh expiry, which is what stops a value planted before sign-in from becoming
 * a signed-in one afterwards.
 */
export async function signIn(promoterId: string, sessionVersion: number): Promise<void> {
  const secret = await requireSecret("SESSION_SECRET");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const value = await signSession({ promoterId, version: sessionVersion, expiresAt }, secret);

  const jar = await cookies();
  // The other name first, so a cookie left over from a deploy on the other side
  // of the https line cannot sit there shadowing the one being set.
  for (const name of SESSION_COOKIE_NAMES) jar.delete(name);

  jar.set(sessionCookieName(isProduction), value, {
    httpOnly: true,
    sameSite: "lax",
    // Both of these are also what `__Host-` requires: no domain, path at the
    // root, secure. Changing either would silently stop the browser storing it.
    secure: isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) jar.delete(name);
}

export type Promoter = typeof schema.promoters.$inferSelect;

/**
 * The signed-in promoter, or null.
 *
 * The row is re-read rather than trusted from the cookie, so deleting a promoter
 * logs them out on their next request instead of at the end of the fortnight.
 * The same read is what makes revocation possible: a cookie naming a generation
 * the account has moved past is refused here, which is how changing a password
 * signs out the laptop somebody left on a train.
 */
export async function currentPromoter(): Promise<Promoter | null> {
  const cookie = (await cookies()).get(sessionCookieName(isProduction))?.value;
  if (!cookie) return null;

  const session = await readSession(cookie, await requireSecret("SESSION_SECRET"));
  if (!session) return null;

  const db = await getDb();
  const [promoter] = await db
    .select()
    .from(schema.promoters)
    .where(eq(schema.promoters.id, session.promoterId))
    .limit(1);
  if (!promoter) return null;

  return sessionIsCurrent(session, promoter.sessionVersion) ? promoter : null;
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

export type LoginResult =
  | { ok: true; promoterId: string; sessionVersion: number }
  | { ok: false };

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

  return { ok: true, promoterId: promoter.id, sessionVersion: promoter.sessionVersion };
}

async function recordFailure(db: Db, promoter: Promoter, now: number): Promise<void> {
  await db
    .update(schema.promoters)
    .set(afterFailure(promoter, now))
    .where(eq(schema.promoters.id, promoter.id));
}
