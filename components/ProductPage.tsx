import Link from "next/link";
import { preload } from "react-dom";
import { ClipLoop } from "@/components/ClipLoop";
import { PRODUCT_CTA, type ProductClip, type ProductPage, type ProductScreen } from "@/lib/products";

/**
 * One of the two product pages, in the pitch page's own visual language: the
 * same hero shape, the same hairline bands and the same type. Static, and
 * deliberately so: nothing here counts a card, because the examples are
 * invented and there is no row behind them to count.
 */
export function ProductPageView({ page }: { page: ProductPage }) {
  preload(page.hero.clip.poster, { as: "image", fetchPriority: "high" });

  return (
    <main id="main" tabIndex={-1} className="w-full">
      {/* ------------------------------------------------------------ hero */}
      <section className="relative">
        <div className="mx-auto grid max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-center lg:gap-12 lg:px-5 lg:py-16">
          <figure className="relative mx-auto w-full max-w-[260px] px-0 pt-8 sm:max-w-[300px] lg:order-2 lg:max-w-none lg:pt-0">
            <div className="border-hairline relative aspect-[9/16] w-full overflow-hidden bg-ink-2 border">
              <ClipLoop
                src={`/clips/${page.hero.clip.clip}`}
                poster={page.hero.clip.poster}
                label={page.hero.clip.caption}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <figcaption className="label text-ash-dim mt-3">{page.hero.clip.caption}</figcaption>
          </figure>

          <div className="relative z-10 px-5 pb-12 pt-8 lg:order-1 lg:px-0 lg:pb-0 lg:pt-0">
            <p className="bg-gold text-ink inline-block px-2.5 py-1 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
              {page.hero.badge}
            </p>
            <p className="label text-ash mt-5">
              {page.name} <span className="text-ash-dim">· built as {page.builtAs}</span>
            </p>
            <h1 className="display anim-slam mt-3 text-[2.6rem] leading-[0.92] sm:text-6xl lg:text-[4.2rem]">
              {page.hero.headline}
            </h1>
            <p className="text-chalk/85 mt-4 max-w-xl text-base leading-snug sm:text-lg lg:mt-6">
              {page.hero.line}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:gap-3 lg:mt-8">
              <a
                href={page.demo.href}
                className="bg-red-corner hover:bg-red-corner-hot display text-chalk col-span-2 px-3 py-3.5 text-center text-base transition-colors sm:px-5 sm:text-lg"
              >
                {page.demo.label}
              </a>
              <a
                href="#how-it-works"
                className="border-chalk/25 hover:border-chalk/60 display border px-3 py-3.5 text-center text-base transition-colors sm:px-5 sm:text-lg"
              >
                How it works
              </a>
              <a
                href="#setting-one-up"
                className="border-chalk/25 hover:border-chalk/60 display border px-3 py-3.5 text-center text-base transition-colors sm:px-5 sm:text-lg"
              >
                {PRODUCT_CTA.label}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- how it works */}
      <section id="how-it-works" className="border-hairline scroll-mt-4 border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-3xl">{page.organiser.heading}</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {page.organiser.steps.map((step, i) => (
              <li key={step.title} className="border-hairline border-t pt-4">
                <span className="display text-ash-dim text-3xl" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="display text-chalk mt-2 text-xl">{step.title}</h3>
                <p className="text-ash mt-2 text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="display text-3xl">{page.participant.heading}</h2>
          <p className="text-chalk/85 mt-3 max-w-2xl text-base leading-snug">{page.participant.who}</p>
          <dl className="mt-8 grid gap-3 sm:grid-cols-2">
            {page.participant.steps.map((step) => (
              <div key={step.title} className="border-hairline bg-ink-2 border p-4">
                <dt className="display text-chalk text-lg leading-tight">{step.title}</dt>
                <dd className="text-ash mt-1.5 text-sm leading-snug">{step.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------ clips */}
      <section className="border-hairline border-t">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
          <div>
            <span className="label">The clips</span>
            <h2 className="display mt-4 text-4xl leading-none">{page.clips.heading}</h2>
            <p className="text-ash mt-5 text-sm leading-relaxed">{page.clips.body}</p>
          </div>
          <ul className={`grid gap-4 ${page.clips.items.length > 1 ? "grid-cols-2" : "mx-auto w-full max-w-[300px] grid-cols-1"}`}>
            {page.clips.items.map((clip) => (
              <ClipFigure key={clip.clip} clip={clip} />
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- features */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <span className="label">The screens</span>
          <h2 className="display mt-4 text-3xl">{page.features.heading}</h2>
          <p className="text-ash mt-4 max-w-2xl text-sm leading-relaxed">{page.features.body}</p>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {page.features.screens.map((screen) => (
              <ScreenFigure key={screen.src} screen={screen} />
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- sponsors */}
      <section className="border-hairline border-t">
        <div
          className={`mx-auto max-w-5xl px-5 py-14 ${page.sponsors.screen ? "grid gap-10 sm:grid-cols-[1fr_minmax(0,240px)] sm:items-start" : ""}`}
        >
          <div className="max-w-3xl">
            <span className="label">{page.sponsors.label}</span>
            <h2 className="display mt-4 text-4xl leading-none">{page.sponsors.heading}</h2>
            {page.sponsors.body.map((paragraph) => (
              <p key={paragraph} className="text-ash mt-5 text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
          {page.sponsors.screen ? (
            <ul className="mx-auto w-full max-w-[240px]">
              <ScreenFigure screen={page.sponsors.screen} />
            </ul>
          ) : null}
        </div>
      </section>

      {/* -------------------------------------------------------------- cta */}
      <section id="setting-one-up" className="border-hairline scroll-mt-4 border-t">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <span className="label">{PRODUCT_CTA.label}</span>
          <h2 className="display mt-4 text-4xl leading-none">{PRODUCT_CTA.heading}</h2>
          <p className="text-ash mt-5 text-sm leading-relaxed">{PRODUCT_CTA.body}</p>
          <Link
            href="/"
            className="border-hairline hover:border-chalk/50 display mt-8 inline-block border px-6 py-3.5 text-lg transition-colors"
          >
            {PRODUCT_CTA.back}
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- example */}
      <section className="border-hairline border-t">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <span className="label">{page.example.heading}</span>
          <p className="text-ash mt-4 text-sm leading-relaxed">{page.example.body}</p>
        </div>
      </section>

      <footer className="border-hairline text-ash-dim border-t px-5 py-10 text-xs">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <span className="label">EventIQ</span>
          <nav aria-label="EventIQ products" className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-chalk transition-colors">
              Fight nights
            </Link>
            <Link href="/awards" className="hover:text-chalk transition-colors">
              Awards
            </Link>
            <Link href="/seminars" className="hover:text-chalk transition-colors">
              Seminars
            </Link>
            <Link href="/privacy" className="hover:text-chalk transition-colors">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function ClipFigure({ clip }: { clip: ProductClip }) {
  return (
    <li>
      <figure>
        <div className="border-hairline bg-ink-2 relative aspect-[9/16] overflow-hidden border">
          <ClipLoop
            src={`/clips/${clip.clip}`}
            poster={clip.poster}
            label={clip.caption}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <figcaption className="mt-3">
          <span className="display text-chalk block text-base">{clip.title}</span>
          <span className="text-ash mt-1 block text-xs leading-relaxed">{clip.caption}</span>
        </figcaption>
      </figure>
    </li>
  );
}

function ScreenFigure({ screen }: { screen: ProductScreen }) {
  return (
    <li>
      <figure>
        <div className="border-hairline bg-ink-2 border">
          {/* eslint-disable-next-line @next/next/no-img-element -- already sized
              and compressed; captured at 780x1688, a phone at twice its width. */}
          <img
            src={screen.src}
            alt={screen.alt}
            width={780}
            height={1688}
            loading="lazy"
            className="block h-auto w-full"
          />
        </div>
        <figcaption className="mt-3">
          <span className="display text-chalk block text-base">{screen.title}</span>
          <span className="text-ash mt-1 block text-xs leading-relaxed">{screen.body}</span>
        </figcaption>
      </figure>
    </li>
  );
}
