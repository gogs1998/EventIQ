"use server";

import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import { attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { digestToken, hashPassword, passwordLongEnough } from "@/lib/auth";
import { ACCOUNT_COPY, RESET_COPY } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { NO_FAILURES } from "@/lib/lockout";
import { resetUsable } from "@/lib/password-reset";
import { withinLoginLimit } from "@/lib/rate-limit";

/**
 * Spending a reset link.
 *
 * The token in the URL is the whole credential, the same arrangement a fighter's
 * invite uses, and it is bounded the same way an invite is not: it dies after
 * half an hour and it works once. Both are checked here rather than only on the
 * page that rendered the form, because the action is reachable directly and a
 * check that lives in a page is a check a POST can walk past.
 *
 * It is behind the LOGIN_ATTEMPTS limiter for the reason the login form is. A
 * reset token is 32 random bytes and nobody is guessing one, but this is a route
 * that takes no session, does a PBKDF2 derivation, and writes — which is the
 * exact shape of thing worth flooding, and the limiter is already there.
 *
 * The link is spent before the password is written, by an update that only
 * matches while it is unspent, and the password is written only if that update
 * changed a row. It used to be stamped in the same batch as the password, which
 * read as atomic and was not: both tabs read the row as unspent before either
 * batch ran, and both set a password. The cost of this order is that a write
 * that fails after the claim leaves the link spent, and the answer to that is
 * the same as to a link that has run out â€” the operator mints another.
 */
export async function setPasswordFromReset(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return attempt(
    { event: "setPasswordFromReset", route: "/promoter/reset" },
    RESET_COPY.notSet,
    async () => {
      if (!(await withinLoginLimit(await headers()))) return refuse(RESET_COPY.tooMany);

      const token = String(form.get("token") ?? "");
      const next = String(form.get("next") ?? "");
      const confirm = String(form.get("confirm") ?? "");

      if (!token) return refuse(RESET_COPY.deadBody);
      if (!passwordLongEnough(next)) return refuse(ACCOUNT_COPY.tooShort);
      if (next !== confirm) return refuse(ACCOUNT_COPY.mismatch);

      const db = await getDb();
      const [reset] = await db
        .select()
        .from(schema.passwordResets)
        .where(eq(schema.passwordResets.tokenDigest, await digestToken(token)))
        .limit(1);

      const now = Date.now();
      // A link that never existed, one that has run out and one already spent all
      // answer alike, because the holder does the same thing about each of them.
      if (!reset || !resetUsable(reset, now)) return refuse(RESET_COPY.deadBody);

      const [promoter] = await db
        .select()
        .from(schema.promoters)
        .where(eq(schema.promoters.id, reset.promoterId))
        .limit(1);
      if (!promoter) return refuse(RESET_COPY.deadBody);

      const passwordHash = await hashPassword(next);

      const claimed = await db
        .update(schema.passwordResets)
        .set({ usedAt: now })
        .where(and(eq(schema.passwordResets.id, reset.id), isNull(schema.passwordResets.usedAt)))
        .returning({ id: schema.passwordResets.id });
      if (!claimed.length) return refuse(RESET_COPY.deadBody);

      await db
        .update(schema.promoters)
        // The version bump is the point of doing this rather than only writing
        // a hash: somebody resetting a password has usually lost control of
        // something, and every session already out there ends here.
        .set({
          passwordHash,
          sessionVersion: promoter.sessionVersion + 1,
          // Whatever guessing locked the account is what sent them here.
          ...NO_FAILURES,
        })
        .where(eq(schema.promoters.id, promoter.id));

      return done({ message: RESET_COPY.done });
    },
  );
}
