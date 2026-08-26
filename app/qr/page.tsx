import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { loadShowcase } from "@/lib/db/queries";

/**
 * The table card belongs to a show, so it lives at /e/[slug]/qr. This is the
 * short address that was printed and screenshotted before there was more than
 * one event, and it sends you to the current one rather than breaking.
 */
export const dynamic = "force-dynamic";

export default async function QrRedirect() {
  const card = await loadShowcase(await getDb());
  if (!card) notFound();
  redirect(`/e/${card.event.slug}/qr`);
}
