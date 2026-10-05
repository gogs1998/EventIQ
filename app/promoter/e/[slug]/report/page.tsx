import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SponsorLockup } from "@/components/SponsorLockup";
import { SPONSOR_REPORT, reportTapLabel } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { loadOwnedReport } from "@/lib/db/sponsor-report";
import { currentPromoter } from "@/lib/session";
import { reportableSponsors, sponsorReport } from "@/lib/sponsor-report";
import { formatEventDate } from "@/lib/tape";

export const metadata: Metadata = {
  title: "Sponsor reports — EventIQ",
  robots: { index: false },
};

/**
 * Every sponsor on a show, each with the way to their own page.
 *
 * One page per sponsor rather than one report for the show, because the page is
 * sent to the sponsor and each sponsor is owed their own figures and nobody
 * else's.
 */
export default async function SponsorReportsPage({
  params,
}: PageProps<"/promoter/e/[slug]/report">) {
  const { slug } = await params;
  const promoter = await currentPromoter();
  if (!promoter) redirect(`/promoter/login?next=/promoter/e/${slug}/report`);

  const report = await loadOwnedReport(await getDb(), slug, promoter.id);
  if (!report) notFound();

  const { card, counts } = report;
  const { event } = card;
  const sponsors = reportableSponsors(card, counts);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="border-hairline border-b pb-6">
        <span className="label">Promoter view</span>
        <h1 className="display mt-2 text-4xl">{SPONSOR_REPORT.indexHeading}</h1>
        <p className="text-ash mt-2 text-sm">
          {event.name} · {formatEventDate(event.date)}
        </p>
        <p className="text-ash mt-4 max-w-2xl text-sm leading-relaxed">
          {SPONSOR_REPORT.indexNote}
        </p>
        <Link
          href={`/promoter/e/${event.slug}`}
          className="border-hairline hover:border-chalk/40 label mt-5 inline-block border px-3 py-2 transition-colors"
        >
          {SPONSOR_REPORT.back}
        </Link>
      </header>

      {sponsors.length ? (
        <ul className="border-hairline divide-hairline mt-8 divide-y border">
          {sponsors.map((sponsor) => {
            const taps = sponsorReport(card, counts, sponsor.id)?.taps ?? 0;
            return (
              <li key={sponsor.id} className="flex flex-wrap items-center gap-4 p-4">
                <SponsorLockup sponsor={sponsor} className="min-w-0 flex-1" />
                <span className="text-ash-dim font-mono text-[0.6rem] uppercase tracking-[0.14em]">
                  {reportTapLabel(taps)}
                </span>
                <Link
                  href={`/promoter/e/${event.slug}/report/${sponsor.id}`}
                  className="border-hairline hover:border-chalk/40 label border px-3 py-2 transition-colors"
                >
                  {SPONSOR_REPORT.open}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-hairline text-ash mt-8 border p-4 text-sm leading-relaxed">
          {SPONSOR_REPORT.indexEmpty}
        </p>
      )}
    </main>
  );
}
