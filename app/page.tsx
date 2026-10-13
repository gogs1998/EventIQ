import Link from "next/link";
import { preload } from "react-dom";
import { DemoReel } from "@/components/DemoReel";
import { HeroVideo } from "@/components/HeroVideo";
import { ScreenGallery } from "@/components/ScreenGallery";
import { TapePlayer } from "@/components/sequence/TapePlayer";
import { cardCompleteness, featuredBout } from "@/lib/card";
import {
  chaseHeading,
  chaseNote,
  GALLERY,
  HERO,
  NO_SHOWCASE,
  PITCH,
  PRIVACY,
  programmeLinkNote,
  SHOWS_LINK,
  sponsorNote,
  tapeForEveryBout,
} from "@/lib/copy";
import { getDb, readVar } from "@/lib/db";
import { loadRenders, loadShowcase } from "@/lib/db/queries";
import { daysUntilShow, DONE_AT, sponsorInventory } from "@/lib/promoter";
import { formatEventDateShort } from "@/lib/tape";

const steps = [
  {
    n: "01",
    // It used to read "Send us the running order … we build the programme from
    // it", which is not what happens: a promoter types the card in themselves on
    // their own dashboard, and a promoter who signed in expecting to send a
    // sheet somewhere would find a form and no address to send it to.
    title: "Put the running order in",
    body: "The same sheet you send the printer. Bouts, weights, gyms, corners. The programme is built from it as you type.",
  },
  {
    n: "02",
    title: "Every fighter gets one link",
    body: "No app, no account, no password. It goes out on WhatsApp and it opens straight onto their own form on their phone.",
  },
  {
    n: "03",
    title: "Why they fill it in",
    body: "Because it puts their photo, their Instagram and their sponsors in front of the whole room, and because they get a broadcast video of their own tale of the tape to post. If they are already on Sherdog or Tapology they paste the link and their record fills itself in.",
  },
  {
    n: "04",
    title: "One code on the tables",
    body: "Everyone scans. Nothing goes to print, so the card can still change an hour before doors.",
  },
];

/** Timings read off the recording itself, not off the tour script. */
const reel = [
  { at: "0:05", what: "The code that goes on the table" },
  { at: "0:12", what: "The running order on a phone" },
  { at: "0:21", what: "One bout opened out into the tale of the tape" },
  { at: "0:28", what: "The videos, made from the fighters' own photographs" },
  { at: "0:40", what: "A fighter's page, kept from show to show" },
  { at: "0:48", what: "Every show, in one list" },
  { at: "0:56", what: "The promoter's chase list, and the link it sends" },
  { at: "1:07", what: "Pasting the running order in, and the preview" },
  { at: "1:16", what: "The videos panel, and what has been shared" },
];

const audiences = [
  {
    who: "The spectator in row four",
    gets: "A reason to care about bout four, and a story to put to the name of whoever is walking out.",
  },
  {
    who: "The fighter",
    gets: "A profile, a record, a photo, their gym credited, their Instagram one tap away, their sponsors seen, and a video of their own walkout card.",
  },
  {
    who: "You",
    gets: "A show that looks like a professional operation, and sponsor slots you can price properly.",
  },
];

/**
 * Every figure below is counted at request time, so prerendering this would
 * freeze them at whatever they were when the Worker was last deployed. A page
 * whose whole argument is "these numbers are real" cannot be a snapshot.
 */
export const dynamic = "force-dynamic";

/**
 * A 10-second cut of the main event's render, 720 wide and under a megabyte,
 * made with ffmpeg from public/renders/bout-15.mp4. The poster is its first
 * frame, so the loop starting is not a jump.
 */
const HERO_VIDEO = "/hero/hero-faceoff.mp4";
const HERO_POSTER = "/hero/hero-faceoff.webp";

