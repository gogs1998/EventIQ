import type { MetadataRoute } from "next";
import { getDb, readVar } from "@/lib/db";
import { loadShowcase } from "@/lib/db/queries";
import { SITE_URL } from "@/lib/site";
import { publicFighters, publicShows } from "@/lib/visibility";

/** Lists the card as it stands, so it cannot be frozen at deploy time. */
export const dynamic = "force-dynamic";

/**
 * Every public address on the instance, built from the same gates the pages
 * themselves go through.
 *
 * This used to be the showcase card and nothing else, and the argument for that
 * was a real one: the file listed whichever published show had the furthest-out
 * date, so with a second promoter on the instance EventIQ would submit their
 * show, their venue and every one of their fighters to search engines the
 * moment their date happened to be the later one, with nobody having decided
 * anything.
 *
 * What changed is that there is now a page which lists every published show on
 * purpose. `/shows` is the front door for exactly that, and a promoter pressing
 * publish is the decision the old version was afraid of being made by accident.
 * Leaving the programmes out of the sitemap while linking to all of them from a
 * public page would not be a privacy measure; it would only be a worse sitemap.
 * So the rule here is the rule everywhere else — published and nothing else —
 * and it is applied by calling the same two gates `/shows` and `/fighters/[id]`
 * are behind, so a page that answers 404 cannot be listed and a page that
 * exists cannot be missed.
 *
 * `/render` and `/f` are still left out deliberately. The first is the capture
 * surface for the video exporter rather than a page, and the second is reached
 * by a token that must not appear anywhere a crawler can read it. robots.txt
 * says both again for anything that arrives without reading this.
 *
 * The showcase keeps the priority on its own programme and its printable table
 * card, which is only meaningful for the demo.
 *
 * Sitemap locations have to be absolute and metadataBase does not apply here, so
 * they are built from SITE_URL directly.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const [card, shows, fighters] = await Promise.all([
    loadShowcase(db, await readVar("SHOWCASE_SLUG")),
    publicShows(),
    publicFighters(),
  ]);

  const entries = [
    { path: "/", priority: 1 },
    { path: "/shows", priority: 0.8 },
    ...shows.map((show) => ({
      path: `/e/${show.slug}`,
      priority: show.slug === card?.event.slug ? 0.9 : 0.7,
    })),
    // A fighter's permanent address: the one they would put in a bio, and the
    // one that outlives whichever card introduced them.
    ...fighters.map((id) => ({ path: `/fighters/${id}`, priority: 0.5 })),
    ...(card
      ? [
          { path: `/e/${card.event.slug}/qr`, priority: 0.4 },
          // The showcase's fighters inside the programme. A lower priority than
          // the canonical address above, because the same person is on both and
          // the one without a show around it is the one worth ranking.
          ...Object.keys(card.fighters).map((id) => ({
            path: `/e/${card.event.slug}/f/${id}`,
            priority: 0.4,
          })),
        ]
      : []),
  ];

  return entries.map(({ path, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    priority,
  }));
}
