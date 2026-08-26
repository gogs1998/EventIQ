import { headers } from "next/headers";
import { RENDER_KEY_HEADER, secretMatches } from "@/lib/auth";
import { readSecret, type Db } from "@/lib/db";
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

/**
 * Who is allowed to render a show.
 *
 * The capture page at `/render/[slug]/[bout]` cannot use the rule above, and the
 * reason is the whole point of the feature: a promoter renders the videos while
 * they are still building the card, so the renderer has to reach a draft. That
 * left it as the one route reading any show anybody could name — and a slug is
 * the promoter's own show name, so it is guessable by anyone who knows a show is
 * coming. An audit found a draft's name, venue, city, date, both fighters and
 * their gyms coming out of a route that was protected by nothing but not being
 * linked to.
 *
 * So it gets its own credential rather than the publish check. Either is enough:
 *
 * - the shared render key in a header, which is what the renderer holds, or
 * - a promoter session that owns the show, so a promoter can open the capture
 *   page in their own browser to see what the video will look like.
 *
 * The key is checked first because it costs no cookie read and no query. It is
 * the same rule for a published show as for a draft: a second, quieter way to
 * read a card is worth nothing to a spectator, and one rule cannot be applied to
 * the wrong half of the routes.
 */
export function renderableTo(
  card: { promoterId: string },
  access: { keyMatched: boolean; viewerId?: string | null },
): boolean {
  return access.keyMatched || (!!access.viewerId && access.viewerId === card.promoterId);
}

/**
 * The card at this slug for the renderer, or null where the caller has not
 * proved it is entitled to it. Null, like everywhere else here, so the route can
 * answer the same 404 it answers for a slug that does not exist — an
 * unauthorised caller must not be told which of the two they hit.
 */
export async function loadRenderableCard(db: Db, slug: string): Promise<LoadedCard | null> {
  const card = await loadCard(db, slug);
  if (!card) return null;

  const keyMatched = await secretMatches(
    (await headers()).get(RENDER_KEY_HEADER),
    await readSecret("RENDER_KEY"),
  );
  const viewerId = keyMatched ? null : (await currentPromoter())?.id;

  return renderableTo(card, { keyMatched, viewerId }) ? card : null;
}
