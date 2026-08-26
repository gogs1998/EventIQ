import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/QrCode";
import { SponsorLockup } from "@/components/SponsorLockup";
import { showSponsors } from "@/lib/card";
import { tableCardNote } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { formatEventDateShort } from "@/lib/tape";
import { loadVisibleCard } from "@/lib/visibility";

export async function generateMetadata({
  params,
}: PageProps<"/e/[slug]/qr">): Promise<Metadata> {
  const { slug } = await params;
  const card = await loadVisibleCard(await getDb(), slug);
  return card
    ? {
        title: `Table card — ${card.event.name}`,
        description: "Printable QR card for the tables, the doors and the posters.",
      }
    : {};
}

/**
 * The thing that actually goes on the table.
 *
 * Dark on screen so it matches the programme, light when printed, because
 * nobody is putting a hundred solid-black A5 cards through a copy shop.
 *
 * Gated exactly as the programme is. This card carries the show's name, date and
 * venue and a code straight into it, so it had no business being the one route
 * that would print a draft for anybody holding the slug.
 */
export default async function QrPage({ params }: PageProps<"/e/[slug]/qr">) {
  const { slug } = await params;
  const card = await loadVisibleCard(await getDb(), slug);
  if (!card) notFound();

  const { event } = card;
  const sponsors = showSponsors(card).slice(0, 4);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="display text-2xl">Table card</h1>
          <p className="text-ash mt-1 text-sm">
            One per table, plus the doors and the back of the poster. Prints on A5.
          </p>
        </div>
        <p className="text-ash-dim max-w-xs text-xs leading-relaxed">
          The code points at whatever address this is being served from, so it works off
          a screen in a meeting and off paper at the venue.
        </p>
      </div>

      {/* ------------------------------------------------------ the card */}
      <article className="border-hairline bg-ink-2 relative mx-auto max-w-md border p-8 sm:p-10 print:max-w-none print:border-0 print:bg-white print:p-0 print:text-black">
        <div className="flex h-full flex-col items-center justify-between gap-8 text-center print:h-screen print:justify-around">
          <div className="flex flex-col items-center gap-3">
            {event.promoter.mark ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.promoter.mark}
                alt=""
                className="h-10 w-10 opacity-90 print:hidden"
              />
            ) : null}
            <span className="label print:text-black">{event.promoter.name}</span>
            <h2 className="display text-4xl sm:text-5xl print:text-black">{event.name}</h2>
            <p className="text-ash print:text-black/70 font-mono text-[0.55rem] uppercase tracking-[0.18em] sm:text-[0.6rem]">
              {formatEventDateShort(event.date)} · {event.venue}
            </p>
          </div>

          <div className="flex w-full flex-col items-center gap-4">
            <p className="display text-gold text-xl sm:text-2xl print:text-black">
              Scan for the full programme
            </p>
            <QrCode path={`/e/${event.slug}`} size={220} className="w-full" />
          </div>

          <div className="flex flex-col items-center gap-3">
            {/* Printed today and read at the venue, so with no running order in
                yet it promises the whole card rather than counting nothing. */}
            <p className="text-chalk print:text-black max-w-xs text-sm leading-relaxed">
              {tableCardNote(event.bouts.length)}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 opacity-80 print:hidden">
              {sponsors.map((sponsor) => (
                <SponsorLockup key={sponsor.id} sponsor={sponsor} size="sm" />
              ))}
            </div>
          </div>
        </div>
      </article>

      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <a
          href={`/e/${event.slug}`}
          className="border-hairline hover:border-chalk/40 label border px-4 py-2.5 transition-colors"
        >
          Open the programme
        </a>
      </div>
    </main>
  );
}
