import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FighterPortrait } from "@/components/FighterPortrait";
import { SponsorLink } from "@/components/SponsorLink";
import { TrackOpen } from "@/components/TrackOpen";
import { fighterSponsors, type Card } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadCard } from "@/lib/db/queries";
import { currentPromoter } from "@/lib/session";
import {
  boutBillingLabel,
  boutClassLine,
  completeness,
  finishCount,
  formatEventDateShort,
  formatRecord,
  totalFights,
} from "@/lib/tape";
import type { Corner } from "@/lib/types";

function boutFor(card: Card, fighterId: string) {
  const bout = card.event.bouts.find((b) => b.redId === fighterId || b.blueId === fighterId);
  if (!bout) return undefined;
  return { bout, corner: (bout.redId === fighterId ? "red" : "blue") as Corner };
}

export async function generateMetadata({
  params,
}: PageProps<"/e/[slug]/f/[fighter]">): Promise<Metadata> {
  const { slug, fighter: id } = await params;
  const card = await loadCard(await getDb(), slug);
  const fighter = card?.fighters[id];
  if (!card || !fighter) return {};

  return {
    title: `${fighter.name} — ${card.event.name}`,
    description: `${fighter.name}, ${fighter.gym}. Fighting at ${card.event.name}, ${formatEventDateShort(card.event.date)}.`,
  };
}

export default async function FighterPage({ params }: PageProps<"/e/[slug]/f/[fighter]">) {
  const { slug, fighter: id } = await params;
  const card = await loadCard(await getDb(), slug);
  if (!card) notFound();

  if (!card.published) {
    const promoter = await currentPromoter();
    if (promoter?.id !== card.promoterId) notFound();
  }

  const fighter = card.fighters[id];
  if (!fighter) notFound();

  const assignment = boutFor(card, id);
  const corner: Corner = assignment?.corner ?? "red";
  const record = formatRecord(fighter);
  const { score, missing } = completeness(fighter);
  const sponsors = fighterSponsors(card, fighter);

  const stats: { label: string; value?: string }[] = [
    { label: "Record", value: record },
    { label: "Fights", value: fighter.record ? String(totalFights(fighter)) : undefined },
    { label: "Finishes", value: fighter.finishes ? String(finishCount(fighter)) : undefined },
    { label: "Age", value: fighter.age ? String(fighter.age) : undefined },
    { label: "Height", value: fighter.heightCm ? `${fighter.heightCm}cm` : undefined },
    { label: "Reach", value: fighter.reachCm ? `${fighter.reachCm}cm` : undefined },
    { label: "Stance", value: fighter.stance },
    { label: "From", value: fighter.hometown },
  ].filter((s) => s.value);

  return (
    <main className="mx-auto w-full max-w-xl">
      <TrackOpen slug={card.event.slug} kind="profile_view" fighterId={fighter.id} />

      <div className="relative">
        <FighterPortrait
          fighter={fighter}
          corner={corner}
          rounded={false}
          className="aspect-[4/5] w-full"
        />
        <div className="from-ink absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          <span
            className={
              corner === "red"
                ? "label text-red-corner-hot"
                : "label text-blue-corner-hot"
            }
          >
            {corner === "red" ? "Red corner" : "Blue corner"}
          </span>
          <h1 className="display anim-slam mt-2 text-5xl">{fighter.name}</h1>
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

      {assignment ? (
        <Link
          href={`/e/${card.event.slug}`}
          className="border-hairline hover:border-chalk/30 flex items-center justify-between gap-3 border-b px-5 py-4 transition-colors"
        >
          <div>
            <div className="label">{boutBillingLabel(assignment.bout)}</div>
            <div className="text-chalk mt-1 text-sm">{boutClassLine(assignment.bout)}</div>
          </div>
          <span className="label">Back to the card</span>
        </Link>
      ) : null}

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

      {fighter.walkoutSong ? (
        <section className="px-5 pb-6">
          <h2 className="label mb-2">Walks out to</h2>
          <p className="text-chalk text-sm">
            {fighter.walkoutSong.title}
            <span className="text-ash"> · {fighter.walkoutSong.artist}</span>
          </p>
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

      {sponsors.length ? (
        <section className="border-hairline border-t px-5 py-6">
          <h2 className="label mb-4">Backed by</h2>
          <div className="grid gap-4">
            {sponsors.map((sponsor) => (
              <SponsorLink
                key={sponsor.id}
                slug={card.event.slug}
                sponsor={sponsor}
                fighterId={fighter.id}
                boutNumber={assignment?.bout.number}
              />
            ))}
          </div>
        </section>
      ) : null}

      {score < 60 ? (
        <section className="border-hairline text-ash-dim border-t px-5 py-6 text-xs leading-relaxed">
          More to come from {fighter.name.split(" ")[0]}:{" "}
          {missing.slice(0, 4).join(", ").toLowerCase()}.
        </section>
      ) : null}

      <footer className="border-hairline text-ash-dim border-t px-5 py-8 text-xs">
        <div className="flex items-center justify-between">
          <span className="label">{card.event.name}</span>
          <Link href={`/e/${card.event.slug}`} className="hover:text-chalk transition-colors">
            Full programme
          </Link>
        </div>
      </footer>
    </main>
  );
}
