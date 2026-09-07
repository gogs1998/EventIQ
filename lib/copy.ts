/**
 * The sentences that have to change when a count is zero.
 *
 * A show can be created and published before its running order goes in — the
 * two are a couple of clicks apart and typing fifteen bouts is an afternoon — so
 * an empty card is ordinary use rather than an edge case. The crash it used to
 * cause is fixed, but the prose around it was left interpolating the count
 * regardless, and the result read as a fault rather than as a state: "a tale of
 * the tape for all 0 bouts" on the pitch page, and a running order headed
 * "0 BOUTS" that still invited the reader to tap one.
 *
 * They live here rather than inline in five pages for two reasons. A page can be
 * read by eye and its zero case cannot, so these are testable; and the next
 * count-bearing sentence somebody writes has somewhere obvious to go, which is
 * the same argument that put the publish check in one file.
 *
 * The register is the one the rest of the product uses: plain, professional,
 * British English. Nothing here jokes about paper programmes, promises how long
 * anything takes, or tells a fighter what they have failed to do.
 */

/** "15 bouts", "1 bout", or the honest version of neither. */
export function boutCountLabel(bouts: number): string {
  if (bouts <= 0) return "No bouts yet";
  return `${bouts} ${bouts === 1 ? "bout" : "bouts"}`;
}

/**
 * What the programme says where the running order would be. It replaces the
 * "tap any bout" line rather than sitting under it, because a count label, a
 * hint and a panel all saying the card is empty is three sentences for one fact.
 */
export const EMPTY_PROGRAMME = {
  heading: "No bouts on this card yet",
  body:
    "Nothing has been added to the running order. Every bout that goes on it appears " +
    "here, main event first, with a tale of the tape behind each one.",
  /** Only ever seen by the promoter, on their own unpublished show. */
  promoter: "Add the bouts and both corners get an invite link straight away.",
} as const;

/** The pitch page's hero line, which counts the card it is running on. */
export function tapeForEveryBout(bouts: number): string {
  return bouts > 0
    ? `a tale of the tape for all ${bouts} bouts`
    : "a tale of the tape for every bout on it";
}

/** The pitch page's "have a look" link to the programme. */
export function programmeLinkNote(bouts: number): string {
  return bouts > 0
    ? "Tap any bout for the tale of the tape."
    : "The running order is not up yet.";
}

/** The pitch page's promoter section: who there is to chase. */
export function chaseNote(outstanding: number, fighters: number): string {
  if (fighters <= 0) {
    return (
      "There is no running order on this one yet. Once there is, every fighter with a " +
      "hole in their profile is listed top of the bill first, because a gap in the main " +
      "event costs more than a gap in bout two."
    );
  }
  return (
    `${outstanding} of the ${fighters} fighters still have holes in their profile, ` +
    "listed top of the bill first, because a gap in the main event costs more than a " +
    "gap in bout two. Each one comes with a message you can copy straight into WhatsApp " +
    "that names their bout and their opponent. It tells a fighter their opponent has " +
    "already sent theirs only when that is true."
  );
}

/** The pitch page's sponsor inventory, which is a count of bouts. */
export function sponsorNote(sold: number, bouts: number): string {
  if (bouts <= 0) {
    return "every bout that goes on it brings a slot of its own with it, ready to sell";
  }
  return `${sold} of the ${bouts} bout slots sold, ${bouts - sold} still available`;
}

/** The printed table card, which is read at the venue rather than today. */
export function tableCardNote(bouts: number): string {
  const all = bouts > 0 ? `All ${bouts} bouts.` : "The whole running order.";
  return `${all} Every fighter’s record, gym and story, with a tale of the tape for all of them.`;
}

/**
 * The promoter's dashboard, where an empty card is most likely to be somebody's
 * first five minutes with the product. It replaces the readiness figures rather
 * than showing them as zeroes, because "0/0 bouts ready" and a chase list
 * announcing that every profile on the card is finished are both wrong about a
 * card that does not exist yet.
 */
export const EMPTY_DASHBOARD = {
  heading: "There is nothing on this card yet",
  body:
    "Put the running order in and both corners of every bout get an invite link " +
    "straight away. Who to chase, which bouts are ready and which sponsor slots are " +
    "unsold all fill in from it.",
} as const;

/** The card editor, where the running order is actually typed. */
export const EMPTY_CARD_EDITOR = "Nothing on the running order yet. Add the first bout below.";

/** The sub-line under a count of sponsor taps. */
export function sponsorTapNote(sponsors: number): string {
  if (sponsors <= 0) return "No sponsor has been tapped yet";
  return `Across ${sponsors} ${sponsors === 1 ? "sponsor" : "sponsors"}`;
}

