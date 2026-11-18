import type { Card } from "@/lib/card";
import { SITE_URL } from "@/lib/site";
import {
  boutBillingLabel,
  boutClassLine,
  formatEventDateShort,
  formatRecord,
  fullName,
  isDebut,
  lastName,
  leadName,
  stated,
} from "@/lib/tape";
import type { Bout, Corner, Fighter, Sponsor } from "@/lib/types";

/**
 * Everything a "confirmed" announcement says about one fighter, decided once.
 *
 * There are three looks for this clip and they must not each have their own
 * idea of whether somebody is a debutant or what the programme's address is. The
 * compositions are layout and motion; every fact on them comes from here, where
 * it can be tested without a browser.
 */
export type Announcement = {
  fighter: Fighter;
  corner: Corner;
  /** The small line above the surname, or nothing for a one-word name. */
  lead?: string;
  surname: string;
  name: string;
  nickname?: string;
  gym?: string;
  hometown?: string;
  /**
   * "6-1", "Debut", or nothing. Nothing is a fighter who has not said, and is
   * never shown as a debut or as a row of noughts.
   */
  record?: string;
  debut: boolean;
  /** "Main Event" or "Co Main" where the bout has a billing, else undefined. */
  billing?: string;
  /** "Bout 5". Always present, because every bout has a number. */
  boutLabel: string;
  classLine: string;
  opponent: string;
  show: string;
  promoter: string;
  date: string;
  venue: string;
  /** What the code encodes. SITE_URL, never the origin that rendered it. */
  programmeUrl: string;
  /** The same address without the scheme, for setting in type. */
  programmeLabel: string;
  sponsor?: Sponsor;
};

export function announcementOf(card: Card, bout: Bout, corner: Corner): Announcement {
  const { event } = card;
  const fighter = card.fighters[corner === "red" ? bout.redId : bout.blueId];
  const opponent = card.fighters[corner === "red" ? bout.blueId : bout.redId];
  const programmeUrl = `${SITE_URL}/e/${event.slug}`;
  const venue = [stated(event.venue), stated(event.city)]
    .filter((part, i, parts) => part && parts.indexOf(part) === i)
    .join(", ");

  return {
    fighter,
    corner,
    lead: leadName(fighter),
    surname: lastName(fighter),
    name: fullName(fighter),
    nickname: stated(fighter.nickname),
    gym: stated(fighter.gym),
    hometown: stated(fighter.hometown),
    record: formatRecord(fighter),
    debut: isDebut(fighter),
    billing: bout.billing ? boutBillingLabel(bout) : undefined,
    boutLabel: `Bout ${bout.number}`,
    classLine: boutClassLine(bout),
    opponent: opponent ? fullName(opponent) : "",
    show: event.name,
    promoter: event.promoter.name,
    date: formatEventDateShort(event.date),
    venue,
    programmeUrl,
    programmeLabel: programmeUrl.replace(/^https?:\/\//, ""),
    sponsor: bout.sponsorId ? card.sponsors[bout.sponsorId] : undefined,
  };
}

/**
 * The fixed words on the clip. In one place so the tone rules can be held to
 * them: no gendered pronoun, nothing a fighter could read as a fault, nothing
 * claimed that nobody has counted.
 */
export const CONFIRMED_COPY = {
  stamp: "Confirmed",
  onTheCard: "On the card",
  debut: "Debut",
  debutLine: "Making their debut",
  /** Sits above the word "Debut", so the pair reads "Making their / Debut". */
  debutLead: "Making their",
  record: "Record",
  scan: "Scan for the full programme",
  programme: "The programme",
  sponsoredBy: "Bout sponsored by",
} as const;

/**
 * Font size for a surname that has to sit on one line across the frame.
 *
 * The display face is condensed at roughly 0.46em per capital, so the size is
 * whatever fits `width` and never more than `max`. Rounded down so the same name is
 * the same size on every frame.
 */
export function fitSize(text: string, width: number, max: number, perChar = 0.46): number {
  const length = Math.max(text.length, 1);
  return Math.floor(Math.min(max, width / (length * perChar)));
}
