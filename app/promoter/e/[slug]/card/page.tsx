import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddBoutForm } from "@/app/promoter/e/[slug]/card/AddBoutForm";
import { AddSponsorForm } from "@/app/promoter/e/[slug]/card/AddSponsorForm";
import { BoutRow } from "@/app/promoter/e/[slug]/card/BoutRow";
import { EventForm } from "@/app/promoter/e/[slug]/card/EventForm";
import { boutsTopDown, cornersOf } from "@/lib/card";
import { EMPTY_CARD_EDITOR, boutCountLabel } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { loadCard } from "@/lib/db/queries";
import { currentPromoter } from "@/lib/session";

export const metadata: Metadata = {
  title: "Edit the card — EventIQ",
  robots: { index: false },
};

/**
 * The running order, editable.
 *
 * Laid out as one row per bout because that is how the matchmaking sheet a
 * promoter is copying from is laid out. Every row saves on its own, so a card
 * being entered over three phone calls never has to be finished in one sitting.
 */
export default async function EditCardPage({ params }: PageProps<"/promoter/e/[slug]/card">) {
  const { slug } = await params;
  const promoter = await currentPromoter();
  if (!promoter) redirect(`/promoter/login?next=/promoter/e/${slug}/card`);

  const card = await loadCard(await getDb(), slug);
  if (!card || card.promoterId !== promoter.id) notFound();

  const { event } = card;
  const sponsors = Object.values(card.sponsors);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="border-hairline border-b pb-6">
        <Link href={`/promoter/e/${event.slug}`} className="label hover:text-chalk">
          ← Back to the dashboard
        </Link>
        <h1 className="display mt-3 text-4xl">Edit {event.name}</h1>
      </header>

      <section className="mt-8">
        <h2 className="display text-2xl">The show</h2>
        <EventForm slug={event.slug} event={event} />
      </section>

      <section className="mt-12">
        <div className="border-hairline mb-4 flex items-end justify-between border-b pb-2">
          <h2 className="display text-2xl">Running order</h2>
          <span className="label">{boutCountLabel(event.bouts.length)}</span>
        </div>

        {event.bouts.length ? (
          <>
            <p className="text-ash mb-5 max-w-2xl text-xs leading-relaxed">
              Listed main event first, the way the programme shows it. Bout numbers run the
              other way, from the opener up, because that is how a running order is called.
            </p>

            <div className="grid gap-3">
              {boutsTopDown(card).map((bout) => {
                const { red, blue } = cornersOf(card, bout);
                return (
                  <BoutRow
                    key={bout.number}
                    slug={event.slug}
                    bout={bout}
                    red={red}
                    blue={blue}
                    sponsors={sponsors}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-ash max-w-2xl text-sm leading-relaxed">{EMPTY_CARD_EDITOR}</p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="display text-2xl">Add a bout</h2>
        <p className="text-ash mt-2 max-w-2xl text-xs leading-relaxed">
          Goes on top of the running order, so entering a card from the openers up matches
          the sheet. Both fighters get an invite link straight away.
        </p>
        <AddBoutForm slug={event.slug} />
      </section>

      <section className="mt-12">
        <h2 className="display text-2xl">Sponsors</h2>
        <p className="text-ash mt-2 max-w-2xl text-xs leading-relaxed">
          Add them here and they become selectable against any bout above. Emblems are
          uploaded with the asset pipeline for now; the name is set in the app&rsquo;s own
          type either way, so it can never come out misspelled.
        </p>
        <AddSponsorForm slug={event.slug} />
      </section>
    </main>
  );
}
