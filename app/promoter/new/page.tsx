import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewEventForm } from "@/app/promoter/NewEventForm";
import { currentPromoter } from "@/lib/session";

export const metadata: Metadata = {
  title: "New show — EventIQ",
  robots: { index: false },
};

/**
 * The new-show form on a page of its own.
 *
 * It used to live only on the promoter's index, and the index sends a promoter
 * with exactly one show straight to that show, which is the right thing for the
 * commonest case and meant the form could never be reached again once the
 * first show existed. A promoter's second card is the moment this stops being
 * a demo, so the form has an address the dashboard can link to (bug 45).
 */
export default async function NewShow() {
  const promoter = await currentPromoter();
  if (!promoter) redirect("/promoter/login?next=/promoter/new");

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="border-hairline border-b pb-6">
        <span className="label">Promoter</span>
        <h1 className="display mt-2 text-4xl">New show</h1>
        <p className="text-ash mt-3 text-sm leading-relaxed">
          A name and a date make a programme. Everything else can be filled in from the
          card once it exists, and nothing is public until you publish it.
        </p>
      </header>
      <section className="mt-8">
        <NewEventForm />
      </section>
      <p className="mt-8">
        <Link href="/promoter" className="text-ash-dim hover:text-chalk text-xs transition-colors">
          Back to your shows
        </Link>
      </p>
    </main>
  );
}
