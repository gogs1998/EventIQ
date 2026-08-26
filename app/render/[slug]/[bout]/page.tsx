import { notFound } from "next/navigation";
import { RenderStage } from "@/components/sequence/RenderStage";
import { boutOf } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadCard } from "@/lib/db/queries";

/**
 * Capture surface for the mp4 exporter. Not linked from anywhere in the
 * programme; it exists so headless Chrome has a stable page to screenshot.
 *
 * Deliberately not behind the published check. The renderer runs against a card
 * before it goes public — that is the point of rendering it — and the page is
 * unlisted, carries no navigation and is useless to anybody who is not driving
 * `window.__setFrame`.
 */
export default async function RenderPage({ params }: PageProps<"/render/[slug]/[bout]">) {
  const { slug, bout } = await params;
  const card = await loadCard(await getDb(), slug);
  if (!card || !boutOf(card, bout)) notFound();

  return <RenderStage card={card} boutNumber={Number(bout)} />;
}
