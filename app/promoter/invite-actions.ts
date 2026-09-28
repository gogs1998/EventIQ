"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DONE, attempt, type ActionResult } from "@/lib/action-result";
import { ACTION_ERRORS } from "@/lib/copy";
import { newToken } from "@/lib/auth";
import { getDb, inviteSecret } from "@/lib/db";
import { ownedEvent } from "@/lib/db/owned";
import { INVITE_TTL_MS, isSentChannel, sealedColumns } from "@/lib/invite-token";
import type { SentChannel } from "@/lib/types";

/**
 * Everything the promoter can do to a fighter's link.
 *
 * Separated from the rest of the promoter's actions because the link is the
 * fighter's whole credential and the rules around it are its own subject: it is
 * encrypted at rest, it lapses, and it can be pulled. Keeping those three in one
 * file means the next change to any of them has an obvious place to land, and
 * the general "edit the card" actions do not quietly acquire a fourth rule about
 * tokens.
 *
 * Every one of these re-reads the show and checks who owns it, exactly as the
 * card actions do. A slug is a name, not a capability.
 */


/**
 * Records that the promoter has sent the link, and how.
 *
 * The dashboard's whole value is the difference between "they never looked" and
 * "they looked and bailed", and neither means anything if "we never sent it" is
 * mixed in with them. So this is written from the control the promoter actually
 * used rather than inferred from anything.
 *
 * The channel is recorded for the same reason as the timestamp: a promoter
 * deciding whether to ring somebody is better served by "went out on WhatsApp
 * four days ago" than by "sent". An unrecognised value is stored as nothing
 * rather than as itself, because this arrives from a form.
 */
export async function markInviteSent(
  slug: string,
  fighterId: string,
  channel: SentChannel = "copied",
): Promise<ActionResult> {
  return attempt(
    { event: "markInviteSent", route: `/promoter/e/${slug}`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await db
        .update(schema.invites)
        .set({
          sentAt: Date.now(),
          sentChannel: isSentChannel(channel) ? channel : null,
        })
        .where(
          and(eq(schema.invites.eventId, owned.card.eventId), eq(schema.invites.fighterId, fighterId)),
        );

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * Records that the promoter has handed a fighter their bout's promo.
 *
 * The same shape as `markInviteSent` and for the same reason: nothing here sends
 * anything, the control is a deep link into the promoter's own WhatsApp, and the
 * only observable moment is the tap. What it buys is the difference between
 * "nobody has told them there is a video" and "they were told and did nothing
 * with it", which is the difference the chase list is built on.
 *
 * Deliberately not inferred from a render finishing. A video being made is not a
 * video being sent, and a dashboard that conflated the two would have a promoter
 * believe an errand was done that nobody has done.
 */
export async function markVideoSent(slug: string, fighterId: string): Promise<ActionResult> {
  return attempt(
    { event: "markVideoSent", route: `/promoter/e/${slug}`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await db
        .update(schema.invites)
        .set({ videoSentAt: Date.now() })
        .where(
          and(eq(schema.invites.eventId, owned.card.eventId), eq(schema.invites.fighterId, fighterId)),
        );

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * A new token, which is how the old one is revoked.
 *
 * There is one invite row per fighter per show, so the old token stops existing
 * the moment this writes: nothing can match a digest that is no longer in the
 * table. That is why this does not set `revokedAt` — the column belongs to the
 * link the row is holding now, and stamping it here would issue a link that was
 * dead on arrival. `revokeInvite` is the one that sets it.
 *
 * The chase timestamps are cleared with it. A link that went to the wrong number
 * was never sent to this fighter, and carrying "sent, not opened" across to a
 * different link would be the dashboard reporting something that did not happen.
 */
export async function regenerateInvite(slug: string, fighterId: string): Promise<ActionResult> {
  return attempt(
    { event: "regenerateInvite", route: `/promoter/e/${slug}`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      const now = Date.now();
      await db
        .update(schema.invites)
        .set({
          // Null rather than absent: a row still holding a plaintext token from
          // before the migration has to lose it here as well, or the link the
          // promoter has just replaced would go on working.
          token: null,
          ...(await sealedColumns(await inviteSecret(), newToken())),
          expiresAt: now + INVITE_TTL_MS,
          revokedAt: null,
          sentAt: null,
          sentChannel: null,
          // Not cleared. It records that a video was handed over, which happened
          // and stays true whatever becomes of the link that asked for it.
          lastOpenedAt: null,
        })
        .where(
          and(eq(schema.invites.eventId, owned.card.eventId), eq(schema.invites.fighterId, fighterId)),
        );

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}

/**
 * Stops a link working without issuing another.
 *
 * "New link" answers the wrong number; this answers the link that has gone
 * somewhere it should not have. They are different problems and only one of them
 * wants a replacement sent out, so a promoter who wants the profile shut now can
 * shut it now and decide about a new link afterwards. Pressing "New link" later
 * lifts it, because a revoked row is a row waiting for a token rather than a
 * fighter struck off the card.
 */
export async function revokeInvite(slug: string, fighterId: string): Promise<ActionResult> {
  return attempt(
    { event: "revokeInvite", route: `/promoter/e/${slug}`, fighterId },
    ACTION_ERRORS.notSaved,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await db
        .update(schema.invites)
        .set({ revokedAt: Date.now() })
        .where(
          and(eq(schema.invites.eventId, owned.card.eventId), eq(schema.invites.fighterId, fighterId)),
        );

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}
