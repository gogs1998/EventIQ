import Link from "next/link";

/**
 * Real captures of the running app at phone width, taken by
 * scripts/shots.mjs. Not mockups: what a promoter looks at here is the thing
 * they would get, which is the only reason a gallery is worth having.
 *
 * Each one links to the live page it was taken from, so the gallery is a way in
 * rather than a wall of pictures — and that is why the addresses cannot be
 * written out here. Three of the five are on the showcase card, and they were
 * spelled with the demo's own slug: on an instance where `SHOWCASE_SLUG` names a
 * different show, or names nothing at all, "tap any of them to open the real
 * page" was three links to a 404 with nothing saying so. It is the same mistake
 * as the one HANDOVER section 6e is about — the shop window running on a show
 * nobody decided on — one layer down.
 *
 * The pictures themselves stay whatever they were captured from and say so. What
 * follows the card is where tapping one goes, and whether there is anywhere for
 * it to go at all.
 */
const screens = [
  {
    key: "programme",
    src: "/screens/programme.webp",
    to: "programme" as const,
    title: "The running order",
    body: "Fifteen bouts, main event first, the way the paper programme reads.",
    alt: "The Cage County 12 running order on a phone, main event at the top",
  },
  {
    key: "tape",
    src: "/screens/tape.webp",
    to: "programme" as const,
    title: "The tale of the tape",
    body: "Records, reach, stance, gym. Contested lines mark who leads them.",
    alt: "An expanded bout showing both fighters' stats side by side",
  },
  {
    key: "fighter",
    src: "/screens/fighter.webp",
    to: "fighter" as const,
    title: "A fighter's page",
    body: "Deep-linkable, so it goes in their Instagram bio and stays there.",
    alt: "Callum Reeves' profile with his record, story and sponsors",
  },
  {
    key: "questionnaire",
    src: "/screens/questionnaire.webp",
    to: "/f/demo" as const,
    title: "The fighter's form",
    body: "Their card builds as they type, which is what gets it finished.",
    alt: "The fighter's questionnaire with their card building above it",
  },
  {
    key: "promoter",
    src: "/screens/promoter.webp",
    to: "/promoter" as const,
    title: "Your view",
    body: "Who has not sent theirs, which bouts look thin, what is unsold.",
    alt: "The promoter dashboard listing the fighters still to chase",
  },
];

export function ScreenGallery({
  /** The show on display, where there is one. Absent leaves the card tiles unlinked. */
  slug,
  /** Somebody actually on that card, for the tile that is a fighter's own page. */
  fighterId,
}: {
  slug?: string;
  fighterId?: string;
}) {
  const href = (to: (typeof screens)[number]["to"]): string | null => {
    if (to === "programme") return slug ? `/e/${slug}` : null;
    if (to === "fighter") {
      // The programme rather than nothing where the card has no bouts on it yet:
      // the picture is of a fighter inside a running order, and the running
      // order is the page it was taken from.
      if (!slug) return null;
      return fighterId ? `/e/${slug}/f/${fighterId}` : `/e/${slug}`;
    }
    return to;
  };

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {screens.map((screen) => {
        const to = href(screen.to);
        const body = (
          <>
            <div className="border-hairline group-hover:border-chalk/40 bg-ink-2 border transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screen.src}
                alt={screen.alt}
                width={780}
                height={1688}
                loading="lazy"
                className="block w-full"
              />
            </div>
            <h3 className="display text-chalk group-hover:text-gold mt-3 text-base transition-colors">
              {screen.title}
            </h3>
            <p className="text-ash mt-1 text-xs leading-relaxed">{screen.body}</p>
          </>
        );

        return (
          <li key={screen.key}>
            {to ? (
              <Link href={to} className="group block">
                {body}
              </Link>
            ) : (
              <div className="block">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
