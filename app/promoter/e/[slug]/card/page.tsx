import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddBoutForm } from "@/app/promoter/e/[slug]/card/AddBoutForm";
import { AddSponsorForm } from "@/app/promoter/e/[slug]/card/AddSponsorForm";
import { BoutRow } from "@/app/promoter/e/[slug]/card/BoutRow";
import { EventForm } from "@/app/promoter/e/[slug]/card/EventForm";
import { SponsorRow } from "@/app/promoter/e/[slug]/card/SponsorRow";
import { boutsTopDown, cornersOf } from "@/lib/card";
import {
  EMPTY_CARD_EDITOR,
  EMPTY_SPONSORS,
  boutCountLabel,
  boutsOffLabel,
} from "@/lib/copy";
import { getDb } from "@/lib/db";
import { currentPromoter } from "@/lib/session";
import { loadOwnedCard } from "@/lib/visibility";

export const metadata: Metadata = {
  title: "Edit the card — EventIQ",
  robots: { index: false },
};

/**
 * The add-bout form and the two sentences around it.
 *
 * One component rather than two copies of the markup, because the page draws it
 * in one of two places depending on whether the card has anything on it — and
 * the sentence under the heading differs: a promoter with an empty card is being
 * told what a bout brings with it, and a promoter with fourteen already knows.
 */
function AddBout({ slug, empty = false }: { slug: string; empty?: boolean }) {
  return (
    <section className="mt-12">
      <h2 className="display text-2xl">{empty ? "Add the first bout" : "Add a bout"}</h2>
      <p className="text-ash mt-2 max-w-2xl text-xs leading-relaxed">
        {empty
          ? "Two names is enough to start with. Both fighters get an invite link straight away, and everything else on this bout can be filled in later."
          : "Goes on top of the running order, so entering a card from the openers up matches the sheet. Both fighters get an invite link straight away."}
      </p>
      <AddBoutForm slug={slug} />
    </section>
  );
}

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

  const card = await loadOwnedCard(await getDb(), slug, promoter.id);
  if (!card) notFound();

  const { event } = card;
  const sponsors = Object.values(card.sponsors);
  // The bouts that can actually be listed and edited, so the count at the top
  // agrees with the rows underneath it.
  const bouts = boutsTopDown(card);
  // Withdrawn bouts are still listed and still editable — they keep their number
  // and their sponsor — so they are counted in the total and named separately.
  const off = boutsOffLabel(bouts.filter((bout) => bout.cancelled).length);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="border-hairline border-b pb-6">
        <Link href={`/promoter/e/${event.slug}`} className="label hover:text-chalk">
          ← Back to the dashboard
        </Link>
        <h1 className="display mt-3 text-4xl">Edit {event.name}</h1>
      </header>

      {/* Shut on a card with nothing on it. Every box in it was filled in on the
          way here — the new-show form asks for exactly these — so on a
          promoter's first visit it is a screenful of answers they have just
          given, standing between them and the only thing this page is for. It
          stays open on a card with a running order, where coming here to change
          a venue or a door time is ordinary. */}
      <section className="mt-8">
        <details className="group" open={bouts.length > 0}>
          {/* A summary with its marker taken off and nothing beside it reads as
              a heading with a section missing, so it says what is inside and
              carries the same +/− the bout rows use. */}
          <summary className="flex cursor-pointer list-none items-baseline gap-3">
            <span className="display text-2xl">The show</span>
            <span className="label">Name, date, venue and times</span>
            <span aria-hidden className="text-ash-dim ml-auto text-lg">
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <EventForm slug={event.slug} event={event} />
        </details>
      </section>

      <section className="mt-12">
        <div className="border-hairline mb-4 flex items-end justify-between border-b pb-2">
          <h2 className="display text-2xl">Running order</h2>
          <span className="label">
            {boutCountLabel(bouts.length)}
            {off ? ` · ${off}` : ""}
          </span>
        </div>

        {bouts.length ? (
          <>
            <p className="text-ash mb-5 max-w-2xl text-xs leading-relaxed">
              Listed main event first, the way the programme shows it. Bout numbers run the
              other way, from the opener up, because that is how a running order is called.
            </p>

            <div className="grid gap-3">
              {bouts.map((bout) => {
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

      {/* Always here, and never moved above the list on an empty card, however
          tempting that is. Moving it changes where it sits among its siblings,
          which remounts it — and it is the component that says a bout went on,
          so the first bout of a card announced itself and vanished in the same
          frame. What brings it up the page on an empty card instead is the event
          details above being shut and the list above it being one sentence. */}
      <AddBout slug={event.slug} empty={bouts.length === 0} />

      <section className="mt-12">
        <h2 className="display text-2xl">Sponsors</h2>
        <p className="text-ash mt-2 max-w-2xl text-xs leading-relaxed">
          Add them here and they become selectable against any bout above. An emblem can
          come up with them; the name is set in the app&rsquo;s own type either way, so it
          can never come out misspelled.
        </p>

        {/* The ones already on the account, so an emblem can be changed or taken
            off after the sponsor was added rather than only as it is created —
            the alternative was deleting the sponsor, which takes every bout
            placement sold against it. */}
        {sponsors.length ? (
          <div className="mt-4 grid gap-3">
            {sponsors.map((sponsor) => (
              <SponsorRow key={sponsor.id} slug={event.slug} sponsor={sponsor} />
            ))}
          </div>
        ) : (
          // An account with no sponsors on it used to get a heading, a blurb and
          // then a form, with nothing saying that the empty space above the
          // form was a book of sponsors rather than a section still loading.
          <p className="border-hairline text-ash mt-4 max-w-2xl border p-3 text-xs leading-relaxed">
            {EMPTY_SPONSORS}
          </p>
        )}

        <h3 className="label mt-8">Add a sponsor</h3>
        <AddSponsorForm slug={event.slug} />
      </section>
    </main>
  );
}