/* -------------------------------------------------------------------------
 * What is said when something goes wrong
 *
 * Here for the same two reasons as the zero-bout strings above: a sentence a
 * promoter only sees on a bad afternoon is a sentence nobody reads by eye, and
 * the tone rules are exactly the ones easiest to drop under pressure. An error
 * message is where "never shame a promoter or a fighter" is hardest to keep and
 * most worth keeping — a fighter whose photograph would not upload in a car park
 * needs to know what to do next, not whose fault it was.
 *
 * The rules the test holds these to: no gendered pronouns, nothing that assigns
 * blame, no unverifiable promise about how long anything will take, and never
 * the underlying failure. "D1_ERROR: database is locked" goes to the log; the
 * screen gets a sentence.
 * ---------------------------------------------------------------------- */

/** The route-level error boundary: the layout survived, this page did not. */
export const PAGE_ERROR = {
  heading: "This page did not load",
  body:
    "Something went wrong at our end. Trying again will often be enough, and anything " +
    "already saved is still there.",
  retry: "Try again",
} as const;

/**
 * The last boundary, which replaces the whole document. Deliberately shorter:
 * the layout, the fonts and the stylesheet are the things that have gone.
 */
export const APP_ERROR = {
  heading: "EventIQ could not load this",
  body: "Something went wrong at our end. Reloading the page will often be enough.",
  retry: "Reload the page",
} as const;

/** Any address with nothing behind it, on our own side of the product. */
export const NOT_FOUND = {
  heading: "There is nothing at this address",
  body:
    "The link may have changed since it was written down, or the page may have moved. " +
    "Everything else is where it was.",
  action: "Back to the start",
} as const;

/**
 * A spectator holding a link to a programme that will not open. It carries no
 * EventIQ branding, the same as every other page under `/e` — see lib/masthead.ts
 * — and it must not imply the promoter has done something wrong, because the
 * commonest reason by far is a show that is simply not published yet.
 */
export const PROGRAMME_NOT_FOUND = {
  heading: "This programme is not here",
  body:
    "The show may not be published yet, or its address may have changed since the code " +
    "was printed. Whoever handed out the link will have the current one.",
} as const;

/** The promoter's side: a show that is not theirs and one that never existed read alike. */
export const SHOW_NOT_FOUND = {
  heading: "That show is not on this account",
  body:
    "It may have been taken down, or the address may belong to another promoter. Your " +
    "shows are all listed on the dashboard.",
  action: "Back to your shows",
} as const;

/**
 * What a server action answers with when it refuses or when it breaks.
 *
 * Every one of these is shown next to the control the promoter or the fighter
 * just used, so they are written to be read there rather than as a page of their
 * own: what happened, and what to do about it.
 */
export const ACTION_ERRORS = {
  /** A session that ran out mid-afternoon, which is the commonest of these by far. */
  signedOut: "You have been signed out. Sign in again and this change will go through.",
  /** A show that is not this promoter's and one that does not exist answer alike. */
  noSuchShow: "That show is not available on this account.",
  notOnThisCard: "That fighter is not on this card.",

  notSaved: "That did not save. Try again in a moment.",
  showNotCreated: "The show could not be created. Try again in a moment.",

  showNeedsNameAndDate: "A show needs a name and a date.",
  /** The empty-slug rule, said as the reason it exists rather than as a refusal. */
  showNameNeedsCharacters:
    "A show name needs at least one letter or number in it, because the address for the " +
    "programme is made from the name.",
  addressTaken: "There is already a show at that address. Change the name slightly.",

  boutNeedsBothCorners: "A bout needs a name in both corners.",
  fighterNeedsName: "A fighter needs a name. It carries their bout on the card and in the video.",
  sponsorNeedsName: "A sponsor needs a name.",

  /** The fighter's side. Their typing stays in the boxes whatever these say. */
  unknownInvite: "This link is no longer active. Ask the promoter for a new one.",
  /**
   * A save that never reached the action at all, which on a phone at a venue is
   * most of them. It has to say the typing is safe, because the fighter can see
   * it in the boxes and needs to know it is not about to go.
   */
  autosaveOffline: "Couldn’t save that — check your signal, it will try again as you type.",
  profileNotSaved:
    "That did not save. Your answers are still on the page, and it will try again as you type.",
  profileNotSubmitted:
    "That did not go through. Your answers are still here — try again in a moment.",
  photoNotStored: "That photo would not upload. Try a different one, or come back to it later.",
  photoNotAPhotograph: "That file is not a JPEG, PNG or WebP photograph.",
  photoTooLarge: "That photo is too large to send. Try one from the camera roll.",
} as const;