/** One monoline mark per difference, in the order PITCH lists them. */
function DifferenceIcon({ index }: { index: number }) {
  const paths = [
    // A form on a phone.
    "M7 2.75h10a1.25 1.25 0 0 1 1.25 1.25v16a1.25 1.25 0 0 1-1.25 1.25H7A1.25 1.25 0 0 1 5.75 20V4A1.25 1.25 0 0 1 7 2.75ZM9 7.5h6M9 11h6M9 14.5h3.5",
    // Play.
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM10 8.5v7l5.5-3.5L10 8.5Z",
    // A count going up.
    "M4 20h16M6.5 16.5v-4M11 16.5V9M15.5 16.5v-6M20 4l-5 4.5-3-2.5-6 4.5",
  ];
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="text-gold mt-0.5 h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[index] ?? paths[0]} />
    </svg>
  );
}

/**
 * The pitch page runs on the show named in SHOWCASE_SLUG, not on a fixture and
 * no longer on whatever happens to be published with the furthest-out date.
 *
 * Every number in the prose below is counted from that card. It is the same data
 * the programme and the dashboard read, so the sales copy cannot quietly drift
 * away from what a promoter sees when they click through — which is exactly the
 * kind of thing that gets noticed in a meeting. What it must not do is drift
 * onto *somebody else's* card: with a second promoter on the instance, "the
 * latest published show" is a sentence that hands EventIQ's own front page to
 * whoever publishes a show dated furthest out.
 *
 * With no showcase the argument is unchanged and the card comes out of it. Every
 * section that counts a card, plays its video or links into it is behind a
 * check, so an instance that has not named a show still makes the pitch rather
 * than showing a page of holes.
 */
