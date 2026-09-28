import Link from "next/link";
import type { Appearance } from "@/lib/db/queries";
import { PREVIOUS_SHOWS } from "@/lib/copy";
import { formatEventDateShort } from "@/lib/tape";

/**
 * Every published show a fighter has been on, newest first.
 *
 * The list is the point of a fighter having a permanent page at all: a profile
 * that exists only for the card in front of you is a programme entry, and one
 * that carries every card they have walked out on is a reason to put the address
 * in a bio. What it never carries is a result — this product records who was on
 * a card and has never recorded who won, and a column of opponents is exactly
 * where somebody would be tempted to add one.
 *
 * The rows come from `appearancesFor`/`loadPublicFighter`, which filter on
 * published. Nothing here decides who may see what; it is handed the list.
 */
export function PreviousShows({ shows }: { shows: readonly Appearance[] }) {
  if (!shows.length) return null;

  return (
    <section className="border-hairline border-t px-5 py-6">
      <h2 className="label mb-4">{PREVIOUS_SHOWS.heading}</h2>
      <ul className="grid gap-4">
        {shows.map((show) => (
          <li key={`${show.slug}-${show.boutNumber}`} className="border-hairline border-b pb-3">
            <Link
              href={`/e/${show.slug}`}
              className="hover:text-gold flex items-baseline justify-between gap-3 transition-colors"
            >
              <span className="display text-chalk text-base">{show.eventName}</span>
              <span className="tnum text-ash-dim shrink-0 text-xs">
                {formatEventDateShort(show.date)}
              </span>
            </Link>
            <p className="text-ash mt-1 text-sm">
              v{" "}
              <Link
                href={`/e/${show.slug}/f/${show.opponent.id}`}
                className="hover:text-chalk transition-colors"
              >
                {show.opponent.name}
              </Link>
              {/* A bout that came off still happened to the card and still had a
                  sponsor on it, so it keeps its line and says what it is. */}
              {show.cancelled ? (
                <span className="text-ash-dim"> · {PREVIOUS_SHOWS.withdrawn}</span>
              ) : null}
            </p>
            {show.video ? (
              <a
                href={show.video}
                target="_blank"
                rel="noreferrer"
                className="label hover:text-chalk mt-1.5 inline-block transition-colors"
              >
                {PREVIOUS_SHOWS.video}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
