"use server";

import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import {
  ABSENT_PROMOTER_HASH,
  hashPassword,
  passwordLongEnough,
  verifyPassword,
} from "@/lib/auth";
import { ACCOUNT_COPY, ACTION_ERRORS } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { NO_FAILURES } from "@/lib/lockout";
import { currentPromoter, signIn } from "@/lib/session";

/**
 * The promoter changing their own password.
 *
 * Separate from app/promoter/actions.ts on purpose: everything in that file is
 * about a show, checks who owns one, and answers in the vocabulary of a card.
 * This is about the account itself and shares none of that.
 *
 * Three properties it has to keep.
 *
 * **The current password is required**, so a session somebody walked away from
 * cannot be turned into permanent access. Without it, an unlocked laptop is the
 * whole account rather than the fortnight the cookie has left on it.
 *
 * **It takes the same time whichever way it goes.** The new password is hashed
 * before the current one is judged, and both derivations always happen, so the
 * form cannot be used as a fast oracle for guessing the password of the account
 * already signed in. That matters here more than it looks: this page is reachable
 * from a session, and a session is exactly what a shared machine leaves behind.
 *
 * **It bumps the session version**, which is the revocation. Every other cookie
 * naming this promoter is a generation behind from the next request onward, and
 * the browser doing the changing is handed a fresh one so it stays signed in —
 * a password change that logs you out of the page you are standing on reads as
 * a failure.
 */
export async function changePassword(
  _state: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return attempt(
    { event: "changePassword", route: "/promoter/account" },
    ACCOUNT_COPY.notChanged,
    async () => {
      const promoter = await currentPromoter();
      if (!promoter) return refuse(ACTION_ERRORS.signedOut);

      const current = String(form.get("current") ?? "");
      const next = String(form.get("next") ?? "");
      const confirm = String(form.get("confirm") ?? "");

      if (!current || !next) return refuse(ACCOUNT_COPY.needBoth);
      if (!passwordLongEnough(next)) return refuse(ACCOUNT_COPY.tooShort);
      // Asked twice because there is no email here: a typo in the only copy of a
      // new password costs a phone call to an operator and a reset link.
      if (next !== confirm) return refuse(ACCOUNT_COPY.mismatch);

      // Both derivations run whatever the answer turns out to be. A promoter row
      // with no hash on it — which only an operator can create — verifies
      // against the decoy for the same reason the login does.
      const [matches, passwordHash] = await Promise.all([
        verifyPassword(current, promoter.passwordHash ?? ABSENT_PROMOTER_HASH),
        hashPassword(next),
      ]);
      if (!matches) return refuse(ACCOUNT_COPY.currentNotRecognised);

      const sessionVersion = promoter.sessionVersion + 1;
      await (await getDb())
        .update(schema.promoters)
        // Any lockout counted against the account goes too. Somebody who has just
        // proved the current password and set a new one should not find the door
        // shut behind them by a stranger's guessing.
        .set({ passwordHash, sessionVersion, ...NO_FAILURES })
        .where(eq(schema.promoters.id, promoter.id));

      await signIn(promoter.id, sessionVersion);
      return done({ message: ACCOUNT_COPY.changed });
    },
  );
}
