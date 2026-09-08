import { notFound, redirect } from "next/navigation";
import { getDb, readVar } from "@/lib/db";
import { loadShowcase } from "@/lib/db/queries";

/**
 * The table card belongs to a show, so it lives at /e/[slug]/qr. This is the
 * short address that was printed and screenshotted before there was more than
 * one event, and it sends you to the demo one rather than breaking.
 *
 * The demo one — named in SHOWCASE_SLUG — rather than whatever is published with
 * the furthest-out date. This address is on printed material, and swinging it
 * onto a second promoter's show because their date is later would hand their
 * table card to whoever scanned an old code.
 */
export const dynamic = "force-dynamic";

export default async function QrRedirect() {
  const card = await loadShowcase(await getDb(), await readVar("SHOWCASE_SLUG"));
  if (!card) notFound();
  redirect(`/e/${card.event.slug}/qr`);
}
