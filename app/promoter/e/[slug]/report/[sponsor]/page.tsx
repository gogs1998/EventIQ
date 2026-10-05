import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/app/promoter/e/[slug]/report/PrintButton";
import { SponsorLockup } from "@/components/SponsorLockup";
import {
  SPONSOR_REPORT,
  reportAsOf,
  reportSummary,
  unplacedTapsNote,
} from "@/lib/copy";
import { getDb } from "@/lib/db";
import { loadOwnedReport } from "@/lib/db/sponsor-report";
import { currentPromoter } from "@/lib/session";
import { reportTimestamp, sponsorReport, type Placement } from "@/lib/sponsor-report";
import { boutBillingLabel, formatEventDate } from "@/lib/tape";

export const metadata: Metadata = {
  title: "Sponsor report — EventIQ",
  robots: { index: false },
};

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-hairline border p-3 print:w-32 print:p-2">
      <div className="label">{label}</div>
      {/* A nought is set as a nought. It is a count like any other. */}
      <div className="display tnum mt-1.5 text-2xl leading-none print:text-xl">
        {value.toLocaleString("en-GB")}
      </div>
    </div>
  );
}

/** What the placement is, which part of the card it is on, and what it did. */
function PlacementBlock({ placement }: { placement: Placement }) {
  const heading =
    placement.kind === "show"
      ? SPONSOR_REPORT.placement.show
      : placement.kind === "bout"
        ? `${SPONSOR_REPORT.placement.bout} · ${placement.label}`
        : `${SPONSOR_REPORT.placement.fighter} · ${placement.fighter.name}`;
  const detail =
    placement.kind === "bout"
      ? placement.matchup
      : placement.kind === "fighter" && placement.bout
        ? boutBillingLabel(placement.bout)
        : null;

  return (
    // On paper the figures sit beside the description rather than under it, so
    // a sponsor with a strip, a bout and three fighters still fits one sheet.
    <section className="report-block border-hairline border-t pt-5 print:flex print:items-start print:gap-6 print:pt-3">
      <div className="print:min-w-0 print:flex-1">
        <h3 className="display text-xl print:text-lg">{heading}</h3>
        {detail ? <p className="text-ash mt-1 text-sm">{detail}</p> : null}
        <p className="text-ash-dim mt-2 text-xs leading-relaxed print:mt-1">
          {SPONSOR_REPORT.where[placement.kind]}
        </p>
        {placement.kind === "bout" && placement.withdrawn ? (
          <p className="text-ash mt-2 text-xs leading-relaxed">{SPONSOR_REPORT.withdrawn}</p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 print:mt-0 print:flex print:shrink-0 print:gap-2">
        {placement.kind === "show" ? (
          <Figure label={SPONSOR_REPORT.figures.taps} value={placement.taps} />
        ) : placement.kind === "bout" ? (
          <>
            <Figure label={SPONSOR_REPORT.figures.opened} value={placement.opened} />
            <Figure label={SPONSOR_REPORT.figures.played} value={placement.played} />
          </>
        ) : (
          <>
            <Figure label={SPONSOR_REPORT.figures.taps} value={placement.taps} />
            <Figure label={SPONSOR_REPORT.figures.profileViews} value={placement.profileViews} />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * One sponsor's page, built to be saved as a PDF and sent to them.
 *
 * It is the promoter's document, so the promoter's name heads it and EventIQ is
 * a credit at the foot; the masthead and the controls do not print. The name is
 * set in the app's own type beside the emblem, never taken from artwork.
 */
export default async function SponsorReportPage({
  params,
}: PageProps<"/promoter/e/[slug]/report/[sponsor]">) {
  const { slug, sponsor: sponsorId } = await params;
  const promoter = await currentPromoter();
  if (!promoter) redirect(`/promoter/login?next=/promoter/e/${slug}/report/${sponsorId}`);

  const loaded = await loadOwnedReport(await getDb(), slug, promoter.id);
  if (!loaded) notFound();

  const { card, counts } = loaded;
  const report = sponsorReport(card, counts, sponsorId);
  if (!report) notFound();

  const { event } = card;
  const unplaced = unplacedTapsNote(report.unplacedTaps);

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/promoter/e/${event.slug}/report`}
          className="border-hairline hover:border-chalk/40 label border px-3 py-2 transition-colors"
        >
          {SPONSOR_REPORT.indexHeading}
        </Link>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </div>

      <article className="sponsor-report border-hairline bg-ink-2/60 border p-6 sm:p-8 print:border-0 print:p-0">
        <header>
          <span className="label">{event.promoter.name}</span>
          <h1 className="display mt-2 text-3xl">{SPONSOR_REPORT.title}</h1>
          <p className="text-ash mt-2 text-sm">
            {event.name} · {formatEventDate(event.date)} · {event.venue}, {event.city}
          </p>
        </header>

        <div className="border-hairline mt-6 border-t pt-6 print:mt-4 print:pt-4">
          <SponsorLockup sponsor={report.sponsor} size="lg" />
          <p className="text-chalk mt-4 text-sm leading-relaxed">
            {reportSummary(report.sponsor.name, event.name, report.taps)}
          </p>
          {unplaced ? <p className="text-ash mt-2 text-xs leading-relaxed">{unplaced}</p> : null}
          {card.published ? null : (
            <p className="text-ash mt-2 text-xs leading-relaxed">{SPONSOR_REPORT.unpublished}</p>
          )}
        </div>

        <div className="mt-6 grid gap-6 print:mt-4 print:gap-3">
          {report.placements.map((placement) => (
            <PlacementBlock
              key={
                placement.kind === "show"
                  ? "show"
                  : placement.kind === "bout"
                    ? `bout-${placement.bout.number}`
                    : `fighter-${placement.fighter.id}`
              }
              placement={placement}
            />
          ))}
        </div>

        <section className="report-block border-hairline mt-6 border-t pt-5 print:mt-3 print:flex print:items-start print:gap-6 print:pt-3">
          <div className="print:min-w-0 print:flex-1">
            <h3 className="display text-xl print:text-lg">{SPONSOR_REPORT.programmeHeading}</h3>
            <p className="text-ash-dim mt-2 text-xs leading-relaxed print:mt-1">
              {SPONSOR_REPORT.programmeNote}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 print:mt-0 print:flex print:shrink-0 print:gap-2">
            <Figure label={SPONSOR_REPORT.figures.opens} value={report.programme.opens} />
            <Figure label={SPONSOR_REPORT.figures.visits} value={report.programme.visits} />
          </div>
        </section>

        <footer className="report-block border-hairline text-ash-dim mt-8 grid gap-2 border-t pt-5 text-[0.7rem] leading-relaxed print:mt-4 print:gap-1 print:pt-3">
          {SPONSOR_REPORT.method.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-2 font-mono uppercase tracking-[0.14em]">
            {reportAsOf(reportTimestamp(new Date()))} · {SPONSOR_REPORT.credit}
          </p>
        </footer>
      </article>
    </main>
  );
}