export default async function PitchPage() {
  // The poster is the first paint of the page on a phone, so it is asked for
  // ahead of the stylesheet that would otherwise discover it.
  preload(HERO_POSTER, { as: "image", fetchPriority: "high" });
  const db = await getDb();
  const card = await loadShowcase(db, await readVar("SHOWCASE_SLUG"));

  const event = card?.event;
  const renders = card ? await loadRenders(db, card.eventId) : {};
  const main = card ? featuredBout(card) : undefined;
  // done and total are the same measurement the chase list filters on — both are
  // completeness against DONE_AT over the fighters on the card — so who is
  // outstanding is the remainder of it. It used to be counted by loading every
  // invite row for the show and running the chase list over them, which is a
  // whole table read for a number the card already holds, and no invite took
  // part in the answer.
  const { score, done, total } = card
    ? cardCompleteness(card, DONE_AT)
    : { score: 0, done: 0, total: 0 };
  const outstanding = total - done;
  const inventory = card ? sponsorInventory(card) : null;

  return (
    <main id="main" tabIndex={-1} className="w-full">
      {/* ------------------------------------------------------------ hero */}
      {/* The first phone screen is a fighter, the headline, the price and a
          button, in that order. It used to be a headline and four blocks of grey
          text, which made the argument for the video without showing one. The
          loop is a cut of a real bout render, so the first thing a promoter sees
          is the thing their fighters would get. */}
      <section className="relative">
        <div className="mx-auto grid max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-center lg:gap-12 lg:px-5 lg:py-16">
          <figure className="relative lg:order-2">
            {/* The frame holds the loop's shape before a byte of it arrives, so
                nothing below it moves when it does. */}
            <div className="lg:border-hairline relative aspect-[5/4] w-full overflow-hidden bg-ink-2 lg:border">
              <HeroVideo
                src={HERO_VIDEO}
                poster={HERO_POSTER}
                label={HERO.video}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                aria-hidden
                className="from-ink via-ink/40 absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t to-transparent lg:hidden"
              />
            </div>
            <figcaption className="label text-ash-dim mt-3 hidden lg:block">{HERO.video}</figcaption>
          </figure>

          <div className="relative z-10 -mt-14 px-5 pb-12 lg:order-1 lg:mt-0 lg:px-0 lg:pb-0">
            <p className="bg-gold text-ink inline-block px-2.5 py-1 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
              {HERO.free}
            </p>
            <h1 className="display anim-slam mt-4 text-[2.9rem] leading-[0.9] sm:text-6xl lg:text-7xl">
              {HERO.headline}
            </h1>
            <p className="text-chalk/85 mt-4 max-w-xl text-base leading-snug sm:text-lg lg:mt-6">
              {HERO.line}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3 lg:mt-8">
              <Link
                href={event ? `/e/${event.slug}` : "#how-it-works"}
                className="bg-red-corner hover:bg-red-corner-hot display text-chalk px-3 py-3.5 text-center text-base transition-colors sm:px-5 sm:text-lg"
              >
                {event ? HERO.live : HERO.watch}
              </Link>
              {/* Second, because the reader who has an account already knows
                  where it is, and the one who does not wants to see the thing. */}
              <Link
                href="/promoter"
                className="border-chalk/25 hover:border-chalk/60 display border px-3 py-3.5 text-center text-base transition-colors sm:px-5 sm:text-lg"
              >
                {PITCH.signIn}
              </Link>
            </div>
            <p className="mt-5">
              <Link href="/shows" className="text-ash hover:text-chalk text-sm transition-colors">
                {SHOWS_LINK}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ differences */}
      {/* The three things the paper programme and a card viewer cannot do, as a
          row rather than three paragraphs. The long version of the hero's line
          leads it, because it is the one place the card's own count is said. */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <p className="text-chalk max-w-3xl text-lg leading-snug">{PITCH.free}</p>
          <p className="text-ash mt-3 max-w-3xl text-sm leading-relaxed">
            One code on the table puts the whole card on every phone in the building: every
            fighter&rsquo;s record, photo and story, {tapeForEveryBout(event?.bouts.length ?? 0)},
            and a broadcast video for the ones that matter. The room knows exactly who is
            walking out.
          </p>
          <dl className="mt-8 grid gap-3 sm:grid-cols-3">
            {PITCH.differences.map((point, i) => (
              <div key={point.label} className="border-hairline bg-ink-2 flex gap-3 border p-4">
                <DifferenceIcon index={i} />
                <div>
                  <dt className="display text-chalk text-lg leading-tight">{point.label}</dt>
                  <dd className="text-ash mt-1.5 text-sm leading-snug">{point.body}</dd>
                </div>
              </div>
            ))}
          </dl>
          <p className="text-ash-dim mt-6 max-w-2xl text-sm leading-relaxed">
            {PITCH.howToGetAnAccount}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ no showcase */}
      {/* Where the links into the demo card would be. Everything below this is
          the product rather than the card, so it stays exactly as it is. */}
      {card ? null : (
        <section className="border-hairline border-t">
          <div className="mx-auto max-w-3xl px-5 py-14">
            <h2 className="display text-3xl leading-none">{NO_SHOWCASE.heading}</h2>
            <p className="text-ash mt-5 text-sm leading-relaxed">{NO_SHOWCASE.body}</p>
            <Link
              href="/promoter"
              className="border-hairline hover:border-chalk/50 display mt-8 inline-block border px-6 py-3.5 text-lg transition-colors"
            >
              {NO_SHOWCASE.action}
            </Link>
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- the video */}
      {/* A show that has been published before its running order was entered has
          no main event to play, so the section comes out rather than framing an
          empty player with the argument for one beside it. */}
      {card && main ? (
        <section className="border-hairline border-t">
          <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-center">
            <div>
              <TapePlayer card={card} bout={main} renders={renders[main.number]} />
            </div>
            <div>
              <span className="label">Every bout becomes this</span>
              <h2 className="display mt-4 text-4xl leading-none">
                Sixteen seconds that make a debutant look like a main event
              </h2>
              <p className="text-ash mt-5 text-sm leading-relaxed">
                Built from one photograph and a filled-in form. No film crew, no editor, no
                graphics package. We cut the fighter out of their photo so they move
                independently of the background, then the stats count up over the top.
              </p>
              <p className="text-ash mt-4 text-sm leading-relaxed">
                It plays in the programme, and it downloads as a vertical video the fighter
                posts to their own following. Your event and your sponsors travel with it.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- steps */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-3xl">How it runs</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step.n} className="border-hairline border-t pt-4">
                <span className="display text-ash-dim text-3xl">{step.n}</span>
                <h3 className="display text-chalk mt-2 text-xl">{step.title}</h3>
                <p className="text-ash mt-2 text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- the reel */}
      <section id="how-it-works" className="border-hairline scroll-mt-4 border-t">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 lg:grid-cols-[1fr_minmax(0,340px)] lg:items-center">
          <div className="lg:order-1">
            <span className="label">End to end</span>
            <h2 className="display mt-4 text-4xl leading-none">
              The whole product, end to end
            </h2>
            <p className="text-ash mt-5 text-sm leading-relaxed">
              Captured from the demo card as it stands, on a phone-sized screen, with the
              bout videos cut in from the files the programme serves. The room, the
              fighters and the promoter, one thing at a time. No narration and no sound.
            </p>
            <p className="text-ash mt-4 text-sm leading-relaxed">
              This is the version to forward on WhatsApp, which is where most of these
              conversations happen.
            </p>

            <dl className="border-hairline mt-8 divide-y divide-white/5 border-t">
              {reel.map((chapter) => (
                <div key={chapter.at} className="flex gap-4 py-2.5">
                  <dt className="tnum text-ash-dim w-12 shrink-0 font-mono text-[0.65rem] tracking-wider">
                    {chapter.at}
                  </dt>
                  <dd className="text-ash text-sm leading-tight">{chapter.what}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:order-2">
            <DemoReel
              src="/demo/eventiq-demo.mp4"
              poster="/demo/eventiq-demo-poster.webp"
              seconds={89}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- gallery */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <span className="label">{GALLERY.label}</span>
          <h2 className="display mt-4 text-3xl">{GALLERY.heading}</h2>
          <p className="text-ash mt-4 max-w-2xl text-sm leading-relaxed">
            {event ? GALLERY.linked : GALLERY.unlinked}
          </p>
          <div className="mt-8">
            {/* The addresses come off the card on display rather than off the
                demo's own slug, which is what three of these were written
                against. */}
            <ScreenGallery slug={event?.slug} fighterId={main?.redId} />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- promoter */}
      {/* Every sentence in it counts the showcase card, so with no card it comes
          out rather than being written in the abstract — the way in for a
          promoter with no demo to look at is in the panel above. */}
      {event && inventory ? (
        <section className="border-hairline border-t">
          <div className="mx-auto max-w-3xl px-5 py-14">
            <span className="label">Your side of it</span>
            {/* Through `chaseHeading`, because the showcase is a named show
                rather than whatever is next: once its date is behind us the raw
                figure is a minus sign on the product's front page. */}
            <h2 className="display mt-4 text-4xl leading-none">
              {chaseHeading(daysUntilShow(event.date))}
            </h2>
            <p className="text-ash mt-5 text-sm leading-relaxed">
              The same card from where you sit. {chaseNote(outstanding, total)}
            </p>
            <p className="text-ash mt-4 text-sm leading-relaxed">
              Your sponsor sheet sits alongside it:{" "}
              {sponsorNote(inventory.sold.length, event.bouts.length)}. Those are slots you
              are already selling, now in one place, with a report to send the sponsor
              afterwards.
            </p>
            <Link
              href="/promoter"
              className="border-hairline hover:border-chalk/50 display mt-8 inline-block border px-6 py-3.5 text-lg transition-colors"
            >
              Open the promoter view
            </Link>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- sponsors */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <span className="label">The bit that pays for it</span>
          <h2 className="display mt-4 text-4xl leading-none">
            A bout sponsor gets the whole bout
          </h2>
          <p className="text-ash mt-5 text-sm leading-relaxed">
            Their name sits on that fight in the programme, and they close out the video
            for it — the one the fighter posts to their own following the week of the
            show. That is a thing you can put a real number against, and they are the
            same slots you are already selling.
          </p>
          <p className="text-ash mt-4 text-sm leading-relaxed">
            Your house sponsors sit on the programme itself, in front of every spectator
            who scans the code.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- audiences */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-3xl">Who it is for</h2>
          <dl className="mt-8 grid gap-6 sm:grid-cols-3">
            {audiences.map((a) => (
              <div key={a.who} className="border-hairline border-t pt-4">
                <dt className="display text-chalk text-lg">{a.who}</dt>
                <dd className="text-ash mt-2 text-sm leading-relaxed">{a.gets}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------- honest note */}
      {/* The whole section is about the unevenness of a card, so on a card with
          nothing on it there is nothing to be honest about and it comes out —
          the same treatment the video section gets above, and for the same
          reason. */}
      {event?.bouts.length ? (
        <section className="border-hairline border-t">
          <div className="mx-auto max-w-3xl px-5 py-14">
            <span className="label">About the demo card</span>
            <h2 className="display mt-4 text-3xl leading-none">
              The demo card is deliberately uneven
            </h2>
            <p className="text-ash mt-5 text-sm leading-relaxed">
              The demo runs on {event.name}, an invented show with {event.bouts.length}{" "}
              bouts. {done} of the {total} fighters have finished their profile, which is
              about {score}% of the card between them — roughly where a real show sits two
              weeks out.
            </p>
            <p className="text-ash mt-4 text-sm leading-relaxed">
              Scroll to the bottom of the running order and the openers carry a name and a
              gym and nothing else. The top of the bill is what it looks like when fighters
              send their details in. Closing the gap between those two is what the
              fighter&rsquo;s form is built to do.
            </p>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------------- try */}
      {/* Three of the four are addresses on the showcase card and the fourth
          opens the form as a fighter on it, so the whole section needs one. */}
      {event ? (
        <section className="border-hairline border-t">
          <div className="mx-auto max-w-5xl px-5 py-14">
            <h2 className="display text-3xl">Have a look</h2>
            <div className="mt-8 grid gap-3">
              {[
                {
                  href: `/e/${event.slug}`,
                  title: "The programme",
                  body: `${event.name}, ${formatEventDateShort(event.date)}. ${programmeLinkNote(event.bouts.length)}`,
                },
                {
                  href: "/f/demo",
                  title: "The fighter's form",
                  body: "What lands in a fighter's hand. Watch their card build as they type.",
                },
                {
                  href: "/promoter",
                  title: "The promoter's view",
                  body: "Who to chase, which bouts are ready, which sponsor slots are unsold.",
                },
                {
                  href: `/e/${event.slug}/qr`,
                  title: "The table card",
                  body: "The printable QR that goes on the tables and the doors.",
                },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="border-hairline hover:border-chalk/40 group flex items-center justify-between gap-4 border px-5 py-4 transition-colors"
                >
                  <div>
                    <div className="display text-chalk text-xl">{link.title}</div>
                    <div className="text-ash mt-1 text-sm">{link.body}</div>
                  </div>
                  <span className="text-ash-dim group-hover:text-chalk shrink-0 text-2xl transition-colors">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="border-hairline text-ash-dim border-t px-5 py-10 text-xs">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span className="label">EventIQ</span>
          {event ? (
            <span>
              Every fighter, gym and sponsor on the {event.name} card is invented.
            </span>
          ) : null}
          {/* The notice a fighter is pointed at from their own form is reachable
              from the front of the site too, rather than only from the link they
              were sent. */}
          <Link href="/privacy" className="hover:text-chalk transition-colors">
            {PRIVACY.link}
          </Link>
        </div>
      </footer>
    </main>
  );
}
