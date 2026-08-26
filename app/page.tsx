import Link from "next/link";
import { DemoReel } from "@/components/DemoReel";
import { ScreenGallery } from "@/components/ScreenGallery";
import { TapePlayer } from "@/components/sequence/TapePlayer";
import { event } from "@/data/event";
import { chaseList, daysUntilShow, sponsorInventory } from "@/lib/promoter";
import { mp4For } from "@/lib/renders";
import { eventCompleteness, formatEventDateShort, getBout } from "@/lib/tape";

const steps = [
  {
    n: "01",
    title: "Send us the running order",
    body: "The same sheet you send the printer. Bouts, weights, gyms, corners. We build the programme from it.",
  },
  {
    n: "02",
    title: "Every fighter gets one link",
    body: "No app, no account, no password. It goes out on WhatsApp and it opens straight onto their own form on their phone.",
  },
  {
    n: "03",
    title: "They actually fill it in",
    body: "Because it puts their photo, their Instagram and their sponsors in front of the whole room, and because they get a broadcast video of their own tale of the tape to post. If they are already on Sherdog or Tapology they paste the link and their record fills itself in.",
  },
  {
    n: "04",
    title: "One code on the tables",
    body: "Everyone scans. Nobody prints anything. You can still change the card at half seven.",
  },
];

/** Timings read off the recording itself, not off the tour script. */
const reel = [
  { at: "0:00", what: "The code that goes on the table" },
  { at: "0:04", what: "The running order, down through all fifteen bouts" },
  { at: "0:20", what: "One bout opened out into the tale of the tape" },
  { at: "0:24", what: "The video for it, start to finish" },
  { at: "0:48", what: "The fighters' own words, and the bout sponsor" },
  { at: "0:52", what: "The form a fighter gets sent, filled in as you watch" },
];

const audiences = [
  {
    who: "The punter in row four",
    gets: "A reason to care about bout four on a wet Tuesday, instead of polite clapping for a name he cannot read.",
  },
  {
    who: "The fighter",
    gets: "A profile, a record, a photo, their gym credited, their Instagram one tap away, their sponsors seen, and a video of their own walkout card.",
  },
  {
    who: "You",
    gets: "A show that looks like a professional operation, and sponsor slots you can actually charge properly for.",
  },
];

