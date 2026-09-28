import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutCard } from "@/components/BoutCard";
import { SponsorLink } from "@/components/SponsorLink";
import { TrackOpen } from "@/components/TrackOpen";
import { boutsTopDown, featuredBout, fighterOf, showSponsors } from "@/lib/card";
import { EMPTY_PROGRAMME, SHOWS_LINK, boutCountLabel, programmeLinkNote } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { loadRenders } from "@/lib/db/queries";
import { sportsEventJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { formatEventDate, lastName } from "@/lib/tape";
import { visibleCardFor } from "@/lib/visibility";

export async function generateMetadata({
  params,
}: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  // Through the same gate as the body. A draft show's name and venue in an
  // unfurled link is the show leaking, whatever the page itself answers.
  const card = await visibleCardFor(slug);
  if (!card) return {};

  const { event } = card;
  return {
    title: `${event.name} — digital programme`,
    description: `The full running order for ${event.name} at ${event.venue}, ${event.city}. Every bout, every fighter, a tale of the tape for all of them.`,
  };
}

export default async function ProgrammePage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const db = await getDb();
  const card = await visibleCardFor(slug);
  if (!card) notFound();

  const { event } = card;
  const renders = await loadRenders(db, card.eventId);
  const bouts = boutsTopDown(card);
  // The bout the card calls the main event, not just the top of the list, so the
  // names under the show's own title are the pair wearing the label below.
  const main = featuredBout(card);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl">
      <TrackOpen slug={event.slug} kind="programme_open" />

      {/* The same facts the hero states, in the vocabulary a search engine
          reads, so a card can turn up in an events listing rather than only in
          a page of blue links.

          **Published shows only.** A promoter previewing their own draft gets
          the page and not this: a draft's name, venue and date in a block a
          crawler reads is the show leaking whatever the visible page says, and
          it is the same omission that put draft titles in two generateMetadata
          functions (HANDOVER section 6c). `<` is escaped rather than trusted,
          because a show called "</script>" is the promoter's to name. */}
      {card.published ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              sportsEventJsonLd({
                name: event.name,
                tagline: event.tagline,
                date: event.date,
                doorsTime: event.doorsTime,
                firstBellTime: event.firstBellTime,
                venue: event.venue,
                city: event.city,
                promoter: event.promoter.name,
                url: new URL(`/e/${event.slug}`, SITE_URL).toString(),
              }),
            ).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}

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
          {!card.published ? (
            <p className="border-gold/50 text-gold mb-5 inline-block border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em]">
              Not published — only you can see this
            </p>
          ) : null}

          <div className="flex items-center gap-2.5">
            {event.promoter.mark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.promoter.mark} alt="" className="h-9 w-9 opacity-90" />
            ) : null}
            <span className="label">{event.promoter.name}</span>
          </div>

          <h1 className="display anim-slam mt-6 text-6xl">{event.name}</h1>

          {main ? (
            <p className="display text-gold mt-2 text-2xl">
              {lastName(fighterOf(card, main.redId))} vs{" "}
              {lastName(fighterOf(card, main.blueId))}
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
          {/* Counts what is listed below rather than what is in the table. */}
          <span className="label">{boutCountLabel(bouts.length)}</span>
        </div>

        {/* A show can be published before its running order is entered, so the
            empty card is a state to write rather than a grid with nothing in it
            under an invitation to tap something. The line about invite links is
            only shown on a draft, which is the one case where the reader is
            certainly the promoter who owns it. */}
        {bouts.length ? (
          <>
            {/* The invitation to tap is `programmeLinkNote`, the same sentence
                the pitch page uses about this card, rather than a second copy
                of it here — a count-bearing line typed into a page is a line
                nothing holds to the zero-bout rule. */}
            <p className="text-ash mb-4 px-2 text-xs leading-relaxed">
              Main event first. {programmeLinkNote(bouts.length)}
            </p>

            <div className="grid gap-3">
              {bouts.map((bout) => (
                <BoutCard
                  key={bout.number}
                  card={card}
                  bout={bout}
                  renders={renders[bout.number]}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="border-hairline mx-2 border p-5">
            <h3 className="display text-lg">{EMPTY_PROGRAMME.heading}</h3>
            <p className="text-ash mt-2 text-sm leading-relaxed">{EMPTY_PROGRAMME.body}</p>
            {!card.published ? (
              <>
                <p className="text-ash mt-3 text-sm leading-relaxed">
                  {EMPTY_PROGRAMME.promoter}
                </p>
                <Link
                  href={`/promoter/e/${event.slug}/card`}
                  className="border-hairline hover:border-chalk/40 label mt-4 inline-block border px-3 py-2 transition-colors"
                >
                  Edit the card
                </Link>
              </>
            ) : null}
          </div>
        )}
      </section>

      {/* --------------------------------------------- show sponsors */}
      {showSponsors(card).length ? (
        <section className="border-hairline border-t px-5 py-8">
          <h2 className="label mb-5">Show sponsors</h2>
          <div className="grid grid-cols-2 gap-5">
            {showSponsors(card).map((sponsor) => (
              <SponsorLink
                key={sponsor.id}
                slug={event.slug}
                sponsor={sponsor}
                className="hover:opacity-100 opacity-80 transition-opacity"
              />
            ))}
          </div>
          <p className="text-ash-dim mt-6 text-xs leading-relaxed">
            {event.promoter.name} would like to thank everyone who put money behind this
            show. Without them there is no card.
          </p>
        </section>
      ) : null}

      {/* Quiet, and at the bottom. The programme is the promoter's product and
          the sponsors on it are paying to be seen; EventIQ says its name once,
          below everything, and the way through to the rest of the platform is a
          plain line rather than a call to action. */}
      <footer className="border-hairline text-ash-dim border-t px-5 py-8 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="label">EventIQ</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/shows" className="hover:text-chalk transition-colors">
              {SHOWS_LINK}
            </Link>
            <Link href="/" className="hover:text-chalk transition-colors">
              Digital programmes for fight shows
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
