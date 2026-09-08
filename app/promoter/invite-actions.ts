"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DONE, attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { ACTION_ERRORS } from "@/lib/copy";
import { newToken } from "@/lib/auth";
import { getDb, inviteSecret, type Db } from "@/lib/db";
import { INVITE_TTL_MS, isSentChannel, sealedColumns } from "@/lib/invite-token";
import { currentPromoter, type Promoter } from "@/lib/session";
import { loadOwnedCard, type OwnedCard } from "@/lib/visibility";
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

type Owned = { promoter: Promoter; card: OwnedCard };

/**
 * The show and the promoter who owns it, or the sentence to show instead.
 *
 * The where clause used to be written out again here rather than shared with
 * app/promoter/actions.ts, because everything exported from a "use server"
 * module is an endpoint and a helper cannot be passed between two of them
 * without also publishing it to the internet. `loadOwnedCard` is in
 * lib/visibility.ts, which is not a server module, so the copies are gone and
 * the rule is where the publish gate is.
 */
async function ownedEvent(db: Db, slug: string): Promise<ActionResult<Owned>> {
  const promoter = await currentPromoter();
  if (!promoter) return refuse(ACTION_ERRORS.signedOut);

  const card = await loadOwnedCard(db, slug, promoter.id);
  if (!card) return refuse(ACTION_ERRORS.noSuchShow);

  return done({ promoter, card });
}

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
