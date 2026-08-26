import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewEventForm } from "@/app/promoter/NewEventForm";
import { SignOutButton } from "@/app/promoter/SignOutButton";
import { getDb } from "@/lib/db";
import { loadPromoterEvents } from "@/lib/db/queries";
import { daysUntilShow } from "@/lib/promoter";
import { currentPromoter } from "@/lib/session";
import { formatEventDate } from "@/lib/tape";

export const metadata: Metadata = {
  title: "Your shows — EventIQ",
  robots: { index: false },
};

export default async function PromoterHome() {
  const promoter = await currentPromoter();
  if (!promoter) redirect("/promoter/login?next=/promoter");

  const events = await loadPromoterEvents(await getDb(), promoter.id);

  // One show is the normal case, and making somebody click through a list of one
  // to get to the thing they came for is the sort of friction that makes
  // software feel like paperwork.
  if (events.length === 1) redirect(`/promoter/e/${events[0].slug}`);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="border-hairline flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <span className="label">Promoter</span>
          <h1 className="display mt-2 text-4xl">{promoter.name}</h1>
        </div>
        <SignOutButton />
      </header>

      <section className="mt-8">
        <h2 className="display text-2xl">Your shows</h2>
        {events.length ? (
          <div className="border-hairline divide-hairline mt-4 divide-y border">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/promoter/e/${event.slug}`}
                className="hover:bg-panel/40 flex items-center justify-between gap-4 p-4 transition-colors"
              >
                <div className="min-w-0">
                  <div className="display text-chalk truncate text-lg">{event.name}</div>
                  <div className="text-ash-dim mt-0.5 text-xs">
                    {formatEventDate(event.date)} · {event.venue}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="display text-gold text-2xl leading-none">
                    {daysUntilShow(event.date)}
                  </div>
                  <div className="label mt-1">
                    {event.published ? "Live" : "Not published"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-ash mt-4 text-sm leading-relaxed">
            Nothing yet. Put the running order in below and you have a programme.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl">New show</h2>
        <NewEventForm />
      </section>
    </main>
  );
}
