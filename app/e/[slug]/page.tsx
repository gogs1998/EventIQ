import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutCard } from "@/components/BoutCard";
import { SponsorLockup } from "@/components/SponsorLockup";
import { event } from "@/data/event";
import { mp4For } from "@/lib/renders";
import {
  boutsTopDown,
  formatEventDate,
  getSponsor,
  lastName,
  getFighter,
} from "@/lib/tape";

export function generateStaticParams() {
  return [{ slug: event.slug }];
}

export const metadata: Metadata = {
  title: `${event.name} — digital programme`,
  description: `The full running order for ${event.name} at ${event.venue}, ${event.city}. Every bout, every fighter, a tale of the tape for all of them.`,
};

export default async function ProgrammePage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  if (slug !== event.slug) notFound();

  const bouts = boutsTopDown();
  const main = bouts[0];
  const showSponsors = event.showSponsorIds
    .map((id) => getSponsor(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <main className="mx-auto w-full max-w-xl">
      {/* -------------------------------------------------------- hero */}
      <header className="relative overflow-hidden">
        {event.backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.backdrop}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40"
          />
        ) : null}
        <div className="from-ink via-ink/70 to-ink/95 absolute inset-0 bg-gradient-to-b" />

        <div className="relative px-5 pb-8 pt-12">
          <div className="flex items-center gap-2.5">
            {event.promoter.mark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.promoter.mark} alt="" className="h-9 w-9 opacity-90" />
            ) : null}
            <span className="label">{event.promoter.name}</span>
          </div>

          <h1 className="display anim-slam mt-6 text-6xl">{event.name}</h1>

          {event.tagline ? (
            <p className="display text-gold mt-2 text-2xl">
              {lastName(getFighter(main.redId))} vs {lastName(getFighter(main.blueId))}
            </p>
          ) : null}

          <div className="bg-red-corner mt-5 h-[3px] w-24" />

          <dl className="mt-5 grid gap-2.5 text-sm">
            <div className="flex gap-3">
              <dt className="label w-20 shrink-0 pt-1">Date</dt>
              <dd className="text-chalk">{formatEventDate(event.date)}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="label w-20 shrink-0 pt-1">Venue</dt>
              <dd className="text-chalk">
                {event.venue}, {event.city}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="label w-20 shrink-0 pt-1">Times</dt>
              <dd className="text-chalk">
                Doors {event.doorsTime} · First bell {event.firstBellTime}
              </dd>
            </div>
          </dl>

          {event.sanctioning ? (
            <p className="text-ash-dim mt-5 font-mono text-[0.55rem] uppercase tracking-[0.2em]">
              {event.sanctioning}
            </p>
          ) : null}
        </div>
      </header>

      {/* ----------------------------------------------- running order */}
      <section className="px-3 pb-10">
        <div className="border-hairline mb-3 flex items-end justify-between border-b px-2 pb-2">
          <h2 className="display text-xl">Running Order</h2>
          <span className="label">{event.bouts.length} bouts</span>
        </div>

        <p className="text-ash mb-4 px-2 text-xs leading-relaxed">
          Main event first. Tap any bout for the tale of the tape.
        </p>

        <div className="grid gap-3">
          {bouts.map((bout) => (
            <BoutCard key={bout.number} bout={bout} mp4={mp4For(bout.number)} />
          ))}
        </div>
      </section>

      {/* --------------------------------------------- show sponsors */}
      <section className="border-hairline border-t px-5 py-8">
        <h2 className="label mb-5">Show sponsors</h2>
        <div className="grid grid-cols-2 gap-5">
          {showSponsors.map((sponsor) => (
            <a
              key={sponsor.id}
              href={sponsor.url ?? "#"}
              className="hover:opacity-100 opacity-80 transition-opacity"
            >
              <SponsorLockup sponsor={sponsor} size="md" />
            </a>
          ))}
        </div>
        <p className="text-ash-dim mt-6 text-xs leading-relaxed">
          {event.promoter.name} would like to thank everyone who put money behind this
          show. Without them there is no card.
        </p>
      </section>

      <footer className="border-hairline text-ash-dim border-t px-5 py-8 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="label">EventIQ</span>
          <Link href="/" className="hover:text-chalk transition-colors">
            Digital programmes for fight shows
          </Link>
        </div>
      </footer>
    </main>
  );
}
