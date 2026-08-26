import { notFound } from "next/navigation";
import { RenderStage } from "@/components/sequence/RenderStage";
import { boutOf } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadRenderableCard } from "@/lib/visibility";

/**
 * Capture surface for the mp4 exporter. Not linked from anywhere in the
 * programme; it exists so headless Chrome has a stable page to screenshot.
 *
 * It cannot go behind the publish check, because rendering a card before it goes
 * public is the point of rendering it — a promoter makes the videos while they
 * are still filling the card in. So it has a credential of its own instead of no
 * credential at all: the render key in a header, or a promoter session that owns
 * the show. `loadRenderableCard` is that rule, and it sits next to the publish
 * check rather than in here, so this route is not a second place a rule can be
 * quietly forgotten.
 *
 * An unauthorised request gets the same 404 as a slug that does not exist.
 */
export default async function RenderPage({ params }: PageProps<"/render/[slug]/[bout]">) {
  const { slug, bout } = await params;
  const card = await loadRenderableCard(await getDb(), slug);
  if (!card || !boutOf(card, bout)) notFound();

  return <RenderStage card={card} boutNumber={Number(bout)} />;
}
