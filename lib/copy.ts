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
