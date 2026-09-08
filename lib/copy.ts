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

/**
 * What a card carries where a gym has not been given yet.
 *
 * A promoter enters a running order off a matchmaking sheet that often has only
 * two names on a line, so this stands in until somebody fills the box. It is a
 * prompt, never a fact: it lives here, and `stated()` in lib/tape.ts treats it
 * exactly like a blank, so no derivation can read it as a gym. Written in one
 * place because it used to be typed in two and compared in a third, which is how
 * a freshly entered card came to announce "Same gym. Both out of Gym to confirm."
 */
export const GYM_TO_CONFIRM = "Gym to confirm";

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
 * The record row's edge on the tale of the tape.
 *
 * Inside the programme, where fight idiom belongs, so it is set the way a card
 * sets a reach advantage: the size of the gap and what it is a gap in. Neither
 * says anything about the other fighter, because the row is read out with both
 * of them standing in the room.
 */
export function winsEdge(wins: number): string {
  return `+${wins} ${wins === 1 ? "win" : "wins"}`;
}

export function fewerLossesEdge(losses: number): string {
  return `${losses} fewer ${losses === 1 ? "loss" : "losses"}`;
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

/* -------------------------------------------------------------------------
 * A bout that is off
 *
 * Withdrawals happen on every amateur card — weight, injury, a no-show — and
 * they are nobody's fault as far as this product is concerned. So none of these
 * lines say why unless the promoter has, none of them name a fighter, and none
 * of them read as an apology for a card that has changed, which is a normal
 * thing for a card to do on the week of a show.
 *
 * The other rule here is the one every count-bearing string is held to: a card
 * with nothing off says nothing, rather than announcing that no bouts are off.
 * ---------------------------------------------------------------------- */

export const WITHDRAWN = {
  /** Beside the bout number the withdrawal keeps, on the public programme. */
  label: "Withdrawn",
  /** Where the tale of the tape and the video would have been. */
  note: "This bout is off. The rest of the running order is unchanged.",
  /** The card editor's control. Short, because it sits in a row of them. */
  toggle: "Bout off",
  back: "Put the bout back on",
  reasonLabel: "Reason, if you want to give one",
  reasonPlaceholder: "Withdrew at the weigh-in",
  /**
   * Under the control. It has to say what stays, because the alternative a
   * promoter would otherwise reach for is deleting the bout, which takes the
   * sponsor placement and the bout's figures with it.
   */
  editorNote:
    "The bout keeps its number and its sponsor on the programme and is shown as withdrawn. " +
    "Nothing is deleted, and it can go back on.",
} as const;

/* -------------------------------------------------------------------------
 * The card editor's record importer
 *
 * The undercard is the weakest part of the product, and the reason is that
 * thirty fighters never reply. This is how a promoter raises its floor without
 * them, so the tone is about what the card gains and never about who has not
 * answered — a blank profile is a state to be handled, not a fault to point at.
 *
 * Nothing here promises the numbers are right, either. Amateur records go stale,
 * and what goes in front of the room is what the promoter confirmed, which is
 * the same rule as the source badge on the fighter's own form.
 * ---------------------------------------------------------------------- */

export const RECORD_IMPORT = {
  heading: "Fill this in from a record page",
  blurb:
    "Paste this fighter's Sherdog page and their record comes across. It fills only the boxes " +
    "that are still empty, and shows you what it found before anything is saved.",
  placeholder: "sherdog.com/fighter/Owen-Pryce-123456",
  look: "Look it up",
  looking: "Looking…",
  apply: "Put these on the card",
  applying: "Saving…",
  /** After a save. The fields that changed are named after it. */
  applied: "Added to the card",
  nothing: "Nothing on that page fills a box this fighter has left empty.",
  /** Beside a box the card already has an answer for. */
  kept: "already on the card, so it stays",
  caution: "Records on these pages go out of date. What the room reads is what you confirm here.",
  notAProfile:
    "That does not look like a Sherdog or Tapology fighter page. It should look like " +
    "sherdog.com/fighter/Name-12345.",
} as const;

/**
 * How much of the running order has come off, or nothing.
 *
 * Null rather than a sentence on the ordinary card, because most cards lose
 * nobody and "no bouts off" is a withdrawal on the promoter's screen that has
 * not happened. Same rule as every other count here: no zero-bout string states
 * a count.
 */
export function boutsOffLabel(cancelled: number): string | null {
  if (cancelled <= 0) return null;
  return `${cancelled} off`;
}

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
  /** A sponsor id from another account: it exists, and it is still not theirs to place. */
  noSuchSponsor: "That sponsor is not on this account.",

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
  /**
   * The emblem. Separate sentences for the same reason the fighter's photograph
   * has three: a different file and a smaller file are different things to go
   * and do. Neither mentions the sponsor's name, because an emblem is artwork
   * and the name is set in the app's own type whatever happens here.
   */
  markNotAnImage: "That emblem is not a JPEG, PNG or WebP image.",
  markTooLarge: "That emblem is too large to send. A few hundred pixels across is plenty.",
  markNotStored:
    "That emblem would not upload. Try again, or add the sponsor without one — the name is set " +
    "in the programme's own type either way.",

  /**
   * The card editor's record importer. Both of these are read beside a box the
   * promoter can type into, so both point back at it: a lookup that will not run
   * is an inconvenience, not a dead end.
   */
  importTooMany:
    "That is a lot of lookups at once, so they are paused for a moment. The boxes on this row " +
    "still take anything you type.",
  importNotRead:
    "That page could not be read just now. The boxes on this row still take anything you type.",

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

/**
 * What the dashboard says about each bout's video.
 *
 * Rendering happens on a machine somewhere else, on its own schedule, and it
 * sometimes does not work. All three of those are ordinary and none of them are
 * the promoter's doing, so none of these lines suggest they are, and none of
 * them promise when anything will be ready — the machine that makes these is a
 * laptop or an hourly job, and a promise about it is a promise somebody else has
 * to keep.
 *
 * The one thing every line has to get across is that a video already on the
 * programme stays on it. A bout being remade, or one whose last attempt stopped
 * early, is still playing what it was playing, and a promoter who thought
 * otherwise would pull a card off the wall an hour before doors.
 */
export const RENDER_SECTION = {
  heading: "Videos",
  body:
    "One vertical video for each bout, built from the fighters' own photographs. They are " +
    "made away from the site, on a machine with the video tools on it, so this panel reports " +
    "what has been made rather than making it. Whatever is on the programme stays there until " +
    "a new one is finished.",
} as const;

export const RENDER_STATE_COPY = {
  current: {
    label: "Current",
    note: "Made from this bout as it stands.",
  },
  stale: {
    label: "Worth remaking",
    note: "Something on this bout has changed since its video was made. The one on the programme still plays.",
  },
  queued: {
    label: "Queued",
    note: "Waiting its turn.",
  },
  running: {
    label: "Being made",
    note: "A machine is working through this one now.",
  },
  failed: {
    label: "Did not finish",
    note: "The last attempt stopped early. Anything already on the programme is still there.",
  },
  missing: {
    label: "Not made yet",
    note: "No video for this bout so far.",
  },
} as const;

/** The button that asks for one. It queues a bout; nothing renders in the browser. */
export const RENDER_AGAIN = "Render again";

/** Under the section heading: how many of the card's videos are of the card as it is. */
export function renderCountLabel(current: number, bouts: number): string {
  if (bouts <= 0) return "No bouts yet";
  return `${current} of ${bouts} up to date`;
}
