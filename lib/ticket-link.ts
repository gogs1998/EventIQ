import { ACTION_ERRORS } from "@/lib/copy";
import { daysUntilShow } from "@/lib/promoter";

/**
 * A show's ticket link: what may be stored, and when the programme shows it.
 *
 * The address is the promoter's to choose and the spectator's to tap, so it is
 * checked in the action that stores it rather than in the form that sends it —
 * every server action here is reachable directly by anybody holding a session.
 * https only, because a programme handing a phone to a plain-http payment page
 * is a programme pointing at somebody else's mistake; no credentials in the
 * address, because `https://eventiq.win@elsewhere.example` reads as one host and
 * goes to another; a real host name rather than an address on the local network.
 *
 * What is stored is the parsed URL's own `href`, never the text as typed, so the
 * row holds exactly the address the browser will open. The same check runs again
 * on the way out (`ticketLinkFor`), so a row planted by hand that would fail it
 * is simply not shown.
 */

/** Longer than any ticket page's address; short enough that nothing else fits. */
export const MAX_TICKET_URL = 500;

export type ParsedTicketUrl = { ok: true; url: string | null } | { ok: false; error: string };

/**
 * The address to store, null to take the link off, or the sentence to show.
 *
 * Takes the raw form value rather than one already trimmed to a length, because
 * cutting a URL short does not make it invalid — it makes it a different, valid
 * address the promoter never typed.
 */
export function parseTicketUrl(raw: unknown): ParsedTicketUrl {
  if (raw === null || raw === undefined) return { ok: true, url: null };
  if (typeof raw !== "string") return { ok: false, error: ACTION_ERRORS.ticketLinkUnreadable };

  const typed = raw.trim();
  if (!typed) return { ok: true, url: null };
  if (typed.length > MAX_TICKET_URL) return { ok: false, error: ACTION_ERRORS.ticketLinkTooLong };
  // Whitespace and control characters inside an address are not something a
  // pasted ticket link contains, and the URL parser would quietly encode them.
  if (/[\s\u0000-\u001f\u007f]/.test(typed)) {
    return { ok: false, error: ACTION_ERRORS.ticketLinkUnreadable };
  }

  const url = safeHttpsUrl(typed);
  if (url === "not-https") return { ok: false, error: ACTION_ERRORS.ticketLinkNotHttps };
  if (!url || url.href.length > MAX_TICKET_URL) {
    return { ok: false, error: ACTION_ERRORS.ticketLinkUnreadable };
  }
  return { ok: true, url: url.href };
}

function safeHttpsUrl(text: string): URL | "not-https" | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // "tickets.example.com/show" is a ticket link with the scheme left off, and
    // the honest answer to it is the https rule rather than "unreadable".
    return /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(text) ? "not-https" : null;
  }
  if (url.protocol !== "https:") return "not-https";
  if (url.username || url.password) return null;

  const host = url.hostname;
  // A dotted name ending in letters: not `localhost`, not a bare word, not an
  // IPv4 or IPv6 literal. Ticket platforms have names.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host)) return null;
  return url;
}

/** What the programme shows: the address to open, and the host to name beside it. */
export type TicketLink = { href: string; host: string };

/**
 * The link the programme shows, or null.
 *
 * Shown through the whole of the show's own day, since tickets on the door are
 * still tickets, and gone from the day after: a link to buy a seat at something
 * that has happened is the programme getting a fact wrong in public. The day is
 * the same UTC calendar day `daysUntilShow` counts in, which runs at most an hour
 * past midnight in a British summer — the safe side to be wrong on.
 */
export function ticketLinkFor(
  event: { ticketUrl?: string | null; date: string },
  now = new Date(),
): TicketLink | null {
  if (!event.ticketUrl) return null;
  if (daysUntilShow(event.date, now) < 0) return null;

  const parsed = parseTicketUrl(event.ticketUrl);
  if (!parsed.ok || !parsed.url) return null;
  const url = new URL(parsed.url);
  return { href: url.href, host: url.hostname.replace(/^www\./i, "") };
}
