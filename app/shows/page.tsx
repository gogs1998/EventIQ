import type { Metadata } from "next";
import Link from "next/link";
import { SHOWS, SHOWS_META, listedBoutCount } from "@/lib/copy";
import {
  groupByCity,
  inCity,
  pageNumber,
  pageOf,
  partitionShows,
  showsHref,
  whenFilter,
  type ShowListing,
} from "@/lib/shows";
import { formatEventDateShort } from "@/lib/tape";
import { publicShows } from "@/lib/visibility";

/**
 * Every published show on the instance.
 *
 * The first page here that is about more than one promoter, which is what makes
 * it worth being careful about two things.
 *
 * The first is the gate. It goes through `publicShows`, which is published-only
 * with no viewer in the question at all — not even the promoter's own draft,
 * which `loadVisibleCard` does soften for on a programme. A list of what is on
 * is read by strangers about promoters they have never heard of, and a draft on
 * it would be a show announced by accident.
 *
 * The second is that both filters are in the address and nothing here is
 * client state. A reader who picks a city can send that link to somebody, a
 * crawler indexes it as a page of its own with its own title, and the back
 * button does what it looks like it does. There is no `useState` on this page
 * and there should not be one: the whole of it is a function of the query.
 */

/** Today, from the real clock, UTC, as `YYYY-MM-DD`. No pinned dates anywhere. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The single search param, however the address spelled it. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The city as this instance spells it, or null where nothing is published
 * there.
 *
 * The title only ever names a city that actually has shows in it, so a crawler
 * following `?city=Atlantis` is not handed a page titled after a place, and the
 * capitals come off a promoter's own row rather than off the address bar.
 */
function namedCity(shows: readonly ShowListing[], asked: string | undefined): string | null {
  const wanted = asked?.trim().toLowerCase();
  if (!wanted) return null;
  return shows.find((show) => show.city.trim().toLowerCase() === wanted)?.city.trim() ?? null;
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/shows">): Promise<Metadata> {
  const city = namedCity(await publicShows(), one((await searchParams).city));

  return city
    ? {
        title: SHOWS_META.cityTitle(city),
        description: SHOWS_META.cityDescription(city),
        alternates: { canonical: showsHref({ city }) },
      }
    : {
        title: SHOWS_META.title,
        description: SHOWS_META.description,
        // Every filtered view points back at the bare list, so the filters do
        // not compete with it for the same page in an index.
        alternates: { canonical: "/shows" },
      };
}

