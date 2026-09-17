import { notFound } from "next/navigation";
import { ShowRenderStage } from "@/components/sequence/ShowRenderStage";
import { showTemplate } from "@/components/sequence/show-templates";
import { getDb } from "@/lib/db";
import { captureInstant } from "@/lib/promo";
import { qrMatrix } from "@/lib/qr";
import { SITE_URL } from "@/lib/site";
import { loadRenderableCard } from "@/lib/visibility";

/**
 * Capture surface for the show-level videos. Not linked from anywhere in the
 * programme; it exists so headless Chrome has a stable page to screenshot.
 *
 * Gated exactly as `/render/[slug]/[bout]` is, and through the same function:
 * these videos are made while a promoter is still building the card, so the
 * publish check is the wrong rule and `loadRenderableCard` is the right one —
 * the render key in a header, or a promoter session that owns the show. A show
 * that does not exist, a caller who has proved nothing and a template nobody has
 * written all answer with the same 404, so none of the three is told apart from
 * the others.
 *
 * The template is resolved before the database is touched, because an unknown id
 * is settled without a query and answers the same way either way.
 */
export default async function ShowRenderPage({
  params,
}: PageProps<"/render/[slug]/show/[template]">) {
  const { slug, template } = await params;

  const chosen = showTemplate(template);
  if (!chosen) notFound();

  const card = await loadRenderableCard(await getDb(), slug);
  if (!card) notFound();

  return (
    <ShowRenderStage
      card={card}
      templateId={chosen.id}
      // Fixed here, once, for the whole capture. A composition that read the
      // clock itself would count a day down partway through a render.
      now={captureInstant()}
      // The canonical address rather than the one this is being served from.
      // `components/QrCode.tsx` uses the current origin deliberately, because a
      // printed table card is scanned off whatever is in front of the reader —
      // but a video leaves here, and a code in it pointing at a laptop on a
      // desk is a code nobody can open.
      qr={qrMatrix(`${SITE_URL}/e/${card.event.slug}`)}
    />
  );
}
