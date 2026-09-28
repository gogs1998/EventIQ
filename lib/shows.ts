/**
 * The public list of shows, as derivation rather than as SQL.
 *
 * `/shows` is the first page here that is about more than one promoter's card,
 * so the ordering and the grouping are worth having somewhere they can be read
 * and tested — a `case when date >= ? then 0 else 1 end` buried in a select is
 * a rule nobody can check, and this one has a boundary (today) that is exactly
 * the kind of thing that is wrong by a day for a year before anybody notices.
 *
 * Everything here takes `today` as a parameter. No clock is read in this file:
 * the same argument as `daysUntilShow`, and the reason there are no pinned dates
 * anywhere in the product (HANDOVER, bug 18). A show dated today is upcoming,
 * because a card is read hardest on the afternoon of the show itself.
 *
 * Dates are ISO `YYYY-MM-DD` text, which sorts lexicographically as it sorts
 * chronologically, so nothing here parses a date to compare two of them.
 */

/** One published show, as the list draws it. The query maps rows onto this. */
export type ShowListing = {
  slug: string;
  name: string;
  /** Calendar day of the show, ISO `YYYY-MM-DD`. */
  date: string;
  venue: string;
  city: string;
  /** The promotion's name, not the account's. */
  promoter: string;
  /** Bouts on the running order. Zero is ordinary: a card can be published empty. */
  bouts: number;
};

/** Which half of the list the reader asked for, where they asked for one. */
export type When = "upcoming" | "past";

/**
 * The `?when=` value, or null for "both halves".
 *
 * Anything else is null rather than an error: a filter is a view of a public
 * page, and a mistyped one should show the page rather than a boundary.
 */
export function whenFilter(value: string | undefined | null): When | null {
  return value === "upcoming" || value === "past" ? value : null;
}

/** Soonest first, and a stable tie-break so two shows on one night do not swap. */
function soonestFirst(a: ShowListing, b: ShowListing): number {
  return a.date === b.date ? a.name.localeCompare(b.name, "en-GB") : a.date < b.date ? -1 : 1;
}

/**
 * The two halves: what is still to come, soonest first, and what has already
 * run, most recent first.
 *
 * Today counts as upcoming. The alternative puts the card a room full of people
 * is about to scan at the top of the "already run" list from midnight.
 */
export function partitionShows(
  shows: readonly ShowListing[],
  today: string,
): { upcoming: ShowListing[]; past: ShowListing[] } {
  const upcoming: ShowListing[] = [];
  const past: ShowListing[] = [];
  for (const show of shows) (show.date >= today ? upcoming : past).push(show);
  return {
    upcoming: upcoming.sort(soonestFirst),
    past: past.sort((a, b) => -soonestFirst(a, b)),
  };
}

/**
 * The cities with a published show in them, each with how many, most first.
 *
 * It is what the filter bar is built from, so the order is the order a reader
 * would want to scan: the places that run shows, then everywhere else
 * alphabetically. Cities are compared as typed, because a promoter types their
 * own venue's town and "Grangemouth" and "grangemouth" are the same place — the
 * name kept is the first one seen, so the bar reads as the card does.
 */
export function groupByCity(
  shows: readonly ShowListing[],
): { city: string; shows: number }[] {
  const seen = new Map<string, { city: string; shows: number }>();
  for (const show of shows) {
    const key = show.city.trim().toLowerCase();
    const found = seen.get(key);
    if (found) found.shows += 1;
    else seen.set(key, { city: show.city.trim(), shows: 1 });
  }
  return [...seen.values()].sort((a, b) =>
    a.shows === b.shows ? a.city.localeCompare(b.city, "en-GB") : b.shows - a.shows,
  );
}

/**
 * The shows in one city, or all of them where no city was asked for.
 *
 * Compared case- and space-insensitively for the same reason the grouping is:
 * the value in the address came off a link this page wrote, but a reader who
 * types `?city=grangemouth` has asked a perfectly clear question.
 */
export function inCity(
  shows: readonly ShowListing[],
  city: string | undefined | null,
): ShowListing[] {
  const wanted = city?.trim().toLowerCase();
  if (!wanted) return [...shows];
  return shows.filter((show) => show.city.trim().toLowerCase() === wanted);
}

/**
 * How many shows are listed before an "older shows" link appears.
 *
 * Fifty is well past anything this will hold for a long time, and the whole
 * point of the number is that the page cannot become a scan of every show ever
 * run the day it starts to matter. Only the past list is paged: everything
 * still to come is what somebody came here for.
 */
export const PAGE_SIZE = 50;

/** The `?page=` value as a page number. Anything unreadable is the first page. */
export function pageNumber(value: string | undefined | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** One page of a list, and whether there is another behind it. */
export function pageOf<T>(
  items: readonly T[],
  page: number,
  size = PAGE_SIZE,
): { items: T[]; hasMore: boolean } {
  const from = (page - 1) * size;
  return { items: items.slice(from, from + size), hasMore: items.length > from + size };
}

/**
 * The address for a view of this page, with the filters that are actually set.
 *
 * Written once because every link on the page is one of these and they have to
 * agree: a city chip that dropped `when`, or an "older shows" link that dropped
 * the city, would quietly show the reader a different list from the one they
 * were looking at.
 */
export function showsHref(params: {
  city?: string | null;
  when?: When | null;
  page?: number | null;
}): string {
  const query = new URLSearchParams();
  if (params.city) query.set("city", params.city);
  if (params.when) query.set("when", params.when);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const search = query.toString();
  return search ? `/shows?${search}` : "/shows";
}
