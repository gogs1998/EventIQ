import Link from "next/link";

/**
 * Real captures of the running app at phone width, taken by
 * scripts/shots.mjs. Not mockups: what a promoter looks at here is the thing
 * they would get, which is the only reason a gallery is worth having.
 *
 * Each one links to the live page it was taken from, so the gallery is a way in
 * rather than a wall of pictures.
 */
const screens = [
  {
    src: "/screens/programme.webp",
    href: "/e/cage-county-12",
    title: "The running order",
    body: "Fifteen bouts, main event first, the way the paper programme reads.",
    alt: "The Cage County 12 running order on a phone, main event at the top",
  },
  {
    src: "/screens/tape.webp",
    href: "/e/cage-county-12",
    title: "The tale of the tape",
    body: "Records, reach, stance, gym. Contested lines mark who leads them.",
    alt: "An expanded bout showing both fighters' stats side by side",
  },
  {
    src: "/screens/fighter.webp",
    href: "/e/cage-county-12/f/callum-reeves",
    title: "A fighter's page",
    body: "Deep-linkable, so it goes in their Instagram bio and stays there.",
    alt: "Callum Reeves' profile with his record, story and sponsors",
  },
  {
    src: "/screens/questionnaire.webp",
    href: "/f/demo",
    title: "The fighter's form",
    body: "Their card builds as they type, which is what gets it finished.",
    alt: "The fighter's questionnaire with their card building above it",
  },
  {
    src: "/screens/promoter.webp",
    href: "/promoter",
    title: "Your view",
    body: "Who has not sent theirs, which bouts look thin, what is unsold.",
    alt: "The promoter dashboard listing the fighters still to chase",
  },
];

export function ScreenGallery() {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {screens.map((screen) => (
        <li key={screen.src}>
          <Link href={screen.href} className="group block">
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
          </Link>
        </li>
      ))}
    </ul>
  );
}
