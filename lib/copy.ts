import { RETENTION_DAYS } from "@/lib/consent";

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

/**
 * The pitch page with no show behind it.
 *
 * The shop window used to run on whatever was published with the furthest-out
 * date, so a version of this was only ever reached on an empty database. It is
 * ordinary now: the demo is one named show, and an instance that has not named
 * one — or has named one that is still a draft — has a pitch to make and no card
 * to open. Everything above it is true without a live card, so this replaces the
 * links into the programme and nothing else.
 *
 * Written for whoever is standing the instance up, because that is who reads it,
 * and in the same register as the rest: what the state is, and what fills it.
 */
export const NO_SHOWCASE = {
  heading: "No show on display here yet",
  body:
    "Everything above is the product as it stands. What is missing is a card to open: the " +
    "shop window runs on one published show, named in SHOWCASE_SLUG, and this instance has " +
    "not been pointed at one.",
  action: "Promoter sign in",
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
  /**
   * Their own show, and only ever their own. A name that collides with another
   * promoter's is suffixed instead — `cage-county-13-2` — because refusing it
   * would say that a show of that name exists somewhere on the instance.
   * Section 6f.
   */
  addressTaken: "You already have a show at that address. Give this one a slightly different name.",

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

  /* Consent, removal and the stylised portrait. */

  /**
   * The save that arrives before the box is ticked. It says what turns it on
   * rather than what went wrong, because nothing did.
   */
  consentNeeded: "Tick the box at the top and this will save. Nothing goes on the programme until then.",
  /**
   * Under the minimum age. Addressed to the person who needs to act next rather
   * than to the fighter, and it collects nothing further either way.
   */
  underAge:
    "This form is for fighters aged 18 and over. For anyone younger, a parent or guardian can " +
    "arrange the entry with the promoter directly.",
  detailsNotRemoved:
    "That did not go through. Nothing has been changed — try again in a moment, or ask the promoter.",

  /** The feature is off on this deployment, or there is no model to reach. */
  portraitNotHere:
    "Stylised portraits are not switched on here. The photograph you sent is what goes on the card.",
  portraitNeedsPhoto:
    "A stylised portrait is drawn from a photograph. Send one first and this comes back.",
  portraitNotMade:
    "That portrait would not come out. The photograph you sent is still the one on your card.",
  portraitNotFound:
    "That portrait is no longer here. Make another one, or keep the photograph you sent.",
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

/* -------------------------------------------------------------------------
 * The promoter's own account
 *
 * Changing a password and setting one from a reset link. Promoter accounts are
 * created by an operator rather than by signing up, so there is no "forgotten
 * your password?" link to write copy for: what there is instead is a promoter
 * on the phone to whoever runs this, and a link minted for them by hand.
 *
 * Two things shape the register. The first is the standing rule that nothing
 * here shames anybody — forgetting a password is not a lapse, and a wrong
 * current password is a typo before it is anything else. The second is that
 * these are the only sentences in the product that state a duration, and that is
 * a deliberate exception rather than a slip: how long a reset link lasts is a
 * fact the holder has no other way of finding out, unlike "takes about four
 * minutes", which was a promise nobody could keep. The tone test carves out
 * exactly those two lines and holds everything else to the usual rule.
 * ---------------------------------------------------------------------- */

/**
 * The change-password page. `hint` states the floor in words; a test holds it to
 * PASSWORD_MIN_LENGTH, because a policy that says twelve and enforces ten is a
 * refusal the promoter cannot act on.
 */
export const ACCOUNT_COPY = {
  heading: "Your password",
  body:
    "Changing it here signs out everywhere else this account is signed in, on every " +
    "device. This browser stays signed in.",
  currentLabel: "Current password",
  newLabel: "New password",
  confirmLabel: "New password again",
  hint:
    "Twelve characters or more. Nothing else is asked of it — length is what makes a " +
    "password hard to guess, and a phrase is easier to remember than a jumble.",
  submit: "Change password",
  pending: "Changing…",
  changed: "Password changed. Everywhere else this account was signed in has been signed out.",

  needBoth: "Enter the current password and a new one.",
  tooShort: "A new password needs to be twelve characters or more.",
  mismatch: "The two new passwords are not the same. Type the new one again.",
  currentNotRecognised: "That current password was not recognised. Try it again.",
  notChanged: "The password was not changed. Try again in a moment.",
} as const;

/**
 * The page behind a reset link. It is read by somebody who has been handed a URL
 * and may have no idea what state their account is in, so it says what the link
 * does before it asks for anything.
 */
export const RESET_COPY = {
  heading: "Set a new password",
  body:
    "Setting a password here signs out everywhere this account is signed in. Sign in " +
    "again with the new one afterwards.",
  /** One of the two lines allowed to state a duration. See the note above. */
  life: "A reset link lasts half an hour and can be used once.",
  submit: "Set the password",
  pending: "Setting…",
  done: "Password set. Sign in with it.",

  deadHeading: "This link is no longer active",
  /** The other. */
  deadBody:
    "A reset link lasts half an hour and can be used once, so this one has either been " +
    "spent or run out. Whoever sent it can make another.",

  tooMany: "That has been tried a few times just now. Leave it a moment and try again.",
  notSet: "The password was not set. Try again in a moment.",
} as const;

/* -------------------------------------------------------------------------
 * Consent, removal, retention and the stylised portrait
 *
 * The wording a fighter actually agrees to is not here — it is in
 * lib/consent.ts with the version stamp beside it, because a sentence somebody
 * consented to has to be quotable at the version they saw. Everything around
 * it is here: what the form says while it waits for the tick, what the removal
 * control says before and after it runs, the stylised portrait's own opt-in,
 * and the privacy notice at /privacy.
 *
 * Two rules on top of the usual ones. Nothing here may suggest a fighter has
 * done something wrong by asking for their details back, and nothing may
 * present generated artwork as a picture of anybody — the second is the same
 * principle as sponsor names never being set in generated artwork, applied to
 * a face instead of a wordmark.
 * ---------------------------------------------------------------------- */

/**
 * What the form says to somebody under the minimum age.
 *
 * It stops there and asks nobody for anything else, which is the whole point:
 * the age is the only field answered at that stage and it is not stored either.
 * Addressed to what happens next rather than to the fighter, because a junior
 * fighter on a card is ordinary and is not a problem with them.
 */
export const UNDER_AGE = {
  heading: "A parent or guardian needs to do this part",
  body:
    "This form is for fighters aged 18 and over. For anyone younger, a parent or guardian " +
    "should speak to the promoter, who can take the details a different way. Nothing on this " +
    "form is stored while that is the age on it.",
} as const;

/** The line above the form once the tick has been given, and the link out of it. */
export const CONSENT_GIVEN = {
  label: "Agreed",
  body: "You agreed to this before you started. It is the same wording, and it has not changed.",
  changed:
    "The wording has been updated since you agreed to it. Read it again and tick the box to " +
    "carry on.",
} as const;

/**
 * The removal control at the foot of the questionnaire.
 *
 * Two presses rather than one, because it takes a photograph off a card and
 * empties a profile, and neither comes back. The confirmation says exactly what
 * goes and exactly what stays: a fighter who is told "everything" and then finds
 * their name still on the running order has been told something untrue.
 */
export const REMOVAL = {
  heading: "Remove my details",
  body:
    "This clears everything you sent — your photograph, your record, your story, your age and " +
    "your hometown — and takes the photograph down. Your link stops working, and the video for " +
    "your bout is made again without you in it.",
  stays:
    "Your name, your gym and your bout stay on the running order, because that is the card the " +
    "promoter is putting on. Ask the promoter about those.",
  start: "Remove my details",
  confirm: "Yes, remove them",
  cancel: "Keep them",
  done: {
    heading: "Your details have been removed",
    body:
      "Everything you sent has been cleared and your photograph has been taken down. This link " +
      "no longer opens anything. The promoter can send a new one if you want to fill it in again.",
  },
} as const;

/**
 * The stylised portrait, which is off unless a deployment turns it on.
 *
 * Every line here has the same job: make it plain that this is artwork, that it
 * is optional, that the photograph is what happens otherwise, and that nothing
 * is published until the fighter has looked at the result. It is offered after
 * the photograph rather than instead of it for that reason.
 */
export const STYLISED = {
  label: "Stylised portrait",
  hint:
    "Optional. Your photograph can be redrawn as fight-poster artwork for your card and your " +
    "video. It is a drawing rather than a picture of you, and the photograph you sent is what " +
    "goes on the card unless you ask for this and then approve it.",
  consent:
    "I would like my photograph sent to be redrawn as artwork, and I understand the result is " +
    "artwork rather than a photograph of me.",
  make: "Make one",
  making: "Drawing it…",
  again: "Try another",
  preview: "Nothing is published until you approve it.",
  approve: "Use this on my card",
  discard: "Discard it",
  approved: "Your card and your video now use the artwork. Discard it any time to go back to your photograph.",
  discarded: "Discarded. Your photograph is what goes on the card.",
} as const;

/**
 * The privacy notice at /privacy.
 *
 * Same register as the rest of the product: plain sentences, British English, no
 * defined terms, no clause numbering, and nothing a fighter would need a
 * dictionary for. It says what is collected, where it goes, who decides, how
 * long it is kept and how to have it removed, and it points every request at the
 * promoter, who is the one running the show.
 *
 * It claims no legal review, and it must not start claiming one.
 */
export const PRIVACY = {
  title: "Privacy notice",
  intro:
    "This explains what EventIQ collects from fighters on a digital fight programme, where it " +
    "is shown, how long it is kept and how to have it removed. It is written for the person " +
    "filling in the questionnaire.",
  sections: [
    {
      heading: "Who is responsible for it",
      body:
        "The promoter running the show decides what goes on their card and what is asked for. " +
        "EventIQ builds and hosts the programme for them, stores what a fighter sends, and does " +
        "nothing else with it. Anything a fighter wants doing about their details goes to the " +
        "promoter, who can act on it or ask EventIQ to.",
    },
    {
      heading: "What is collected",
      body:
        "From the fighter: a photograph, an age, a hometown, a nickname, an amateur record and " +
        "how those wins finished, height, reach, stance, a walkout song, an Instagram handle, " +
        "chosen sponsors, and whatever the fighter writes about themselves. From the promoter: " +
        "a name, a gym and a place on the running order. From a spectator reading a programme: " +
        "a count of what was opened and tapped, with no name and no account attached to it.",
    },
    {
      heading: "What it is used for",
      body:
        "One thing: putting the show on. The details go on the public programme for that show, " +
        "into the tale of the tape video for that bout, and onto the promoter's own dashboard so " +
        "they know whose profile is still empty. Nothing is sold on, nothing is used to advertise " +
        "anything else, and no profile is passed to another promoter.",
    },
    {
      heading: "Sponsors",
      body:
        "Sponsors pay to appear on the programme and in the videos. Their logos sit beside a " +
        "fighter's details on the page and close out the video for a bout. Sponsors are shown " +
        "counts of how many people opened the programme and tapped their placement. They are not " +
        "given a fighter's details, and they cannot contact a fighter through EventIQ.",
    },
    {
      heading: "How long it is kept",
      body:
        "For the show, and for as long as the fighter is on cards this promoter is running — a " +
        "returning fighter gets their details back rather than a blank form. A fighter who is on " +
        `no card, whose last show was more than ${RETENTION_DAYS} days ago, has everything they ` +
        "sent cleared and their photograph deleted. Counts of what spectators opened are kept " +
        "without anything in them that names a person.",
    },
    {
      heading: "Stylised portraits",
      body:
        "A fighter can ask for their photograph to be redrawn as poster artwork. It is off unless " +
        "the fighter asks for it, the photograph is sent to Cloudflare's image model to do it, and " +
        "the result appears nowhere until the fighter has looked at it and approved it. It is " +
        "artwork rather than a photograph, and it is never presented as a picture of anybody.",
    },
    {
      heading: "What a fighter can ask for",
      body:
        "To see what is held. To have something corrected — the questionnaire link does that at " +
        "any time. To have it all removed, which the Remove my details control at the foot of the " +
        "questionnaire does immediately. To object to any of it being published. Withdrawing " +
        "agreement is the same control and has the same effect.",
    },
    {
      heading: "How to ask",
      body:
        "Through the promoter running the show. They hold the card, they sent the link, and they " +
        "are the ones who can answer for what is on their programme. A fighter who cannot reach " +
        "the promoter can use the removal control on their own questionnaire link, which needs " +
        "nobody's help.",
    },
  ],
  /** The link at the foot of the questionnaire's notice and in the site footer. */
  link: "Privacy notice",
} as const;

/** Every line of the new copy as flat strings, for the tone tests. */
export const CONSENT_COPY_STRINGS: readonly string[] = [
  UNDER_AGE.heading,
  UNDER_AGE.body,
  CONSENT_GIVEN.label,
  CONSENT_GIVEN.body,
  CONSENT_GIVEN.changed,
  REMOVAL.heading,
  REMOVAL.body,
  REMOVAL.stays,
  REMOVAL.start,
  REMOVAL.confirm,
  REMOVAL.cancel,
  REMOVAL.done.heading,
  REMOVAL.done.body,
  ...Object.values(STYLISED),
  PRIVACY.title,
  PRIVACY.intro,
  ...PRIVACY.sections.flatMap((section) => [section.heading, section.body]),
  PRIVACY.link,
];

/* -------------------------------------------------------------------------
 * Sending a fighter their link
 *
 * There is no SMS or email provider behind this and there is not going to be
 * one. A promoter already has every fighter in WhatsApp, and a message from a
 * sender nobody recognises is a message nobody answers. So the product's job is
 * to make the promoter's own send one tap and to record that it happened, which
 * is the only way the chase list can tell "never went out" from "went out and
 * was ignored".
 *
 * These are verbs the promoter is about to do rather than descriptions of what
 * the software will do, because none of it is sent from here. Nothing on this
 * list says anything about the fighter.
 * ---------------------------------------------------------------------- */

export const INVITE_SHARE = {
  /** The line above the controls, on the dashboard. */
  note:
    "Send it from your own phone or laptop. Either way the message goes out with their " +
    "link already in it, and the chase list records which one you used.",
  whatsapp: "WhatsApp",
  sms: "Text",
  copy: "Copy link",
  /** Issues a fresh link. The old one stops working the moment this lands. */
  regenerate: "New link",
  regenerateHint: "Issues a new link and stops the old one working",
  revoke: "Revoke link",
  revokeHint: "Stops this link working, without issuing another",
} as const;

/** How a link went out, as the chase list reports it. "" where nobody said. */
export const INVITE_CHANNEL = {
  whatsapp: "on WhatsApp",
  sms: "by text",
  copied: "",
} as const;

/** What the dashboard says about a link that will not open anything. */
export const INVITE_STATE = {
  revoked: "This link has been withdrawn. New link issues a working one.",
  expired: "This link has lapsed. New link issues a working one.",
  /** A rotated key is the only thing that leaves a stored link unreadable. */
  unreadable: "The link for this fighter cannot be shown. New link issues a fresh one.",
} as const;
