"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
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
 * The row is stamped used in the same batch that writes the password, so a link
 * opened twice in two tabs cannot set two passwords. D1 runs a batch as one
 * transaction, which is what makes that true rather than nearly true.
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
      await db.batch([
        db
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
          .where(eq(schema.promoters.id, promoter.id)),
        db
          .update(schema.passwordResets)
          .set({ usedAt: now })
          .where(eq(schema.passwordResets.id, reset.id)),
      ]);

      return done({ message: RESET_COPY.done });
    },
  );
}
