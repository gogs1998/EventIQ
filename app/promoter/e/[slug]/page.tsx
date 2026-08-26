import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InviteLink } from "@/app/promoter/e/[slug]/InviteLink";
import { PublishToggle } from "@/app/promoter/e/[slug]/PublishToggle";
import { SignOutButton } from "@/app/promoter/SignOutButton";
import { NudgeButton } from "@/components/promoter/NudgeButton";
import { SponsorLockup } from "@/components/SponsorLockup";
import { getDb } from "@/lib/db";
import {
  analyticsTotals,
  loadCard,
  loadInvites,
  loadRenders,
  previousShow,
  sponsorTaps,
} from "@/lib/db/queries";
import { cx } from "@/lib/cx";
import {
  DONE_AT,
  INVITE_LABEL,
  boutReadiness,
  chaseList,
  daysUntilShow,
  eventProgress,
  nudgeMessage,
  sponsorFor,
  sponsorInventory,
} from "@/lib/promoter";
import { currentPromoter } from "@/lib/session";
import { SITE_URL } from "@/lib/site";
import { boutBillingLabel, boutClassLine, formatEventDate, lastName } from "@/lib/tape";
import type { InviteStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Promoter view — EventIQ",
  robots: { index: false },
};

function Stat({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "warn" | "good";
}) {
  return (
    <div className="border-hairline bg-ink-2/60 border p-4">
      <div className="label">{label}</div>
      <div
        className={cx(
          "display tnum mt-2 text-3xl leading-none",
          tone === "warn" && "text-red-corner-hot",
          tone === "good" && "text-gold",
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-ash-dim mt-1.5 text-[0.7rem]">{sub}</div> : null}
    </div>
  );
}

function Meter({ score }: { score: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="bg-panel h-1.5 w-14 shrink-0 overflow-hidden sm:w-24">
        <div
          className={cx(
            "h-full",
            score >= DONE_AT ? "bg-gold" : score > 0 ? "bg-red-corner" : "bg-ash-dim",
          )}
          style={{ width: `${Math.max(score, 2)}%` }}
        />
      </div>
      <span className="tnum text-ash w-8 shrink-0 text-right font-mono text-[0.65rem]">
        {score}%
      </span>
    </div>
  );
}

/** Fixed width so the badges line up as a column rather than ragging. */
function Badge({ className, children }: { className?: string; children: string }) {
  return (
    <span
      className={cx(
        "shrink-0 border px-1.5 py-1 text-center font-mono text-[0.5rem] leading-none uppercase tracking-[0.12em]",
        "w-[7.5rem]",
        className,
      )}
    >
      {children}
    </span>
  );
}

const INVITE_STYLE: Record<InviteStatus, string> = {
  opened: "border-gold/50 text-gold",
  sent: "border-hairline text-ash",
  "not-sent": "border-red-corner/50 text-red-corner-hot",
  submitted: "border-hairline text-ash-dim",
};

const STATE_STYLE = {
  ready: { label: "Ready", className: "text-gold border-gold/40" },
  lopsided: { label: "One side missing", className: "text-red-corner-hot border-red-corner/40" },
  empty: { label: "Nothing in", className: "text-ash-dim border-hairline" },
} as const;

export default async function PromoterEventPage({ params }: PageProps<"/promoter/e/[slug]">) {
  const { slug } = await params;
  const promoter = await currentPromoter();
  if (!promoter) redirect(`/promoter/login?next=/promoter/e/${slug}`);

  const db = await getDb();
  const card = await loadCard(db, slug);
  // Somebody else's show and a show that does not exist give the same answer, so
  // this page cannot be used to find out which promoters run what.
  if (!card || card.promoterId !== promoter.id) notFound();

  const { event } = card;
  const invites = await loadInvites(db, card.eventId);
  const renders = await loadRenders(db, card.eventId);
  const progress = eventProgress(card, invites);
  const chase = chaseList(card, invites);
  const bouts = boutReadiness(card, invites);
  const inventory = sponsorInventory(card);
  const days = daysUntilShow(event.date);
  const rendered = event.bouts.filter((bout) => renders[bout.number]).length;

  const previous = await previousShow(db, promoter.id, event.date);
  const last = previous
    ? {
        event: previous,
        totals: await analyticsTotals(db, previous.id),
        taps: await sponsorTaps(db, previous.id),
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* ------------------------------------------------------------ head */}
      <header className="border-hairline border-b pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="label">Promoter view</span>
            <h1 className="display mt-2 text-4xl">{event.name}</h1>
            <p className="text-ash mt-2 text-sm">
              {formatEventDate(event.date)} · {event.venue}, {event.city}
            </p>
          </div>
          {/* Baseline row on a phone, stacked block on a desktop. */}
          <div className="flex items-baseline gap-3 sm:block sm:text-right">
            <div className="display text-gold text-4xl leading-none">{days}</div>
            <div className="label sm:mt-1">Days to go</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <PublishToggle slug={event.slug} published={card.published} />
          <Link
            href={`/e/${event.slug}`}
            className="border-hairline hover:border-chalk/40 label border px-3 py-2 transition-colors"
          >
            View the programme
          </Link>
          <Link
            href={`/promoter/e/${event.slug}/card`}
            className="border-hairline hover:border-chalk/40 label border px-3 py-2 transition-colors"
          >
            Edit the card
          </Link>
          <Link
            href={`/e/${event.slug}/qr`}
            className="border-hairline hover:border-chalk/40 label border px-3 py-2 transition-colors"
          >
            Table card
          </Link>
          <div className="ml-auto">
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ stats */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Profiles finished"
          value={`${progress.done}/${progress.total}`}
          sub={`${progress.percent}% of the card, ${progress.averageScore}% filled on average`}
          tone={progress.percent < 60 ? "warn" : "good"}
        />
        <Stat
          label="Bouts ready"
          value={`${bouts.filter((b) => b.state === "ready").length}/${bouts.length}`}
          sub={`${bouts.filter((b) => b.state === "lopsided").length} with one side missing`}
        />
        <Stat
          label="Bout sponsors sold"
          value={`${inventory.sold.length}/${event.bouts.length}`}
          sub={`${inventory.unsold.length} slots still available`}
          tone={inventory.unsold.length > 0 ? "warn" : "good"}
        />
        <Stat
          label="Videos rendered"
          value={`${rendered}/${event.bouts.length}`}
          sub="Head to head, ready to post"
        />
      </section>

      {/* ------------------------------------------------------------ chase */}
      <section className="mt-10">
        <div className="border-hairline mb-3 flex flex-wrap items-end justify-between gap-2 border-b pb-2">
          <h2 className="display text-2xl">Who to chase</h2>
          <span className="label">{chase.length} outstanding</span>
        </div>
        <p className="text-ash mb-5 max-w-2xl text-xs leading-relaxed">
          Top of the card first, because a gap in the main event costs more than a gap in
          bout two. Copy pastes a message naming their bout, their opponent, their own
          link, and — only where it&rsquo;s true — that the other one has already sent
          theirs.
        </p>

        {chase.length ? (
          <div className="border-hairline divide-hairline divide-y border">
            {chase.map((row) => (
              <div
                key={`${row.bout.number}-${row.fighter.id}`}
                className="p-3 sm:flex sm:items-center sm:gap-4"
              >
                <div className="min-w-0 sm:flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="display text-chalk text-base">{row.fighter.name}</span>
                    <span className="text-ash-dim text-[0.7rem]">{row.fighter.gym}</span>
                  </div>
                  <div className="text-ash-dim mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.14em]">
                    {boutBillingLabel(row.bout)} · v {lastName(row.opponent)}
                    {row.behind.length >= 2 ? (
                      <span className="text-red-corner-hot"> · behind on {row.behind.length}</span>
                    ) : null}
                  </div>
                  {row.invite ? (
                    <div className="mt-2">
                      <InviteLink
                        slug={event.slug}
                        fighterId={row.fighter.id}
                        token={row.invite.token}
                        sent={!!row.invite.sentAt}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2 sm:mt-0 sm:justify-start sm:gap-4">
                  <Badge className={INVITE_STYLE[row.status]}>{INVITE_LABEL[row.status]}</Badge>
                  <Meter score={row.score} />
                  <NudgeButton
                    name={row.fighter.name}
                    message={nudgeMessage(row, event, SITE_URL)}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-hairline text-gold border p-4 text-sm">
            Nobody. Every profile on the card is finished.
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- readiness */}
      <section className="mt-10">
        <div className="border-hairline mb-3 flex items-end justify-between border-b pb-2">
          <h2 className="display text-2xl">The card</h2>
          <span className="label">{bouts.length} bouts</span>
        </div>
        <p className="text-ash mb-5 max-w-2xl text-xs leading-relaxed">
          A bout with one finished fighter and one blank looks worse than two blanks, so
          those are called out first.
        </p>

        <div className="border-hairline divide-hairline divide-y border">
          {bouts.map(({ bout, red, blue, state }) => {
            const sponsor = sponsorFor(card, bout);
            const style = STATE_STYLE[state];
            return (
              <div key={bout.number} className="p-3 sm:flex sm:items-center sm:gap-4">
                <div className="flex items-center justify-between gap-3 sm:w-56 sm:shrink-0 sm:justify-start">
                  <div className="display text-chalk w-24 shrink-0 text-sm">
                    {boutBillingLabel(bout)}
                  </div>
                  <Badge className={style.className}>{style.label}</Badge>
                </div>

                <div className="mt-1.5 min-w-0 sm:mt-0 sm:flex-1">
                  <div className="text-chalk truncate text-sm">
                    {lastName(red.fighter)}
                    <span className="text-ash-dim"> v </span>
                    {lastName(blue.fighter)}
                  </div>
                  <div className="text-ash-dim truncate text-[0.65rem]">
                    {boutClassLine(bout)}
                  </div>
                </div>

                <div className="mt-2 sm:mt-0 sm:w-40 sm:shrink-0">
                  {sponsor ? (
                    <SponsorLockup sponsor={sponsor} size="sm" />
                  ) : (
                    <span className="text-red-corner-hot font-mono text-[0.5rem] uppercase tracking-[0.14em]">
                      Sponsor unsold
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- last show */}
      <section className="mt-10">
        <div className="border-hairline mb-3 flex items-end justify-between border-b pb-2">
          <h2 className="display text-2xl">Last show</h2>
          <span className="label">{last ? last.event.name : "No previous show"}</span>
        </div>
        <p className="text-ash mb-5 max-w-2xl text-xs leading-relaxed">
          What a sponsor gets sent afterwards. Not a favour any more — a number. These are
          counted from the programme itself, so a sponsor who checks them finds them true.
        </p>

        {last ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="Programme opens"
              value={last.totals.programme_open.toLocaleString("en-GB")}
              sub={`${last.totals.spectators.toLocaleString("en-GB")} separate spectators`}
            />
            <Stat
              label="Bouts expanded"
              value={last.totals.bout_expand.toLocaleString("en-GB")}
              sub="People reading the tape, not just the running order"
            />
            <Stat
              label="Tapes played"
              value={last.totals.tape_play.toLocaleString("en-GB")}
              sub="The head-to-head video, started"
            />
            <Stat
              label="Sponsor taps"
              value={last.totals.sponsor_tap.toLocaleString("en-GB")}
              sub={`Across ${Object.keys(last.taps).length} sponsors`}
            />
            <Stat
              label="Profiles opened"
              value={last.totals.profile_view.toLocaleString("en-GB")}
              sub="A fighter's own page, deep-linked"
            />
            <Stat
              label="Cost to print"
              value="£0"
              sub="No programmes, no reprints when the card changes"
            />
          </div>
        ) : (
          <p className="border-hairline text-ash border p-4 text-sm leading-relaxed">
            {event.name} is your first show on here, so there is nothing to report yet.
            Counting starts the moment the first person scans the code, and this panel
            fills in on its own.
          </p>
        )}
      </section>

      <footer className="border-hairline text-ash-dim mt-10 border-t pt-6 text-xs leading-relaxed">
        <p>
          Numbers on this page are counted from real interactions or shown as zero. None
          of them are estimated.
        </p>
        <Link href="/" className="hover:text-chalk mt-3 inline-block transition-colors">
          Back to EventIQ
        </Link>
      </footer>
    </main>
  );
}
