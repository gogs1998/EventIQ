import type { MetadataRoute } from "next";
import { event } from "@/data/event";
import { SITE_URL } from "@/lib/site";

/** Required for a metadata route under output: "export". */
export const dynamic = "force-static";

/**
 * Built from the fixture so it cannot fall behind the card. /render is left out
 * deliberately: it is the capture surface for the video exporter, not a page.
 *
 * Sitemap locations have to be absolute, and metadataBase does not apply here,
 * so they are built from SITE_URL directly.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const fighterIds = [
    ...new Set(event.bouts.flatMap((bout) => [bout.redId, bout.blueId])),
  ];

  const entries = [
    { path: "/", priority: 1 },
    { path: `/e/${event.slug}`, priority: 0.9 },
    { path: "/promoter", priority: 0.8 },
    { path: "/f/demo", priority: 0.7 },
    { path: "/qr", priority: 0.4 },
    ...fighterIds.map((id) => ({
      path: `/e/${event.slug}/f/${id}`,
      priority: 0.5,
    })),
  ];

  return entries.map(({ path, priority }) => ({
    url: new URL(path, SITE_URL).toString(),
    priority,
  }));
}
