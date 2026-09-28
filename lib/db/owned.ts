import { done, refuse, type ActionResult } from "@/lib/action-result";
import { ACTION_ERRORS } from "@/lib/copy";
import { getDb, type Db } from "@/lib/db";
import { loadInviteByToken } from "@/lib/db/queries";
import { currentPromoter, type Promoter } from "@/lib/session";
import { loadOwnedCard, type OwnedCard } from "@/lib/visibility";

/**
 * The two lookups every server action in this product begins with.
 *
 * Both of them existed three times over — `ownedEvent` in app/promoter's three
 * "use server" files, `inviteFor` in app/f/[token]'s three — because everything
 * a "use server" module exports is an endpoint reachable from the internet, so
 * those files cannot pass a helper between them. This module is not a server
 * module, so one body serves all six, and the next action to be written has
 * somewhere to import it from rather than a fourth copy to make.
 *
 * That is the same argument `loadOwnedCard` itself is the answer to (HANDOVER
 * section 6c). The rule about who may see a card lives in lib/visibility.ts; what
 * lives here is the sentence a refused caller is shown, which is the half an
 * action needs and a gate has no opinion about.
 */

/** A promoter and one of their shows, already checked. */
export type Owned = { promoter: Promoter; card: OwnedCard };

/**
 * The show and the promoter who owns it, or the sentence to show instead.
 *
 * A show that is not this promoter's and a show that does not exist answer
 * identically, so guessing a slug tells you nothing. It reads the session rather
 * than calling `requirePromoter`, because "signed out" is a thing a promoter can
 * act on and was previously indistinguishable from a crash.
 */
export async function ownedEvent(db: Db, slug: string): Promise<ActionResult<Owned>> {
  const promoter = await currentPromoter();
  if (!promoter) return refuse(ACTION_ERRORS.signedOut);

  const card = await loadOwnedCard(db, slug, promoter.id);
  if (!card) return refuse(ACTION_ERRORS.noSuchShow);

  return done({ promoter, card });
}

type Invite = NonNullable<Awaited<ReturnType<typeof loadInviteByToken>>>;

/** The invite a token opens, with the connection that read it. */
export type FoundInvite = { db: Db; row: Invite };

/**
 * The invite behind a token, or the sentence to show instead.
 *
 * A regenerated link, a revoked one, one that has lapsed and one that was never
 * issued all answer the same way, which is also the only true thing that can be
 * said to somebody holding any of them. The token is the whole of the
 * authorisation and `loadInviteByToken` has already spent it, so there is
 * nothing left to check — see `loadInvitedCard` in lib/visibility.ts, which is
 * the same argument written down beside the gates rather than left in a route.
 */
export async function inviteFor(token: string): Promise<ActionResult<FoundInvite>> {
  const db = await getDb();
  const row = await loadInviteByToken(db, token);
  if (!row) return refuse(ACTION_ERRORS.unknownInvite);
  return done({ db, row });
}
