import { MINIMUM_AGE, RETENTION_DAYS } from "@/lib/consent";

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

/* -------------------------------------------------------------------------
 * The pitch page's first screen
 *
 * A promoter reading this has a paper programme that works and a printer they
 * already pay. What has to be on the screen before they scroll is the price and
 * the three things the paper cannot do — and the competition, which is a card
 * viewer a promoter types into, cannot do either.
 *
 * Every line here is held to the no-unverifiable-claims rule harder than the
 * rest of the page, because these are the sentences that get repeated in a
 * meeting. Nothing about how long anything takes, no engagement figures, no
 * comparison with a named competitor, and nothing about the product that is not
 * already true on the instance the reader is looking at.
 * ---------------------------------------------------------------------- */

export const PITCH = {
  /**
   * The price, said plainly and early. It is the first question a promoter asks
   * and the answer is the strongest thing on the page, so it does not need
   * selling — a sentence that stated it and then argued with itself would read
   * as though there were a catch.
   */
  free: "Free for promoters. Putting a show on EventIQ costs nothing.",
  /**
   * The three differences, each one a thing the reader can check on this very
   * instance rather than a claim about what the product is like.
   */
  differences: [
    {
      label: "Fighters fill their own in",
      body:
        "Every fighter on the card gets a link to a form of their own. Their record, their " +
        "photograph and their story are what they sent, not what somebody typed for them.",
    },
    {
      label: "Every bout gets a video",
      body:
        "A vertical tale-of-the-tape for each bout, built from the two fighters' own " +
        "photographs. It plays in the programme and the fighter posts it to their following.",
    },
    {
      label: "Sponsors get a slot and a count",
      body:
        "Every bout carries a sponsor placement of its own, and every placement comes with " +
        "a count of what was opened and tapped, taken from the programme itself.",
    },
  ],
  /** The way in for a promoter, and the reason there is no form beside it. */
  signIn: "Promoter sign in",
  /**
   * There is no self-serve signup and there is not going to be one for now, so
   * this says who makes an account rather than pointing at a form that does not
   * exist. It names no address, because inventing one would be worse than
   * sending somebody back to the person who showed them this.
   */
  howToGetAnAccount:
    "There is no sign-up form. Accounts are set up by hand — ask whoever showed you " +
    "EventIQ and they will make you one.",
} as const;

/** The pitch page's hero line, which counts the card it is running on. */
export function tapeForEveryBout(bouts: number): string {
  return bouts > 0
    ? `a tale of the tape for all ${bouts} bouts`
    : "a tale of the tape for every bout on it";
}

/**
 * The countdown on the promoter's own screens, as a figure and what it is a
 * figure of.
 *
 * `daysUntilShow` measures against the real clock and therefore goes negative
 * the morning after, which is ordinary: a promoter's last show stays on their
 * list, the dashboard's own "Last show" panel is built on it, and the showcase
 * is whatever was named rather than whatever is next. Three screens printed that
 * number straight, so a card that has run read "-27" over "DAYS TO GO".
 *
 * The composition that counts down inside the show video already refuses to do
 * this — `daysToGoLabel` in lib/promo.ts, which HANDOVER calls the zero-bout rule
 * applied to a countdown — and the app's own screens had been left out of it.
 * This is that rule in the shape a panel wants: a figure and a label, never a
 * minus sign, and never a nought counting something that has arrived.
 */
export function countdown(days: number): { value: string; label: string } {
  if (days > 1) return { value: String(days), label: "Days to go" };
  if (days === 1) return { value: "1", label: "Day to go" };
  if (days === 0) return { value: "Today", label: "Show day" };
  const since = -days;
  return { value: String(since), label: since === 1 ? "Day ago" : "Days ago" };
}

/**
 * The pitch page's promoter heading, which counts the showcase card.
 *
 * The same problem as `countdown` in a sentence: "-3 days out, you know exactly
 * who has not sent theirs" is the front page of the product saying something
 * that is not a number of days. Past the show it makes the argument without a
 * figure, which is the same move `tapeForEveryBout` makes on an empty card.
 */
