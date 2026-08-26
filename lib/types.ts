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
