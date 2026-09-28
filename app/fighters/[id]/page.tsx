import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FighterPortrait } from "@/components/FighterPortrait";
import { PreviousShows } from "@/components/PreviousShows";
import { FIGHTER_PROFILE } from "@/lib/copy";
import { finishCount, formatRecord, stated, totalFights } from "@/lib/tape";
import { publicFighterFor } from "@/lib/visibility";

/**
 * A fighter's permanent address.
 *
 * `/e/<slug>/f/<id>` is a fighter inside one promoter's programme and is the
 * page a spectator reaches from the running order. This is the same person with
 * no show around them: it outlives the card that introduced them, which is what
 * makes it worth putting in an Instagram bio, and it is the only address here
 * that names a fighter without naming a show.
 *
 * That makes it the one page that could leak a card nobody has announced, so it
 * goes behind `loadPublicFighter` — published appearances only, and a fighter
 * who has never been on one answers 404 exactly as a name nobody has used does.
 * There is no viewer to soften that with and no promoter's own draft shown here.
 *
 * EventIQ is deliberately absent above the fold (lib/masthead.ts). The page is
 * the fighter's, and the shows on it are the promoters'.
 */
export async function generateMetadata({
  params,
}: PageProps<"/fighters/[id]">): Promise<Metadata> {
  const { id } = await params;
  // The same gate as the body, so a fighter with nothing public is not named to
  // a crawler or in a chat app's preview of the link.
  const profile = await publicFighterFor(id);
  if (!profile) return {};

  const { fighter } = profile;
  return {
    title: `${fighter.name} — ${fighter.gym}`,
    description: `${fighter.name}, ${fighter.gym}. Every card they have been on.`,
  };
}

export default async function FighterProfilePage({ params }: PageProps<"/fighters/[id]">) {
  const { id } = await params;
  const profile = await publicFighterFor(id);
  if (!profile) notFound();

  const { fighter, appearances } = profile;
  // The most recent card, which is what the corner colour and the line under the
  // name are taken from. There is always one: a profile with no published
  // appearance is not a page.
  const latest = appearances[0];

  const stats: { label: string; value?: string }[] = [
    { label: "Record", value: formatRecord(fighter) },
    { label: "Fights", value: fighter.record ? String(totalFights(fighter)) : undefined },
    { label: "Finishes", value: fighter.finishes ? String(finishCount(fighter)) : undefined },
    { label: "Height", value: fighter.heightCm ? `${fighter.heightCm}cm` : undefined },
    { label: "Reach", value: fighter.reachCm ? `${fighter.reachCm}cm` : undefined },
    { label: "Stance", value: fighter.stance },
    // Through stated(), or a box of spaces survives the filter as an empty stat.
    { label: "From", value: stated(fighter.hometown) },
  ].filter((stat) => stat.value);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl">
      <div className="relative">
        <FighterPortrait
          fighter={fighter}
          corner={latest.corner}
          rounded={false}
          className="aspect-[4/5] w-full"
        />
        <div className="from-ink absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="label">{FIGHTER_PROFILE.intro(appearances.length)}</span>
          <h1 className="display mt-2 text-5xl">{fighter.name}</h1>
          {fighter.nickname ? (
            <p className="display text-gold mt-1.5 text-xl">
              &ldquo;{fighter.nickname}&rdquo;
            </p>
          ) : null}
          <p className="text-chalk mt-2 text-sm">
            {fighter.gym}
            {fighter.hometown ? <span className="text-ash"> · {fighter.hometown}</span> : null}
          </p>
        </div>
      </div>

      {/* Straight back to the card they are on, because the newest row on this
          page is usually a show that has not happened yet. */}
      <Link
        href={`/e/${latest.slug}/f/${fighter.id}`}
        className="border-hairline hover:border-chalk/30 flex items-center justify-between gap-3 border-b px-5 py-4 transition-colors"
      >
        <div className="text-chalk text-sm">{FIGHTER_PROFILE.current(latest.eventName)}</div>
        <span className="label">Open the programme</span>
      </Link>

      {stats.length ? (
        <section className="px-5 py-6">
          <h2 className="label mb-4">The numbers</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-hairline flex items-baseline justify-between border-b pb-1.5"
              >
                <dt className="label">{stat.label}</dt>
                <dd className="tnum display text-chalk text-lg">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {fighter.bio ? (
        <section className="px-5 pb-6">
          <h2 className="label mb-3">In their words</h2>
          <p className="text-chalk/90 text-sm leading-relaxed">{fighter.bio}</p>
        </section>
      ) : null}

      {fighter.styleTags?.length ? (
        <section className="px-5 pb-6">
          <h2 className="label mb-3">Game</h2>
          <div className="flex flex-wrap gap-2">
            {fighter.styleTags.map((tag) => (
              <span
                key={tag}
                className="border-hairline text-chalk border px-2.5 py-1 text-xs uppercase tracking-wider"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {fighter.instagram ? (
        <section className="px-5 pb-6">
          <a
            href={`https://instagram.com/${fighter.instagram}`}
            target="_blank"
            rel="noreferrer"
            className="border-hairline hover:border-chalk/40 flex items-center justify-between border px-4 py-3 transition-colors"
          >
            <span className="text-chalk text-sm">@{fighter.instagram}</span>
            <span className="label">Follow</span>
          </a>
        </section>
      ) : null}

      {/* Every card, this one included: the page is the list. No sponsors —
          a fighter's backers were placed on one promoter's card and are shown
          there, and a page spanning promotions is not a place to gather them. */}
      <PreviousShows shows={appearances} />
    </main>
  );
}
