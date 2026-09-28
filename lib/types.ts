/**
 * Shapes are deliberately loose about what a fighter has told us. On a real
 * amateur card most of these fields are missing for most of the bill, so almost
 * everything past a name and a gym is optional and every surface has to cope.
 */

export type Discipline = "MMA" | "MUAY_THAI" | "BOXING" | "K1" | "GRAPPLING";

export type Stance = "Orthodox" | "Southpaw" | "Switch";

export type Sponsor = {
  id: string;
  name: string;
  /** Second line of the lockup, e.g. "Equipment Hire". */
  qualifier?: string;
  mark?: string;
  url?: string;
};

export type Record = {
  w: number;
  l: number;
  d: number;
};

export type Fighter = {
  id: string;
  name: string;
  nickname?: string;
  gym: string;
  hometown?: string;
  age?: number;
  heightCm?: number;
  reachCm?: number;
  stance?: Stance;
  photo?: string;
  cutout?: string;
  /** Poster art made from the photograph, opted into and approved by the fighter. */
  stylised?: string;
  instagram?: string;
  record?: Record;
  /** Wins by method. Never more than record.w between them. */
  finishes?: { ko: number; sub: number };
  walkoutSong?: { title: string; artist: string };
  /** Their own words, from the questionnaire. */
  bio?: string;
  styleTags?: string[];
  sponsorIds?: string[];
};

export type Billing = "MAIN" | "CO_MAIN";

export type Bout = {
  number: number;
  discipline: Discipline;
  weightKg: number;
  /** Grading as promoters write it: "C CLASS", "SEMI PRO", "NOVICE". */
  classLabel?: string;
  titleLabel?: string;
  womens?: boolean;
  rounds: number;
  roundMinutes: number;
  billing?: Billing;
  redId: string;
  blueId: string;
  /** Individual bouts are sold to sponsors on paper cards, so they are here too. */
  sponsorId?: string;
  /**
   * The bout is off. It keeps its number and its sponsor on the programme and is
   * shown struck through, because the number is on a poster and in the analytics
   * rows and because that is what a paper programme does with a withdrawal.
   */
  cancelled?: boolean;
  /** Why, where the promoter said. Never a fault, and never anybody's name. */
  cancelledNote?: string;
};

export type FightEvent = {
  slug: string;
  name: string;
  tagline?: string;
  date: string;
  doorsTime: string;
  firstBellTime: string;
  venue: string;
  city: string;
  sanctioning?: string;
  promoter: { name: string; mark?: string; instagram?: string };
  backdrop?: string;
  showSponsorIds: string[];
  bouts: Bout[];
};

export type Corner = "red" | "blue";

/**
 * A fighter's way in. There is no account and no password: the token in the URL
 * is the credential, because a fighter will not create a login to fill in a
 * programme entry and pretending otherwise just means an empty card.
 *
 * The three timestamps are the promoter's chase signal. Never sent is the
 * promoter's own job. Sent and not opened is a wrong number or an ignored
 * message. Opened and not submitted is the warmest lead on the list, and it is
 * only worth anything because it is recorded when it happens rather than
 * inferred from how full the profile looks. Unix milliseconds.
 */
export type Invite = {
  fighterId: string;
  /**
   * Optional because it is no longer stored: it is decrypted from the row for
   * the one surface that needs it, and a secret that has been rotated leaves the
   * rest of the dashboard perfectly readable without it.
   */
  token?: string;
  sentAt?: number;
  /** How the promoter said it went out, where they used one of the send controls. */
  sentChannel?: SentChannel;
  /**
   * When the promoter handed this fighter their bout's promo. A separate errand
   * from the invite and recorded separately: the invite asks for something, this
   * gives something back, and a render finishing is not either of them.
   */
  videoSentAt?: number;
  lastOpenedAt?: number;
  submittedAt?: number;
  /** When the link stops opening anything. Absent on a row from before expiry. */
  expiresAt?: number;
  revokedAt?: number;
};

/**
 * How a promoter said a link went out. Recorded from the control they used
 * rather than inferred, for the same reason `sentAt` is: the chase list is only
 * worth reading where every state on it was observed.
 */
export type SentChannel = "whatsapp" | "sms" | "copied";

export type InviteStatus =
  /** No way of reaching them yet, so nothing has gone out. */
  | "not-sent"
  /** Link sent, never opened. */
  | "sent"
  /** Opened it and walked away. */
  | "opened"
  /** Finished. */
  | "submitted";

/**
 * Everything `/api/track` will write a row for.
 *
 * A list rather than a bare union, because the endpoint has to check a kind at
 * runtime and was doing it against a second list of the same six strings.
 * `satisfies` caught a typo there and could not catch an omission: a seventh
 * kind added to the union alone would have left the endpoint dropping it, with
 * no compile error and no failing test — a count that is never written and
 * nothing anywhere saying so. The union is derived from this, so there is one
 * place to add one.
 */
export const ANALYTICS_KINDS = [
  "programme_open",
  "bout_expand",
  "tape_play",
  /**
   * A video taken off the page to be posted somewhere else — the download, or
   * the share control beside it. It counts the tap rather than the post: nothing
   * here can see what happens after the file leaves, and a number that claimed
   * to would be the kind of figure section 9 exists to keep out.
   */
  "video_share",
  "sponsor_tap",
  "profile_view",
] as const;

export type AnalyticsKind = (typeof ANALYTICS_KINDS)[number];
