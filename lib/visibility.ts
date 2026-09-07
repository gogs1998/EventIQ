import { headers } from "next/headers";
import { RENDER_KEY_HEADER, secretMatches } from "@/lib/auth";
import { readSecret, type Db } from "@/lib/db";
import {
  eventVisibility,
  eventsShowingPortrait,
  inviteHoldsPortrait,
  loadCard,
  type LoadedCard,
} from "@/lib/db/queries";
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

/**
 * Who is allowed to see an object in the media bucket.
 *
 * `/media/[...key]` served the whole bucket to anyone who could name a key. The
 * keys carry a random suffix, so nothing was enumerable, but "not guessable" is
 * the argument that was made for the capture page as well, and section 6c is
 * what came of it. A draft show's rendered video and a fighter's photograph on a
 * card nobody has published are the same secret as the card itself, so they go
 * behind the same rule rather than behind the length of a filename.
 *
 * A key has to say which show it belongs to before that rule can be applied, and
 * the two prefixes say it differently: a render carries the slug in the key, and
 * a portrait is found by the path stored on the fighter row. Anything that is
 * neither is refused outright, so a prefix added later has to come here and say
 * who may read it rather than inheriting an accident.
 */
export type MediaKey =
  /** `fighters/…` or `cutouts/…`, addressed by the path stored on the fighter. */
  | { kind: "portrait"; path: string }
  /** `renders/<slug>/…`, the mp4 for one bout of that show. */
  | { kind: "render"; slug: string };

/** The shape of the key, or null where it is not one this route serves. */
export function parseMediaKey(key: string): MediaKey | null {
  // Traversal cannot reach outside a bucket, but a key that is not one of the
  // shapes below has no rule attached to it, and no rule means no.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.includes("..")) return null;

  const segments = key.split("/");
  if (segments.length === 2 && (segments[0] === "fighters" || segments[0] === "cutouts")) {
    return { kind: "portrait", path: `/media/${key}` };
  }
  if (segments.length === 3 && segments[0] === "renders") {
    return { kind: "render", slug: segments[1] };
  }
  return null;
}

export type MediaSubject = {
  /** Every show the object appears on. Empty means it hangs off nothing. */
  events: readonly { published: boolean; promoterId: string }[];
  /** The caller came from the questionnaire of the fighter this portrait is of. */
  heldByInvite?: boolean;
};

export type MediaAccess = {
  keyMatched: boolean;
  viewerId?: string | null;
};

/**
 * The rule itself: the same one the card goes behind, plus the two credentials
 * that already exist for reading a draft.
 *
 * `public` is separate from `visible` because the answer now depends on who is
 * asking, and a photograph that only the promoter may see must not be handed to
 * a shared cache under the one-year immutable header the public ones get.
 *
 * An object attached to no show at all is refused. That is a photograph uploaded
 * against a fighter who has since been taken off every card, and there is
 * nobody it can be said to belong to.
 */
export function mediaVisibleTo(
  subject: MediaSubject,
  access: MediaAccess,
): { visible: boolean; public: boolean } {
  const published = subject.events.some((event) => event.published);
  const visible =
    published ||
    access.keyMatched ||
    !!subject.heldByInvite ||
    subject.events.some((event) => visibleTo(event, access.viewerId));

  return { visible, public: published };
}

/**
 * The invite token in the referrer, where there is one.
 *
 * A fighter's own photograph is shown back to them in the questionnaire, and on
 * a card that is not published yet none of the credentials above is one they
 * hold: there is no fighter account, and the token that is their whole
 * authorisation lives in the address of the page rather than in the image
 * request it makes. Their browser does send that address, because a same-origin
 * subresource carries the full path under this site's referrer policy.
 *
 * This is not a new way in. The token is the credential either way, and a caller
 * who can write this header at will is a caller who already has it — what it
 * cannot do is let anybody read a photograph of somebody else, because the token
 * has to belong to the fighter the object is of.
 */
export function inviteTokenFromReferrer(referrer: string | null | undefined): string | null {
  return referrer?.match(/\/f\/([A-Za-z0-9_-]{20,64})(?:[/?#]|$)/)?.[1] ?? null;
}

/**
 * Whether this key may be served to this caller, with the credentials read in
 * cost order: the published case is one query and no cookie, and nothing else is
 * asked for until it has failed.
 */
export async function mediaVisibility(
  db: Db,
  key: string,
  requestHeaders: Headers,
): Promise<{ visible: boolean; public: boolean }> {
  const refused = { visible: false, public: false };
  const target = parseMediaKey(key);
  if (!target) return refused;

  const events =
    target.kind === "render"
      ? [await eventVisibility(db, target.slug)].filter((event) => event !== null)
      : await eventsShowingPortrait(db, target.path);

  const open = mediaVisibleTo({ events }, { keyMatched: false });
  if (open.visible) return open;

  const keyMatched = await secretMatches(
    requestHeaders.get(RENDER_KEY_HEADER),
    await readSecret("RENDER_KEY"),
  );
  const viewerId = keyMatched ? null : (await currentPromoter())?.id;

  const owned = mediaVisibleTo({ events }, { keyMatched, viewerId });
  if (owned.visible || target.kind !== "portrait") return owned;

  const token = inviteTokenFromReferrer(requestHeaders.get("referer"));
  const heldByInvite = !!token && (await inviteHoldsPortrait(db, token, target.path));
  return mediaVisibleTo({ events, heldByInvite }, { keyMatched, viewerId });
}
