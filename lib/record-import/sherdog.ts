import type { ImportedTape } from "@/lib/fighter-import";

/**
 * Reads a Sherdog fighter page.
 *
 * WHY REGULAR EXPRESSIONS AND NOT A PARSER
 *
 * Workers have HTMLRewriter, which is the right tool for streaming a large
 * document, but it only exists inside the Cloudflare runtime, so a parser
 * written against it cannot be unit tested in plain vitest. Given that this file
 * is the one piece of the system most likely to break silently when somebody
 * else changes their template, being testable matters more than being elegant.
 * A DOM library would cost hundreds of kilobytes in the Worker bundle to read
 * six fields. So: narrow expressions over a page whose shape is pinned by a
 * fixture captured from the live site.
 *
 * WHY THE AMATEUR TABLE IS PREFERRED
 *
 * Sherdog keeps amateur bouts in a table of their own, separate from the
 * professional record shown in the headline panel. Everyone on a card like this
 * is an amateur, so the headline number is the wrong one for almost every
 * fighter who has both. When only the professional record exists it is returned,
 * but labelled, because a fighter needs to know which of their two records we
 * are about to print.
 */

const AMATEUR_HEADING = "FIGHT HISTORY - AMATEUR";

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function first(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  return match?.[1] ? decode(match[1]) : undefined;
}

function firstNumber(html: string, pattern: RegExp): number | undefined {
  const value = first(html, pattern);
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Age from the date of birth rather than the age Sherdog prints, so a cached
 * page cannot make somebody a year younger than they are.
 */
function ageFrom(birthDate: string | undefined, now: Date): number | undefined {
  if (!birthDate) return undefined;
  const born = new Date(`${birthDate} UTC`);
  if (Number.isNaN(born.getTime())) return undefined;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 10 && age <= 80 ? age : undefined;
}

type Tally = { w: number; l: number; d: number; ko: number; sub: number };

/** A win counts as a finish only when the method says how it ended early. */
function methodOf(row: string): "ko" | "sub" | "other" {
  const method = first(row, /class="winby"[^>]*>\s*<b>([^<]*)<\/b>/i)?.toLowerCase() ?? "";
  if (/\b(ko|tko)\b/.test(method)) return "ko";
  if (method.includes("submission")) return "sub";
  return "other";
}

function tallyAmateur(html: string): Tally | undefined {
  const heading = html.indexOf(AMATEUR_HEADING);
  if (heading === -1) return undefined;

  const tableStart = html.indexOf("<table", heading);
  const tableEnd = html.indexOf("</table>", tableStart);
  if (tableStart === -1 || tableEnd === -1) return undefined;
  const table = html.slice(tableStart, tableEnd);

  const tally: Tally = { w: 0, l: 0, d: 0, ko: 0, sub: 0 };
  for (const row of table.split(/<tr[\s>]/i)) {
    const result = first(row, /class="final_result ([a-z]+)"/i);
    if (result === "win") {
      tally.w += 1;
      const method = methodOf(row);
      if (method === "ko") tally.ko += 1;
      if (method === "sub") tally.sub += 1;
    } else if (result === "loss") {
      tally.l += 1;
    } else if (result === "draw") {
      tally.d += 1;
    }
    // No contests are deliberately not counted as anything. They are not a win,
    // not a loss and not a draw, and inventing a bucket for them here would put
    // a number on the card that the fighter's own record does not contain.
  }

  return tally.w + tally.l + tally.d > 0 ? tally : undefined;
}

/**
 * The headline professional panel. Wins, losses and their finish breakdowns sit
 * in sibling blocks, so each is read from its own slice rather than by counting
 * occurrences across the whole page.
 */
function tallyProfessional(html: string): Tally | undefined {
  const holder = html.indexOf("winsloses-holder");
  if (holder === -1) return undefined;

  const winsAt = html.indexOf('class="wins"', holder);
  const losesAt = html.indexOf('class="loses"', holder);
  if (winsAt === -1 || losesAt === -1) return undefined;

  const winBlock = html.slice(winsAt, losesAt);
  const loseBlock = html.slice(losesAt);

  const w = firstNumber(winBlock, /class="winloses win"[\s\S]*?<span>[^<]*<\/span>\s*<span>(\d+)<\/span>/i);
  const l = firstNumber(loseBlock, /class="winloses lose"[\s\S]*?<span>[^<]*<\/span>\s*<span>(\d+)<\/span>/i);
  if (w === undefined || l === undefined) return undefined;

  const d =
    firstNumber(html.slice(holder), /class="winloses draw"[\s\S]*?<span>[^<]*<\/span>\s*<span>(\d+)<\/span>/i) ??
    0;

  const meter = (block: string, title: RegExp) =>
    firstNumber(block, new RegExp(`class="meter-title">${title.source}[\\s\\S]*?class="pl">(\\d+)<`, "i")) ?? 0;

  return {
    w,
    l,
    d,
    ko: meter(winBlock, /KO\s*(?:<em>\/<\/em>)?\s*\/?\s*TKO/),
    sub: meter(winBlock, /SUBMISSIONS/),
  };
}

/** Fields no record site carries, so the fighter still has to answer them. */
export const NOT_COVERED = ["Reach", "Stance", "Photo", "Instagram", "Sponsors", "Walkout song"];

export type SherdogProfile = ImportedTape & {
  /** Echoed back so the fighter can see we found the right person. */
  name?: string;
};

export function parseSherdog(html: string, now = new Date()): SherdogProfile | null {
  const name = first(html, /<span class="fn">([^<]*)<\/span>/i);
  const amateur = tallyAmateur(html);
  const professional = amateur ? undefined : tallyProfessional(html);
  const tally = amateur ?? professional;

  // A page with no name and no record is a redirect, a holding page, or a
  // template we no longer understand. Returning null makes the caller say so
  // rather than presenting an empty import as a successful one.
  if (!name && !tally) return null;

  const heightCm = firstNumber(html, /HEIGHT<\/td>\s*<td>[\s\S]*?<\/b>[\s\S]*?([\d.]+)\s*cm/i);

  return {
    source: "sherdog",
    name,
    nickname: first(html, /<span class="nickname">[\s\S]*?<em>([^<]*)<\/em>/i),
    age: ageFrom(first(html, /itemprop="birthDate">([^<]*)</i), now),
    heightCm: heightCm === undefined ? undefined : Math.round(heightCm),
    gym: first(html, /itemprop="memberOf"[\s\S]*?<span itemprop="name">([^<]*)<\/span>/i),
    record: tally ? { w: tally.w, l: tally.l, d: tally.d } : undefined,
    finishes: tally ? { ko: tally.ko, sub: tally.sub } : undefined,
    recordKind: amateur ? "amateur" : professional ? "professional" : undefined,
    notCovered: NOT_COVERED,
  };
}
