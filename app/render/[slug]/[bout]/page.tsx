import { notFound } from "next/navigation";
import { RenderStage } from "@/components/sequence/RenderStage";
import { DEFAULT_TEMPLATE, templateOf } from "@/components/sequence/templates";
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
 *
 * `?template=` chooses the composition and `?corner=` picks the fighter a
 * one-corner template is about. An unknown template is a 404 rather than the
 * default, because falling back would mean a mistyped id quietly capturing a
 * different composition for a different length and nothing saying so until
 * somebody watched the file. `corner` is not held to the same standard: there
 * are two of them, anything else is the red corner, and three of the four
 * templates never read it.
 */
export default async function RenderPage({
  params,
  searchParams,
}: PageProps<"/render/[slug]/[bout]">) {
  const { slug, bout } = await params;
  const query = await searchParams;

  const template = firstOf(query.template) ?? DEFAULT_TEMPLATE;
  if (!templateOf(template)) notFound();

  const card = await loadRenderableCard(await getDb(), slug);
  if (!card || !boutOf(card, bout)) notFound();

  return (
    <RenderStage
      card={card}
      boutNumber={Number(bout)}
      template={template}
      corner={firstOf(query.corner) === "blue" ? "blue" : "red"}
    />
  );
}

/** A repeated query parameter arrives as an array. Take the first and move on. */
function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