export default function PitchPage() {
  const main = getBout(15)!;
  const { score, done, total } = eventCompleteness();
  const outstanding = chaseList().length;
  const inventory = sponsorInventory();
  const days = daysUntilShow();

  return (
    <main className="w-full">
      {/* ------------------------------------------------------------ hero */}
      <section className="mx-auto max-w-3xl px-5 pb-14 pt-16">
        <span className="label">EventIQ</span>
        <h1 className="display anim-slam mt-5 text-5xl leading-[0.9] sm:text-6xl">
          Your programme is one sheet of A4 with thirty names on it.
        </h1>
        <p className="text-ash mt-6 max-w-2xl text-base leading-relaxed">
          Name, gym, weight class. That is everything the room knows about the lad
          walking to the cage. We put the same card on every phone in the building, with
          every fighter&rsquo;s record, photo and story, a tale of the tape for all{" "}
          {event.bouts.length} bouts, and a broadcast video for the ones that matter.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/e/${event.slug}`}
            className="bg-chalk text-ink display hover:bg-gold px-6 py-3.5 text-lg transition-colors"
          >
            Open the programme
          </Link>
          <Link
            href="/f/demo"
            className="border-hairline hover:border-chalk/50 display border px-6 py-3.5 text-lg transition-colors"
          >
            See what a fighter gets
          </Link>
        </div>
      </section>

      {/* --------------------------------------------------------- the video */}
      <section className="border-hairline border-t">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-center">
          <div>
            <TapePlayer bout={main} mp4={mp4For(main.number)} />
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
              posts to their own following — with your event and your sponsors on it. Your
              card markets itself.
            </p>
          </div>
        </div>
      </section>

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
      <section className="border-hairline border-t">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 lg:grid-cols-[1fr_minmax(0,340px)] lg:items-center">
          <div className="lg:order-1">
            <span className="label">End to end</span>
            <h2 className="display mt-4 text-4xl leading-none">
              The whole thing, in a minute and a bit
            </h2>
            <p className="text-ash mt-5 text-sm leading-relaxed">
              Recorded off the demo as it stands, on a phone-shaped screen. The card on
              the table, the running order, a bout opening into the tape, the video, and
              the form a fighter gets sent. No narration and no sound.
            </p>
            <p className="text-ash mt-4 text-sm leading-relaxed">
              This is the version to forward to somebody on WhatsApp, which is where most
              of these conversations happen.
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
              seconds={76}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- gallery */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <span className="label">Every screen in it</span>
          <h2 className="display mt-4 text-3xl">What it actually looks like</h2>
          <p className="text-ash mt-4 max-w-2xl text-sm leading-relaxed">
            Screenshots of the working demo, not mockups. Tap any of them to open the
            real page.
          </p>
          <div className="mt-8">
            <ScreenGallery />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- promoter */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <span className="label">Your side of it</span>
          <h2 className="display mt-4 text-4xl leading-none">
            {days} days out, you know exactly who has not sent theirs
          </h2>
          <p className="text-ash mt-5 text-sm leading-relaxed">
            The same card from where you sit. {outstanding} of the {total} fighters still
            have holes in their profile, listed top of the bill first, because a gap in
            the main event costs more than a gap in bout two. Each one comes with a
            message you can copy straight into WhatsApp that names their bout and their
            opponent. It tells a fighter the other one has already sent theirs only when
            that is true.
          </p>
          <p className="text-ash mt-4 text-sm leading-relaxed">
            And your sponsor sheet: {inventory.sold.length} of the {event.bouts.length}{" "}
            bout slots sold, {inventory.unsold.length} still going. Those are slots you
            are already selling. This is the first time you can see the lot in one place,
            with something to send the sponsor afterwards.
          </p>
          <Link
            href="/promoter"
            className="border-hairline hover:border-chalk/50 display mt-8 inline-block border px-6 py-3.5 text-lg transition-colors"
          >
            Open the promoter view
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- sponsors */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <span className="label">The bit that pays for it</span>
          <h2 className="display mt-4 text-4xl leading-none">
            On paper a bout sponsor gets a logo the size of a stamp
          </h2>
          <p className="text-ash mt-5 text-sm leading-relaxed">
            Here they get the bout. Their name sits on that fight in the programme, and
            they close out the video for it — the one the fighter posts to their own
            following the week of the show. That is a thing you can put a real number
            against, and it is the same fifteen slots you are already selling.
          </p>
          <p className="text-ash mt-4 text-sm leading-relaxed">
            Your house sponsors sit on the programme itself, not just on a banner behind
            the cage that nobody photographs.
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
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <span className="label">About the demo card</span>
          <h2 className="display mt-4 text-3xl leading-none">
            Half of them have not filled it in, on purpose
          </h2>
          <p className="text-ash mt-5 text-sm leading-relaxed">
            The demo runs on {event.name}, an invented show with {event.bouts.length}{" "}
            bouts. {done} of the {total} fighters have finished their profile, which is
            about {score}% of the card between them — roughly where a real show sits two
            weeks out.
          </p>
          <p className="text-ash mt-4 text-sm leading-relaxed">
            That is deliberate. Scroll to the bottom of the running order and the openers
            are a name and a gym, exactly like the paper programme. The top of the bill is
            what it looks like when fighters do send their details in. The gap between
            those two things is the whole argument, and it is why the fighter&rsquo;s form
            is built to be finished rather than merely sent.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------------- try */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-3xl">Have a look</h2>
          <div className="mt-8 grid gap-3">
            {[
              {
                href: `/e/${event.slug}`,
                title: "The programme",
                body: `${event.name}, ${formatEventDateShort(event.date)}. Tap any bout for the tale of the tape.`,
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
                href: "/qr",
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

      <footer className="border-hairline text-ash-dim border-t px-5 py-10 text-xs">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span className="label">EventIQ</span>
          <span>
            Every fighter, gym and sponsor in this demo is invented.
          </span>
        </div>
      </footer>
    </main>
  );
}
