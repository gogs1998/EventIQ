/**
 * Which masthead, if any, a route is entitled to.
 *
 * EventIQ is the product on its own marketing pages and it is the tool a signed-in
 * promoter is using, so on both it should say its own name. On the programme it is
 * the plumbing: the show is the promoter's, the sponsors are the promoter's, and a
 * spectator holding a phone at a venue should read Cage County Promotions before
 * they read us. Those pages already carry the promoter's lockup in the hero and a
 * quiet EventIQ credit in the footer, which is the balance we want.
 *
 * It is the same reasoning that leaves the sponsor-strip emblem a monoline mark:
 * the one logo in the room that is not paying should not be the loudest.
 */
export type Masthead = "full" | "modest" | "none";

/**
 * Routes that get no mark of ours above the fold.
 *
 * The first four are the spectator's and the fighter's: the programme, a fighter's
 * profile, the printable table card and the questionnaire. `/render` is on the list
 * for an unrelated and much less forgiving reason — it is the surface the mp4
 * exporter screenshots, so anything painted over it is burned into 480 frames of
 * video, the way the Next.js dev badge once was.
 */
const UNBRANDED = ["/e", "/f", "/qr", "/render", "/media"];

/** The promoter's side of the product: their tool, our name on it, modestly. */
const PROMOTER = "/promoter";

function within(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Anything not named above is treated as ours and gets the full masthead, so a
 * marketing page added later is branded by default. The pages that must stay
 * unbranded are the ones worth enumerating, because forgetting one of those is
 * the mistake that costs something.
 */
export function mastheadFor(pathname: string): Masthead {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (UNBRANDED.some((prefix) => within(path, prefix))) return "none";
  if (within(path, PROMOTER)) return "modest";
  return "full";
}