export default async function ShowsPage({ searchParams }: PageProps<"/shows">) {
  const query = await searchParams;
  const shows = await publicShows();

  // What the address asked for, and what this instance calls it. They come
  // apart for a city nobody has published in: the filter still applies and the
  // list comes back empty, which is the honest answer — quietly widening it
  // back to everything would show a reader a list they did not ask for.
  const asked = one(query.city)?.trim() || null;
  const city = namedCity(shows, asked ?? undefined);
  const when = whenFilter(one(query.when));
  const page = pageNumber(one(query.page));

  // The filter bar is built from the whole list rather than the filtered one,
  // so a reader who has narrowed to one city can still see the others.
  const cities = groupByCity(shows);
  const { upcoming, past } = partitionShows(inCity(shows, asked), today());
  // Only what has already run is paged. Everything still to come is what
  // somebody opened this page for, however long the list gets.
  const { items: pastPage, hasMore } = pageOf(past, page);

  const filtered = !!asked || !!when;
  const anything = shows.length > 0;
  // A filter that matched nothing at all. Something is published, but not this,
  // so the halves come out and one line and a way back go in their place.
  const matchedNothing = filtered && !upcoming.length && !past.length;
  // Otherwise a half is drawn whenever `when` does not rule it out — empty
  // included, because "nothing in the diary" is a fact worth reading and a
  // reader who asked for what has already run should not get a blank page.
  const showUpcoming = anything && !matchedNothing && when !== "past";
  const showPast = anything && !matchedNothing && when !== "upcoming";

  return (
    <main id="main" tabIndex={-1} className="w-full">
      <section className="mx-auto max-w-4xl px-5 pb-10 pt-12">
        <h1 className="display anim-slam text-5xl leading-[0.9] sm:text-6xl">{SHOWS.heading}</h1>
        <p className="text-ash mt-6 max-w-2xl text-base leading-relaxed">{SHOWS.lead}</p>
      </section>

      {shows.length ? (
        <section className="border-hairline mx-auto max-w-4xl border-t px-5 py-6" aria-label="Filters">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="label w-14 shrink-0">{SHOWS.cities}</span>
            <Chip href={showsHref({ when })} on={!city}>
              {SHOWS.everyCity}
            </Chip>
            {cities.map((place) => (
              <Chip
                key={place.city}
                href={showsHref({ city: place.city, when })}
                on={city === place.city}
              >
                {place.city}
                <span className="text-ash-dim tnum ml-1.5">{place.shows}</span>
              </Chip>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="label w-14 shrink-0">When</span>
            <Chip href={showsHref({ city: asked })} on={!when}>
              {SHOWS.everyWhen}
            </Chip>
            {(["upcoming", "past"] as const).map((value) => (
              <Chip key={value} href={showsHref({ city: asked, when: value })} on={when === value}>
                {value === "upcoming" ? SHOWS.upcoming : SHOWS.past}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mx-auto max-w-4xl px-5 pb-16">
        {/* Nothing published anywhere. A state to report, not a fault. */}
        {!anything ? (
          <div className="border-hairline border-t py-14">
            <h2 className="display text-3xl leading-none">{SHOWS.empty.heading}</h2>
            <p className="text-ash mt-5 max-w-2xl text-sm leading-relaxed">{SHOWS.empty.body}</p>
          </div>
        ) : null}

        {/* Something is published, but not under this filter. The way back is a
            link rather than an instruction, and nothing counts what is missing. */}
        {matchedNothing ? (
          <div className="border-hairline border-t py-10">
            <p className="text-ash text-sm leading-relaxed">{SHOWS.nothingHere}</p>
            <Link href="/shows" className="label hover:text-chalk mt-4 inline-block">
              {SHOWS.everyWhen}
            </Link>
          </div>
        ) : null}

        {showUpcoming ? (
          <Half heading={SHOWS.upcoming} shows={upcoming} empty={SHOWS.noneUpcoming} />
        ) : null}

        {showPast ? (
          <>
            <Half heading={SHOWS.past} shows={pastPage} empty={SHOWS.nonePast} />
            {hasMore || page > 1 ? (
              <div className="mt-6 flex flex-wrap gap-4">
                {page > 1 ? (
                  <Link
                    href={showsHref({ city: asked, when, page: page - 1 })}
                    className="label hover:text-chalk"
                  >
                    {SHOWS.newer}
                  </Link>
                ) : null}
                {hasMore ? (
                  <Link
                    href={showsHref({ city: asked, when, page: page + 1 })}
                    className="label hover:text-chalk"
                  >
                    {SHOWS.older}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

/** A filter, drawn as a link because that is what it is. */
function Chip({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={`label border px-2.5 py-1 transition-colors ${
        on ? "border-chalk/60 text-chalk" : "border-hairline hover:border-chalk/40"
      }`}
    >
      {children}
    </Link>
  );
}

/** One half of the list: still to come, or already run. */
function Half({
  heading,
  shows,
  empty,
}: {
  heading: string;
  shows: readonly ShowListing[];
  empty: string;
}) {
  return (
    <section className="border-hairline border-t pt-6 mt-6 first:mt-0">
      <h2 className="label mb-4">{heading}</h2>
      {shows.length ? (
        <ul className="grid gap-px">
          {shows.map((show) => (
            <ShowRow key={show.slug} show={show} />
          ))}
        </ul>
      ) : (
        <p className="text-ash-dim text-sm leading-relaxed">{empty}</p>
      )}
    </section>
  );
}

function ShowRow({ show }: { show: ShowListing }) {
  const bouts = listedBoutCount(show.bouts);

  return (
    <li>
      <Link
        href={`/e/${show.slug}`}
        className="border-hairline hover:border-chalk/30 group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b py-4 transition-colors"
      >
        <div className="min-w-0">
          <span className="label">{show.promoter}</span>
          <h3 className="display group-hover:text-gold mt-1 text-2xl transition-colors">
            {show.name}
          </h3>
          <p className="text-ash mt-1 text-sm">
            {show.venue}, {show.city}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="tnum text-chalk block text-xs">
            {formatEventDateShort(show.date)}
          </span>
          {/* A published card with nothing on the running order yet is listed on
              its name and its date. Announcing the hole would be the shaming
              rule in different clothes. */}
          {bouts ? <span className="text-ash-dim tnum block text-xs">{bouts}</span> : null}
          <span className="label mt-1.5 inline-block">{SHOWS.open}</span>
        </div>
      </Link>
    </li>
  );
}