export function chaseHeading(days: number): string {
  if (days > 1) return `${days} days out, you know exactly who has not sent theirs`;
  if (days === 1) return "The day before, you know exactly who has not sent theirs";
  if (days === 0) return "On the day, you know exactly who has not sent theirs";
  return "Every day up to first bell, you know exactly who has not sent theirs";
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
export const EMPTY_CARD_EDITOR = "Nothing on the running order yet. The first bout goes in below.";

/**
 * The two sentences over the add-bout form, which differ by whether the card has
 * anything on it: a promoter with an empty card is being told what a bout brings
 * with it, and a promoter with fourteen already knows.
 *
 * Both were typed into the page. The one over an empty card said "both fighters
 * get an invite link", where everywhere else in the product says corners — a bout
 * has two of those and the difference matters on a card where the same person is
 * matched twice.
 */
export const ADD_BOUT = {
  firstHeading: "Add the first bout",
  heading: "Add a bout",
  first:
    "Two names is enough to start with. Both corners get an invite link straight away, and " +
    "everything else on this bout can be filled in later.",
  another:
    "Goes on top of the running order, so entering a card from the openers up matches the " +
    "sheet. Both corners get an invite link straight away.",
} as const;

/* -------------------------------------------------------------------------
 * A promoter's first five minutes
 *
 * Accounts are made by an operator, so the first thing anybody sees on their own
 * account is an empty one — and the product cannot explain itself by being
 * explored, because there is nothing there to explore. What it can do is say the
 * one thing to do next and put the control for it on the same screen.
 *
 * The three steps after that are in the order they have to happen in and in no
 * other: the bouts, because both corners get their link the moment a bout goes
 * on; the links, because nothing a fighter sends exists until one is sent; then
 * publishing, because until then nobody outside the account can read any of it.
 * A promoter who publishes first gets a programme with nothing on it, which is
 * the state bugs 22 and 28 are both about.
 *
 * None of these say how long anything takes and none of them count a card that
 * has nothing on it — the same two rules as every string above.
 * ---------------------------------------------------------------------- */

export const FIRST_SHOW = {
  heading: "Your first show",
  /**
   * The one sentence. It names the form underneath it rather than the running
   * order, which is the step after: the line it replaces told a promoter with no
   * show at all to put a running order into a form asking for a venue and a date.
   */
  lead:
    "Nothing on this account yet. Give your first show a name and a date below, and the " +
    "running order goes in after that.",
} as const;

/** The strip on the dashboard, which ticks itself off and then goes. */
export const GETTING_STARTED = {
  heading: "Getting started",
  /** Why it will not be there next month. */
  note: "This goes once the show is published.",
  steps: {
    bouts: {
      label: "Add the running order",
      body: "Both corners of every bout get an invite link the moment the bout goes on.",
      action: "Add the bouts",
    },
    invites: {
      label: "Send the links",
      body:
        "Each fighter fills their own details in from their phone. The chase list records " +
        "which links went out, so it can tell a fighter who never looked from one who did.",
      action: "Send the first link",
    },
    publish: {
      label: "Publish the show",
      body:
        "Publishing puts the programme behind the code on the table. Until then it is yours " +
        "to read and nobody else's.",
      action: "Publish this show",
    },
  },
} as const;

/**
 * The chase list before anything has been sent.
 *
 * Not an empty list — every fighter on the card is on it — but it is the state
 * where none of the states mean anything yet, so it says what sending does
 * rather than leaving a column of "not sent" to be read as a fault. It names no
 * fighter and counts nobody.
 */
export const NOTHING_SENT =
  "No links have gone out yet. Send one and this list starts telling you who has opened " +
  "theirs and who has not.";

/**
 * What the card editor says once a bout has gone on.
 *
 * The form clears itself on a success so the next line off the matchmaking sheet
 * can be typed straight in, and a form that empties and says nothing reads
 * exactly like one that refused silently. It names the two corners because on a
 * card being entered in one sitting that is the only way to tell this
 * confirmation from the last one, and it says what the bout brought with it,
 * which is the thing a promoter has no other way of knowing happened.
 */
export function BOUT_ADDED(corners: string): string {
  return `${corners} is on the card. Both corners have an invite link.`;
}

/** The card editor's sponsor book with nothing in it. */
export const EMPTY_SPONSORS =
  "No sponsors on this account yet. Add one below and it becomes selectable against any " +
  "bout on the card, and sits on the strip at the foot of the programme if you say so.";

/** How much of the sponsor inventory is left to sell, said in the singular where it is one. */
export function slotsAvailableNote(unsold: number): string {
  if (unsold <= 0) return "Every slot on the card is sold";
  return `${unsold} ${unsold === 1 ? "slot" : "slots"} still available`;
}

/* -------------------------------------------------------------------------
 * Pasting the running order in
 *
 * The card is already written down before anybody opens this: a message, a
 * column in a spreadsheet, the caption under a poster. Retyping it a bout at a
 * time is the dullest thing the editor asks for, and it is the step a promoter
 * gives up in the middle of.
 *
 * Every line here is written to the same two rules as the rest. Nothing states
 * what was not read — a weight the sheet did not carry is named as something
 * nobody said rather than shown as a fact — and nothing treats a line that would
 * not parse as the promoter having done something wrong. A sheet is somebody
 * else's handwriting; that it did not fit is this reader's business, not theirs.
 * ---------------------------------------------------------------------- */

export const SHEET_IMPORT = {
  heading: "Paste the running order",
  body:
    "Paste the sheet as it is written — one bout a line, names, gyms and grading in " +
    "whatever order they come. Nothing is written until the preview is confirmed, and " +
    "every field on it can be corrected first.",
  placeholder:
    "Neil McLay (Urban Guerrillas) v Declan Lowe (Crowning Glory) - MMA 80kg 3x3",
  read: "Read the sheet",
  reading: "Reading…",
  again: "Paste a different sheet",

  /**
   * Which end of the sheet the main event is on. Sheets are written both ways
   * round and nothing in the text says which reliably, so it is asked rather
   * than guessed: getting it wrong turns the card upside down and puts the
   * opener in the video the promoter shows a sponsor.
   */
  orderLabel: "Which way round is the sheet?",
  orderFirst: "First line is bout one",
  orderMain: "First line is the main event",

  /** Above the rows. Says what pressing the button will do before it is pressed. */
  previewHeading: "What the sheet says",
  previewNote:
    "Correct anything here before it goes on. Both corners of every bout get an invite " +
    "link the moment it does.",

  /** Nothing readable in the box, said without counting the nothing. */
  empty: "Nothing to add yet. Paste the sheet above and the bouts appear here.",

  /** The lines that would not read. Named as lines, never as mistakes. */
  problemsHeading: "Lines that were not read",
  problemsNote:
    "These are still in the box above. Change them and read the sheet again, or put them " +
    "on with the form below.",
  problemReason: {
    noCorners: "No two corners on this line.",
    emptyCorner: "Only one corner on this line.",
  },

  /** What the sheet did not carry, beside the defaults standing in for it. */
  assumedLabel: "Not on the sheet",
  assumedField: {
    discipline: "discipline",
    weight: "weight",
    rounds: "rounds",
  },
  assumedNote: "Standing in until somebody says otherwise. Change them here if they are wrong.",

  /** The posters. Honest about whose photograph it is and who is asked about it. */
  postersHeading: "Or add the posters",
  postersBody:
    "Drop the bout posters in and mark each fighter on them. The crop goes on the card as " +
    "their photograph, supplied by you on their behalf — they are asked to agree to it, and " +
    "can replace it or take it down, from the link this show sends them.",
  postersAssign: "Which bout is this poster?",
  postersCrop: "Drag a box round each fighter",
  postersRed: "Red corner",
  postersBlue: "Blue corner",
  postersNone: "No poster on this bout",
  postersPending: "Sending the photographs…",
} as const;

/** "Add these 6 bouts", in the singular where it is one and silent where it is none. */
export function addTheseBouts(bouts: number): string {
  if (bouts <= 0) return SHEET_IMPORT.empty;
  return bouts === 1 ? "Add this bout" : `Add these ${bouts} bouts`;
}

/**
 * What the editor says once a pasted sheet has gone on.
 *
 * It says what the bouts brought with them for the same reason `BOUT_ADDED`
 * does: the links are the thing a promoter has no other way of knowing happened,
 * and on an import they happened thirty times.
 */
export function SHEET_ADDED(bouts: number): string {
  if (bouts <= 0) return SHEET_IMPORT.empty;
  const what = bouts === 1 ? "One bout is" : `${bouts} bouts are`;
  return `${what} on the card. Both corners of each have an invite link.`;
}

/** How many photographs came off the posters, said only where some did. */
export function POSTER_PHOTOS_ADDED(photos: number): string | null {
  if (photos <= 0) return null;
  return photos === 1
    ? "One photograph came off a poster and is on the card."
    : `${photos} photographs came off the posters and are on the card.`;
}

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
 * The same importer on the fighter's own form.
 *
 * Two boxes, one feature, and the words were typed out again in
 * components/Questionnaire.tsx rather than being here where the tone tests can
 * reach them — which is how it came to say "we'll pull your record across". The
 * product does not speak as "we" to a fighter anywhere else on that page, and
 * the one sentence that did was the one nobody could test.
 *
 * It is its own block rather than a reuse of RECORD_IMPORT because the reader is
 * different: the promoter is filling somebody else in and is told what is still
 * empty, and the fighter is filling themselves in and is told their typing wins.
 * What the two genuinely share is shared, so a working link can only ever be
 * described one way.
 */
export const FIGHTER_IMPORT = {
  label: "Fought before?",
  blurb:
    "Paste your Sherdog page and your record comes across, so there is nothing to type. " +
    "Anything you have already answered stays as you left it.",
  placeholder: RECORD_IMPORT.placeholder,
  look: RECORD_IMPORT.look,
  looking: RECORD_IMPORT.looking,
  /** The refusal, plus the way on: this box is a convenience and never a gate. */
  notAProfile: `${RECORD_IMPORT.notAProfile} No record online? The boxes below take whatever you type.`,
  /** Set apart in the sentence below, because it is the instruction in it. */
  check: "Check it before you submit",
  caution:
    "records on these pages go out of date, and yours is the version that goes in front of " +
    "the room.",
  /** Only where the page gave a professional record to an amateur card. */
  professional: ", and that is the professional record rather than the amateur one",
  stillYours: "Still yours to answer",
  /** Where the page had a name on it and where it did not. */
  found: (name: string | undefined, source: string) => `Found ${name ?? "a profile"} on ${source}`,
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
 * The fighter's own video
 *
 * The second half of the loop the product is built on. A fighter fills the form
 * in because there is something in it for them; the video is that something, and
 * until now nothing told them it existed. So: a line the promoter can send, a
 * control on the programme that hands the file over, and a count of how often
 * that control was used.
 *
 * Three rules, all of which are easy to break by writing something that reads
 * well. **Nothing here claims a result.** No reach, no views, no "your followers
 * will love it": the product cannot see what happens after the file leaves and a
 * sentence implying otherwise is the fabricated engagement figure of section 7
 * wearing different clothes. **Nothing here is breathless** — it is a message
 * from a promoter to somebody on their card, not marketing. And **no gendered
 * pronouns**, which is the rule the nudge message already lives under (bug 10).
 * ---------------------------------------------------------------------- */

export const VIDEO_SHARE = {
  /** On the programme, beside a bout's video. The verb is what it does. */
  download: "Download for Instagram",
  /** The other way out, for a phone that would rather hand it to an app. */
  share: "Share",
  /** What the promo is called everywhere a spectator meets it. */
  promo: "The promo",
  promoNote:
    "A shorter cut of the same bout, made for posting. The fighters are welcome to it.",
  /** The dashboard control that hands a fighter their own bout's promo. */
  send: "Send their video",
  sendHint: "Opens WhatsApp with the video and the programme link in the message",
  /** Under the videos panel, once there is something to send. */
  note:
    "Where a promo is made, both fighters on the bout can be sent it. The message carries " +
    "the file and the link to the programme, and the row records that it went out.",
} as const;

/** What the dashboard says about how often a bout's video has been taken away. */
export function shareCountLabel(shares: number): string {
  if (shares <= 0) return "Not shared yet";
  return `Shared ${shares} ${shares === 1 ? "time" : "times"}`;
}

/**
 * Whole days between two instants, in the words a promoter would use out loud.
 *
 * Measured from the difference rather than from calendar days on purpose: "two
 * days ago" about something that happened thirty hours back is the answer a
 * promoter deciding whether to ring somebody actually wants.
 *
 * Here rather than beside either of the rows that use it, because both of them
 * are on the same dashboard and they had a phrasing each: the chase row said
 * "Sent yesterday" and the video row said "Sent 1 day ago" about the same
 * elapsed time, a few lines apart. `now` is an argument for the reason every
 * other derivation here takes one — a sentence that reads the clock is a
 * sentence no test can pin.
 */
export function howLongAgo(then: number, now: number): string {
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** When a fighter was last sent their video, or nothing where they have not been. */
export function videoSentNote(
  sentAt: number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!sentAt) return null;
  return `Sent ${howLongAgo(sentAt, now)}`;
}

/**
 * The message a promoter sends a fighter when their bout's promo is ready.
 *
 * Both links, because they answer different questions: the file is the thing to
 * post and the programme is where it came from, and a fighter handed only the
 * file has nothing to point anybody at. The order is deliberate — the file
 * first, because that is what the message is about.
 *
 * It says what the video is and stops. It does not say how long it is, how many
 * people will see it, or what posting it will do for anybody, because none of
 * those is a thing this product knows.
 */
export function videoReadyMessage(input: {
  firstName: string;
  eventName: string;
  boutLabel: string;
  videoUrl: string;
  programmeUrl: string;
}): string {
  return [
    `Hi ${input.firstName} — the video for ${input.boutLabel.toLowerCase()} at ${input.eventName} is ready.`,
    `Here it is, yours to post wherever you like: ${input.videoUrl}`,
    `The full programme, with your profile on it: ${input.programmeUrl}`,
  ].join("\n\n");
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
  /**
   * Asking for a video again. It says the video the programme is playing is
   * untouched, because that is the thing a promoter would otherwise assume this
   * had taken away — nothing here makes a video, it queues one, and a failed
   * queue leaves the card exactly as it was.
   */
  renderNotQueued:
    "That video was not queued. Whatever is on the programme is still there — try again in a moment.",

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
  /**
   * Somebody of that name is already on this promoter's cards and nobody has
   * said whether it is the same person. Two people with one name is ordinary in
   * this sport, and merging them puts one fighter's record and photograph beside
   * the other's name on a published card — so the bout waits rather than the
   * software choosing.
   */
  cornerNeedsAnAnswer:
    "Somebody of that name has been on one of your cards. Say whether it is the same fighter " +
    "before this bout goes on.",
  /** The name box moved after the panel was drawn, so the answer no longer fits it. */
  matchOutOfDate:
    "That name has changed since the fighters were looked up. Check the names and answer again.",
  cornerAlreadyOnCard: "That fighter is already on this card.",
  /**
   * The pasted sheet, which asks the same questions `addBout` does and a few of
   * its own. All of them point back at the preview, where every field is still
   * editable and nothing has been written.
   */
  sheetNothingToAdd:
    "There is nothing on the sheet to put on. Paste the running order and it will read it.",
  sheetTooLong:
    "That is more bouts than one paste takes. Put part of the sheet on, then paste the rest.",
  sheetCornerNeedsAnAnswer:
    "Somebody on this sheet has a name that is already on one of your cards. Answer the " +
    "question beside that corner before the sheet goes on.",
  sheetCornerTwice:
    "One fighter is confirmed on two bouts of this sheet. Check the corners and read it again.",
  /** A photograph the promoter cropped off a poster, on a fighter now on the card. */
  posterNotStored:
    "That poster would not upload. The bouts are on the card — the photographs can be added " +
    "to each fighter later, or left to the fighter to send.",
  posterNotAPhotograph: "That poster is not a JPEG, PNG or WebP image.",
  posterTooLarge: "That poster is too large to send. A photograph off a phone is about right.",
  /**
   * A fighter who has agreed to what goes on the programme and sent a picture of
   * their own has spoken for themselves, and a crop off a poster does not go
   * over the top of that. Section 6g: what a fighter sent is theirs to change.
   */
  posterWouldReplace:
    "That fighter has sent a photograph of their own, so it stays on the card. Their link is " +
    "where a different one comes from.",
  bothCornersOneFighter: "A bout needs two different fighters.",
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
    `This form is for fighters aged ${MINIMUM_AGE} and over. For anyone younger, a parent or ` +
    "guardian can arrange the entry with the promoter directly.",
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
  /**
   * Nothing on the card has a video yet, which is every card on its first
   * afternoon. The panel already says so a bout at a time; this says it once, at
   * the top, so a promoter reading down a column of "not made yet" knows it is
   * the ordinary state of a new card rather than a queue that has stalled.
   */
  empty:
    "None of these have been made yet. Each one is drawn from the two fighters' own " +
    "photographs, so they come as the profiles come in.",
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
  /**
   * Not one of the six states above, because a bout that is off never reaches
   * the queue at all: `boutFingerprints` leaves it out, so nothing asks for it
   * and nothing reports on it. It is listed here because it keeps its place on
   * the running order, and "Not made yet" would read as a video somebody has
   * still to get round to rather than one nobody is waiting for.
   */
  withdrawn: {
    label: WITHDRAWN.label,
    note: "Nothing new is made for a bout that is off. Put the bout back on and it goes into the queue with the rest.",
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
 * The sign-in form.
 *
 * Read by somebody using the product for the first time, holding two things an
 * operator sent them and no idea which of the two goes in the first box — the
 * label said "Promoter" and the box was prompted with another promoter's real
 * slug, on a page anybody can open.
 *
 * The last line is the only route back for a promoter who cannot get in. There
 * is no "forgotten your password?" to link to, because a reset link is minted by
 * hand (see the note above ACCOUNT_COPY), so it says who does it rather than
 * pointing at a form that does not exist.
 */
export const LOGIN_COPY = {
  heading: "Promoter sign in",
  /**
   * What is behind the form, named as the three things a promoter came for. It
   * was typed into the page rather than kept here, which is how the one line on
   * the sign-in screen ended up being the only sentence in the product nothing
   * held to the tone rules.
   */
  lead: "Your card, your chase list and your sponsor sheet.",
  slugLabel: "Promoter",
  slugHint: "The short name you were given when your account was set up.",
  slugPlaceholder: "your-promotion",
  passwordLabel: "Password",
  submit: "Sign in",
  pending: "Checking…",
  lockedOut:
    "Passwords cannot be reset from this page. Whoever set the account up can issue a new one.",
} as const;

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
    `This form is for fighters aged ${MINIMUM_AGE} and over. For anyone younger, a parent or ` +
    "guardian should speak to the promoter, who can take the details a different way. Nothing " +
    "on this form is stored while that is the age on it.",
} as const;

/**
 * What `/f/demo` says about itself.
 *
 * It is a working form with a real card beside it and a submit button reading
 * "Put me on the card", so it has to say what it is before a promoter has typed
 * anything into it rather than only after. Said in one place because it is now
 * said in two: at the top of the form and again under the button.
 */
export const PREVIEW_NOTE =
  "This is the form a fighter gets, as a preview. Nothing typed here is saved and nobody " +
  "is put on a card.";

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
  /**
   * What an unfurled link and a search result say. The same sentence as the
   * intro, which is the point of it being here: it was typed out a second time
   * in the page's metadata, where nothing holds it to the notice it describes.
   */
  description:
    "What EventIQ collects from fighters on a digital fight programme, where it is shown, how " +
    "long it is kept and how to have it removed.",
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
  /**
   * The one control on the row that matters, so it is a verb and it names the
   * app it opens. It used to read "WhatsApp" in the same weight as four other
   * controls beside it, which made the row a list of five things a promoter
   * might do instead of one they are here to do.
   */
  whatsapp: "Send on WhatsApp",
  sms: "Send by text",
  /** Everything else, behind one disclosure rather than spread across the row. */
  more: "Other ways, and the link itself",
  copy: "Copy link",
  /**
   * A clipboard write the browser would not allow, which happens over plain
   * http, in a hardened profile and behind some extensions. It used to say
   * "Copied" either way — and copying is the one control here with no
   * consequence of its own to look at, so a promoter pasted nothing into
   * WhatsApp and did not find out until the fighter said they never got a link.
   * Same shape as bug 36, one layer up.
   */
  notCopied: "That would not copy. The link is in the box beside this one.",
  /** The nudge, where there is no box to fall back to — the words are in the tooltip. */
  nudgeNotCopied: "That would not copy. The message is on the button as a tooltip.",
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

/* -------------------------------------------------------------------------
 * A fighter who has been here before
 *
 * Three surfaces, one idea: a fighter's row outlives the show it was made for,
 * so the second card they are put on should ask them to confirm rather than to
 * start again. What makes that safe rather than presumptuous is that nobody is
 * merged without being asked — the panel below is a question put to the
 * promoter, and a bout waits until it has an answer.
 *
 * The register is the ordinary one. Nothing here tells a promoter they were
 * about to make a mistake, and nothing tells a fighter they have filled this in
 * before as though that were a demand for an explanation.
 * ---------------------------------------------------------------------- */

/** The panel in the card editor, above the corner whose name matched. */
export const FIGHTER_MATCH = {
  /** The heading over the candidates. One name, however many people carry it. */
  heading: (name: string) => `${name} is already on your cards`,
  body:
    "Choosing the same fighter keeps the profile, the photograph and the record they have " +
    "already sent, and their link for this show asks them to confirm it. Choosing a different " +
    "person starts a fresh profile under the same name.",
  /** The control beside one candidate. */
  same: "Same fighter",
  different: "A different person",
  /** Where a candidate has no show behind them yet, which the query cannot produce. */
  noShow: "On your cards",
  /** Under a candidate: which of the promoter's own shows, and when. */
  lastShow: (event: string, when: string) => `Last on ${event}, ${when}`,
  /** Where the fighter has not given a record. Never a 0-0-0. */
  noRecord: "No record given",
  /**
   * A namesake on somebody else's promotion, said as little as it can be.
   *
   * The name is the only thing shared, and that is deliberate: the gym, the
   * record and the promotion all belong to a card this promoter cannot see, and
   * a matching panel is not a way to read one. The way to settle it is the way
   * it is settled everywhere else here — ask the fighter, from the link this
   * show sends them.
   */
  elsewhere:
    "A fighter of that name has been on another promotion's card. Nothing of theirs is shown " +
    "here or carried across; add them as a new fighter and their link will ask them to confirm " +
    "their details.",
  /** The line while the lookup is in flight. */
  looking: "Checking that name…",
} as const;

/**
 * The questionnaire, for a fighter who has filled one of these in before.
 *
 * It replaces the heading and the paragraph under it and nothing else: the form
 * is the same form, the consent is asked again because consent is given for a
 * show, and the boxes are already full because the row is theirs. Saying
 * "confirm" rather than "fill this in" is the whole difference, and it is worth
 * saying because the alternative — a form that silently arrives full — reads as
 * a mistake rather than as the thing they did last time still being there.
 */
export const RETURNING_FIGHTER = {
  heading: (name: string, event: string) => `${name}, confirm your details for ${event}`,
  /**
   * `previous` is the show they last sent a form in for, which is the evidence
   * that this is a returning fighter at all — a profile the promoter typed is
   * not one to greet somebody with.
   */
  body: (previous: string) =>
    `What you sent for ${previous} is already in the boxes below, your photograph included. ` +
    "Change anything that has moved on and put it back on the card. It saves as you go.",
  /** Beside the photograph control, where one carried over. */
  photo: "Carried over from your last card. Send a new one to replace it.",
} as const;

/**
 * A fighter's own page, under the card they are on now.
 *
 * Published shows only — a draft on a page anybody can open would be a show
 * announced by accident — and the heading says shows rather than results,
 * because this product records who was on a card and never who won.
 */
export const PREVIOUS_SHOWS = {
  heading: "Previous shows",
  /** Per row, where the bout came off. The fighter still walked out or did not. */
  withdrawn: "Bout withdrawn",
  video: "Watch the tale of the tape",
  /** The canonical profile, under the list. */
  profile: "Their profile",
} as const;

/**
 * The canonical fighter page: one person, across every card they have been on.
 *
 * It says what the page is for rather than describing the fighter, because
 * everything describing them is on the page already and most of it is blank for
 * most of the bill.
 */
export const FIGHTER_PROFILE = {
  /** Where the fighter is on a show that is on now. */
  current: (event: string) => `On the card at ${event}`,
  intro: (shows: number) =>
    shows === 1
      ? "One show on EventIQ so far."
      : `${shows} shows on EventIQ so far.`,
} as const;

/* -------------------------------------------------------------------------
 * The public shows list
 *
 * `/shows` is the one page here that is about every promoter at once, which
 * makes it the easiest place in the product to write something that cannot be
 * checked. It says what is on and where, and nothing whatever about how many
 * people came, how many phones opened a card or how far anything travelled —
 * those are numbers a promoter hands a sponsor off their own dashboard, and a
 * public page repeating them would be EventIQ making a claim about somebody
 * else's show.
 *
 * It is a marketing surface, so it carries the masthead (lib/masthead.ts) and
 * the plain professional register the pitch page uses. No fight idiom: that
 * belongs inside a programme, where the promoter's own product is.
 * ---------------------------------------------------------------------- */

export const SHOWS = {
  heading: "Every show on EventIQ",
  /**
   * What the page is, without telling the reader what to feel about it. It
   * deliberately does not promise the list is complete or growing: it is every
   * published show on this instance, which is a fact, and nothing more.
   */
  lead:
    "Every card a promoter has published here, with its running order behind it. " +
    "Open one and you get the whole bill, every fighter, and a tale of the tape " +
    "for the bouts that have one.",
  /** The two halves of the list. */
  upcoming: "Still to come",
  past: "Already run",
  /** The filter bar. */
  cities: "Where",
  everyCity: "Everywhere",
  everyWhen: "All shows",
  /** Per row. */
  open: "Open the programme",
  /** Paging, which only the past half does. */
  older: "Older shows",
  newer: "Back to the most recent",
  /**
   * Nothing published at all. Written for whoever is standing the instance up,
   * the same reader NO_SHOWCASE is written for, because on a live instance this
   * is a state that lasts until the first promoter presses publish.
   */
  empty: {
    heading: "No published shows yet",
    body:
      "A card appears here the moment its promoter publishes it. Until then there is " +
      "nothing on this page to open.",
  },
  /** A filter that matches nothing. Never a count, and never the reader's fault. */
  nothingHere: "Nothing published matches that filter.",
  /** One half empty while the other is not. */
  noneUpcoming: "Nothing in the diary here at the moment.",
  nonePast: "Nothing here has run yet.",
} as const;

/**
 * How many bouts a listed show has, or nothing at all.
 *
 * `boutCountLabel` answers "No bouts yet", which is the right thing on the
 * promoter's own card and the wrong thing on a public list of other people's:
 * a published card with an empty running order is a promoter mid-afternoon, and
 * announcing it to strangers as the thing that is missing is the shaming rule
 * in different clothes. So the count comes off the row entirely and the show is
 * listed on its name, date and venue, which is a paper programme's worth
 * already.
 */
export function listedBoutCount(bouts: number): string | null {
  return bouts > 0 ? boutCountLabel(bouts) : null;
}

/** The page's own title and description, and the same per city. */
export const SHOWS_META = {
  title: "Fight shows on EventIQ",
  description:
    "Every fight show published on EventIQ, with the full running order behind each one.",
  cityTitle: (city: string) => `Fight shows in ${city} — EventIQ`,
  cityDescription: (city: string) =>
    `Fight shows published on EventIQ in ${city}, with the full running order behind each one.`,
} as const;

/** The pitch page's way through to the list, and the programme footer's. */
export const SHOWS_LINK = "See every show on EventIQ";

/**
 * The gallery of screenshots on the pitch page.
 *
 * Three of the five tiles are addresses on the showcase card, and they used to
 * be written out against the demo's own slug — so on any instance the demo is
 * not named on, "tap any of them to open the real page" was three links to a
 * 404. The slug comes off the card now, and where there is no card the sentence
 * stops inviting a tap: the same rule as every other count-bearing line here.
 */
export const GALLERY = {
  label: "Every screen in it",
  heading: "What it looks like",
  linked: "Screenshots of the working demo, not mockups. Tap any of them to open the real page.",
  /** No show on display, so there is nothing behind them to open. */
  unlinked: "Screenshots of the working demo, not mockups.",
} as const;

/* -------------------------------------------------------------------------
 * The sponsor report
 *
 * The one page here written to be read by somebody who is not a promoter or a
 * fighter: it goes to a sponsor, who paid for a placement and wants to know what
 * it did. So it is the plainest copy in the product. Every figure is a count or
 * a nought, set as a figure; the sentences around them never state a nought,
 * because "0 taps" in a sentence reads as a verdict where the figure beside it
 * already says it. And it claims nothing about what happened after a tap left
 * the page, because nothing here can see that.
 * ---------------------------------------------------------------------- */

export const SPONSOR_REPORT = {
  title: "Sponsor report",
  /** The promoter's index of reports, above the list of sponsors. */
  indexHeading: "Sponsor reports",
  indexNote:
    "One page for each sponsor on this card, with what was counted for each of their " +
    "placements. Open one and save it as a PDF to send it on.",
  /** No sponsor on the card and none ever tapped at this show. */
  indexEmpty:
    "No sponsor is on this card yet. Add one in the card editor and their report appears here.",
  open: "Open report",
  print: "Save as PDF or print",
  back: "Back to the promoter view",
  /** What each kind of placement is called on the page. */
  placement: {
    show: "Show sponsor",
    bout: "Bout sponsor",
    fighter: "Fighter sponsor",
  },
  /** Where each placement is, said once under its name. */
  where: {
    show: "On the sponsor strip at the foot of the programme, as a link.",
    bout:
      "At the top of the bout on the running order and of its tale of the tape. The mark " +
      "is not a link there, so this placement is measured by how often the bout was opened.",
    fighter: "Under the fighter's name on their bout and on their own page, as a link.",
  },
  figures: {
    taps: "Taps through",
    opened: "Bout opened",
    played: "Video played",
    profileViews: "Profile opened",
    opens: "Programme opens",
    visits: "Separate visits",
  },
  withdrawn: "This bout came off the card. Its place on the running order, and this placement, stayed.",
  programmeHeading: "The programme as a whole",
  programmeNote:
    "Every placement above sits on the same programme. These are its totals for the show.",
  unpublished:
    "This show has not been published, so nobody has been able to open the programme yet.",
  /** The method, set at the foot of every report. */
  method: [
    "Every figure here was counted from the programme itself, or is shown as a nought. None of them are estimated.",
    "A tap is counted when somebody taps the sponsor's mark. What happens on the sponsor's own site afterwards is not something the programme can see, and nothing here claims it.",
    "A visit is one phone's session on the programme. One left open past midnight is counted on each day it was open.",
  ],
  credit: "Counted by EventIQ",
} as const;

/** The first line of a report, saying what the sponsor's mark was tapped. */
export function reportSummary(sponsor: string, event: string, taps: number): string {
  if (taps <= 0) return `${sponsor} was on the programme for ${event}. No taps through were counted.`;
  return `${sponsor} was on the programme for ${event} and was tapped through ${
    taps === 1 ? "once" : `${taps.toLocaleString("en-GB")} times`
  }.`;
}

/** Beside each sponsor on the index. */
export function reportTapLabel(taps: number): string {
  if (taps <= 0) return "No taps counted";
  return `${taps.toLocaleString("en-GB")} ${taps === 1 ? "tap" : "taps"}`;
}

/**
 * Taps on a placement the card no longer has. Null where there are none, which
 * is nearly always, so the page does not mention a thing that did not happen.
 */
export function unplacedTapsNote(taps: number): string | null {
  if (taps <= 0) return null;
  return `${taps === 1 ? "One tap" : `${taps.toLocaleString("en-GB")} taps`} came from a placement that is no longer on the card. ${
    taps === 1 ? "It is" : "They are"
  } in the total above.`;
}

/** When the figures were read, because a report opened mid-show is a snapshot. */
export function reportAsOf(when: string): string {
  return `Figures as of ${when}`;
}
