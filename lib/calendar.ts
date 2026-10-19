/**
 * Calendar days, as opposed to instants.
 *
 * A show is on a day, and the day is the one on the posters in the town it is
 * in. The product runs UK cards, so "today" is today in Europe/London — not in
 * UTC, which is an hour behind for half the year and put a show at 00:30 BST on
 * the wrong side of "tomorrow" — and not on the server's clock, which is
 * wherever the Worker happens to be.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether this is a `YYYY-MM-DD` that names a day that exists.
 *
 * The shape alone let `2026-02-31` and `2026-13-01` through, and both then
 * went on a programme as whatever `Date` made of them. A date that survives a
 * round trip through `Date.UTC` unchanged is a real one.
 */
export function isCalendarDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in the UK, as `YYYY-MM-DD`. */
export function londonToday(now: Date): string {
  const parts = Object.fromEntries(LONDON.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
