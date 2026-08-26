import type { Db } from "@/lib/db";
import { loadCard, type LoadedCard } from "@/lib/db/queries";
import { currentPromoter } from "@/lib/session";

/**
 * Who is allowed to see a show.
 *
 * An unpublished card is the promoter's working copy: they can see it so they can
 * check it before the codes go on the tables, and nobody else gets a hint that it
 * exists. That rule lived inline in the programme page, which meant three other
 * routes were free to forget it and did — the printable table card had no publish
 * check at all, and both generateMetadata functions built titles and descriptions
 * off any card that loaded, so a crawler or a link unfurler was handed draft event
 * and fighter names even where the body answered 404.
 *
 * It is one function now, and every public route loads its card through it, so
 * the next route to be added cannot leave the check out by omission. Getting a
 * card this way is the only way to get one on a public page.
 */

/** The rule itself, with nothing around it: published, or the promoter's own. */
export function visibleTo(
  card: { published: boolean; promoterId: string },
  viewerId: string | null | undefined,
): boolean {
  return card.published || (!!viewerId && viewerId === card.promoterId);
}

/**
 * The card at this slug, or null where the caller is not entitled to it.
 *
 * Null covers both "no such show" and "not yours", because a page that tells
 * them apart is a way of finding out what a promoter has in the diary. The
 * session is only read when the card is unpublished, so the ordinary case of a
 * spectator opening a live programme costs no extra query.
 */
export async function loadVisibleCard(db: Db, slug: string): Promise<LoadedCard | null> {
  const card = await loadCard(db, slug);
  if (!card) return null;
  if (card.published) return card;

  const promoter = await currentPromoter();
  return visibleTo(card, promoter?.id) ? card : null;
}
