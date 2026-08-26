import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { loadShowcase } from "@/lib/db/queries";
import { SITE_URL } from "@/lib/site";

/** Lists the card as it stands, so it cannot be frozen at deploy time. */
export const dynamic = "force-dynamic";

/**
 * Built from the published card, so it cannot fall behind what is actually
 * live. Unpublished shows are left out for the same reason they 404: they are
 * the promoter's working copy.
 *
 * /render and /f are left out deliberately. The first is the capture surface for
 * the video exporter rather than a page, and the second is reached by a token
 * that must not appear anywhere a crawler can read it.
 *
 * Sitemap locations have to be absolute and metadataBase does not apply here, so
 * they are built from SITE_URL directly.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const card = await loadShowcase(await getDb());

  const entries = [
    { path: "/", priority: 1 },
    ...(card
      ? [
          { path: `/e/${card.event.slug}`, priority: 0.9 },
          { path: `/e/${card.event.slug}/qr`, priority: 0.4 },
          ...Object.keys(card.fighters).map((id) => ({
            path: `/e/${card.event.slug}/f/${id}`,
            priority: 0.5,
          })),
        ]
      : []),
  ];

  return entries.map(({ path, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    priority,
  }));
}
