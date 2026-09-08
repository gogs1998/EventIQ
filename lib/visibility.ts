import { headers } from "next/headers";
import { digestsMatch, RENDER_KEY_HEADER, secretDigest, secretMatches } from "@/lib/auth";
import { readSecret, type Db } from "@/lib/db";
import {
  eventVisibility,
  eventsOfPromoter,
  eventsShowingPortrait,
  inviteHoldsPortrait,
  loadCard,
  loadCardById,
  renderKeysFor,
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

/**
 * Which gate a card came through.
 *
 * A brand rather than a comment. `LoadedCard` is what `loadCard` returns and it
 * says nothing about who may see it, so a route that had one could pass it
 * anywhere a checked card was wanted and nothing would notice. These two types
 * can only be made by the two functions below — the cast is here and nowhere
 * else — so a card in a route either came through a gate or does not typecheck.
 * The eslint rule in eslint.config.mjs is the other half of it: nothing under
 * app/ may import `loadCard` at all.
 */
declare const gate: unique symbol;

/** A card that has been through the publish check. Safe to render publicly. */
export type VisibleCard = LoadedCard & { readonly [gate]: "visible" };

/** A card that has been through the ownership check. The promoter's own show. */
export type OwnedCard = LoadedCard & { readonly [gate]: "owned" };

/** The rule itself, with nothing around it: published, or the promoter's own. */
export function visibleTo(
  card: { published: boolean; promoterId: string },
  viewerId: string | null | undefined,
): boolean {
  return card.published || (!!viewerId && viewerId === card.promoterId);
}

/** The same, for a page that is the promoter's rather than the public's. */
export function ownedBy(
  card: { promoterId: string },
  promoterId: string | null | undefined,
): boolean {
  return !!promoterId && card.promoterId === promoterId;
}

/**
 * The card at this slug, or null where the caller is not entitled to it.
 *
 * Null covers both "no such show" and "not yours", because a page that tells
 * them apart is a way of finding out what a promoter has in the diary. The
 * session is only read when the card is unpublished, so the ordinary case of a
 * spectator opening a live programme costs no extra query.
 */
export async function loadVisibleCard(db: Db, slug: string): Promise<VisibleCard | null> {
  const card = await loadCard(db, slug);
  if (!card) return null;
  if (card.published) return card as VisibleCard;

  const promoter = await currentPromoter();
  return visibleTo(card, promoter?.id) ? (card as VisibleCard) : null;
}

/**
 * The card at this slug for the promoter it belongs to, or null.
 *
 * The same rule as the publish check and the same reason for being here: it was
 * written out five times — twice inline in a promoter page as
 * `card.promoterId !== promoter.id`, and three times as a where clause in three
 * "use server" files that could not share a helper between them, because
 * everything a "use server" module exports is an endpoint. Five copies of a rule
 * is the shape of every bug in section 14 that mattered. This module is not a
 * server module, so the copies can become one call.
 *
 * Null for a show that is not theirs and for a show that does not exist alike:
 * a slug is the promoter's own show name and therefore guessable, so telling
 * the two apart would be a way of finding out what a rival has in the diary.
 *
 * It costs the whole card rather than the one row a where clause would, and
 * that is the trade taken deliberately. Nearly every caller goes on to ask for a
 * render, which loads the same card again, and none of them is on a spectator's
 * path — a promoter pressing save can afford a round trip that a QR code on a
 * table cannot.
 */
export async function loadOwnedCard(
  db: Db,
  slug: string,
  promoterId: string,
): Promise<OwnedCard | null> {
  const card = await loadCard(db, slug);
  return card && ownedBy(card, promoterId) ? (card as OwnedCard) : null;
}

/**
 * The card an invite is for.
 *
 * The fighter's questionnaire holds no session and no key: the token in the
 * address is the whole of the authorisation, and `loadInviteByToken` has already
 * spent it. So there is nothing left for this to check — and that is exactly why
 * it is written down here with the others rather than left as a `loadCard` in a
 * route, because "this one is different" is where the next hole will be.
 *
 * The show is taken off the invite row rather than out of the address, so the
 * card a fighter is shown cannot be a different show from the one their link was
 * issued for however the page happens to be reached.
 */
export function loadInvitedCard(
  db: Db,
  invite: { eventId: string },
): Promise<LoadedCard | null> {
  return loadCardById(db, invite.eventId);
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
 * - a render key in a header, which is what the renderer holds — scoped to this
 *   promoter or to none, unexpired and unrevoked; see `renderKeyGrants`, or
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

/** One row of `render_keys`, as the rule below needs it. */
export type RenderKey = {
  /** Null is the runner's: it renders whatever is queued, so it reads any card. */
  promoterId: string | null;
  digest: string;
  expiresAt: number | null;
  revokedAt: number | null;
};

/**
 * Whether a key that has been presented and matched is a credential for these
 * promoters' cards.
 *
 * There was one render key, in a secret, and it read every card on the instance
 * published or not. That is the right size of credential while one operator runs
 * one promoter's shows; the moment there are two promoters it is a cross-tenant
 * read held by a GitHub runner, and section 20 had already written it down as
 * the thing to fix before promoter number two rather than as they arrive.
 *
 * So the scope is on the row. A key scoped to a promoter reaches that promoter's
 * shows and answers 404 on everybody else's, exactly as a stranger does, and an
 * unscoped key is the runner's — it has to reach every promoter because it
 * renders whatever is queued, and it is the one key that wants keeping narrow in
 * *who holds it* rather than in what it reads.
 *
 * Expiry and revocation are checked here rather than in the query so that the
 * whole rule is one function with a test per branch. An expired key and a
 * revoked one are both simply not a credential; neither is told apart from a
 * wrong key by anything the caller can see.
 */
export function renderKeyGrants(
  key: RenderKey,
  promoterIds: readonly string[],
  now: number,
): boolean {
  if (key.revokedAt !== null) return false;
  if (key.expiresAt !== null && key.expiresAt <= now) return false;
  return key.promoterId === null || promoterIds.includes(key.promoterId);
}

/**
 * Whether the key on this request opens these promoters' cards.
 *
 * Both the capture page and `/media` ask this, so a key that reads a draft show
 * and a key that reads the mp4 of the same draft show cannot come apart — they
 * were two calls to the same comparison before and they are two calls to the
 * same function now.
 */
export async function renderKeyMatches(
  db: Db,
  presented: string | null | undefined,
  promoterIds: readonly string[],
  now = Date.now(),
): Promise<boolean> {
  if (!presented) return false;

  // The migration path, and nothing else. `RENDER_KEY` is the single shared
  // secret the table above exists to replace, and it is still accepted so that
  // the Worker, the workflow and whoever renders by hand do not all have to
  // change in the same breath as this ships. Once every runner holds a minted
  // key, `wrangler secret delete RENDER_KEY` and this branch both go — DEPLOY.md
  // has the order to do it in.
  if (await secretMatches(presented, await readSecret("RENDER_KEY"))) return true;

  const digest = await secretDigest(presented);
  const keys = await renderKeysFor(db, promoterIds);

  // Every row, without breaking out of the loop on the first hit: the comparison
  // is over digests and how long it takes must not depend on which key was
  // presented or how far down the table the right one sits.
  let matched = false;
  for (const key of keys) {
    if (digestsMatch(key.digest, digest) && renderKeyGrants(key, promoterIds, now)) matched = true;
  }
  return matched;
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

  const keyMatched = await renderKeyMatches(db, (await headers()).get(RENDER_KEY_HEADER), [
    card.promoterId,
  ]);
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
  /**
   * `fighters/…`, `cutouts/…` or `portraits/…`, addressed by the path stored on
   * the fighter. All three are a picture of one person and go behind one rule.
   */
  | { kind: "portrait"; path: string }
  /** `renders/<slug>/…`, the mp4 for one bout of that show. */
  | { kind: "render"; slug: string }
  /** `sponsors/<promoterId>/…`, an emblem the promoter uploaded. */
  | { kind: "sponsor"; promoterId: string };

/**
 * The three prefixes that hold a picture of a fighter: the photograph they
 * sent, the cutout the renderer made from it, and the poster art they opted
 * into. Each is found through the column on the fighter that stores its path,
 * so an object nothing points at is refused rather than served.
 */
const PORTRAIT_PREFIXES = ["fighters", "cutouts", "portraits"];

/** The shape of the key, or null where it is not one this route serves. */
export function parseMediaKey(key: string): MediaKey | null {
  // Traversal cannot reach outside a bucket, but a key that is not one of the
  // shapes below has no rule attached to it, and no rule means no.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.includes("..")) return null;

  const segments = key.split("/");
  if (segments.length === 2 && PORTRAIT_PREFIXES.includes(segments[0])) {
    return { kind: "portrait", path: `/media/${key}` };
  }
  if (segments.length === 3 && segments[0] === "renders") {
    return { kind: "render", slug: segments[1] };
  }
  // A sponsor's emblem says which promoter it belongs to in the key itself,
  // which is the third way one of these can name its show and the reason the
  // promoter is carried separately below: an emblem exists from the moment it is
  // uploaded, which can be before the promoter has published anything at all.
  if (segments.length === 3 && segments[0] === "sponsors") {
    return { kind: "sponsor", promoterId: segments[1] };
  }
  return null;
}

export type MediaSubject = {
  /** Every show the object appears on. Empty means it hangs off nothing. */
  events: readonly { published: boolean; promoterId: string }[];
  /** The caller came from the questionnaire of the fighter this portrait is of. */
  heldByInvite?: boolean;
  /**
   * The promoter the object belongs to directly, rather than through a show.
   * Only a sponsor's emblem has one, and it is what lets a promoter see the
   * artwork they have just uploaded on a card nobody has published yet.
   */
  ownerId?: string;
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
    (!!subject.ownerId && subject.ownerId === access.viewerId) ||
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

  // A sponsor's emblem goes behind the promoter's own shows: it is on the
  // strip, on a bout card and inside the videos, so it is as public as the
  // cards it appears on and no more. `ownerId` is what keeps the promoter's own
  // view of it working before any of those shows is published.
  const events =
    target.kind === "render"
      ? [await eventVisibility(db, target.slug)].filter((event) => event !== null)
      : target.kind === "sponsor"
        ? await eventsOfPromoter(db, target.promoterId)
        : await eventsShowingPortrait(db, target.path);
  const ownerId = target.kind === "sponsor" ? target.promoterId : undefined;

  const open = mediaVisibleTo({ events, ownerId }, { keyMatched: false });
  if (open.visible) return open;

  // The same check the capture page makes, on the same key, scoped to whichever
  // shows this object hangs off. An object on nobody's show is refused below
  // whatever the key says, so an empty list here asks only about the runner's.
  const keyMatched = await renderKeyMatches(
    db,
    requestHeaders.get(RENDER_KEY_HEADER),
    events.map((event) => event.promoterId),
  );
  const viewerId = keyMatched ? null : (await currentPromoter())?.id;

  const owned = mediaVisibleTo({ events, ownerId }, { keyMatched, viewerId });
  if (owned.visible || target.kind !== "portrait") return owned;

  const token = inviteTokenFromReferrer(requestHeaders.get("referer"));
  const heldByInvite = !!token && (await inviteHoldsPortrait(db, token, target.path));
  return mediaVisibleTo({ events, heldByInvite }, { keyMatched, viewerId });
}
