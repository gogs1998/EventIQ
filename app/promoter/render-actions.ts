"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { enqueueRender } from "@/lib/db/render-jobs";
import { requirePromoter } from "@/lib/session";
import { loadOwnedCard } from "@/lib/visibility";

/**
 * Asking for a video, and nothing else.
 *
 * It queues and returns. Nothing here renders anything, because a Worker cannot:
 * headless Chrome and ffmpeg are outside what the edge runtime can do, and a
 * button that appeared to make a video would be a promise the platform cannot
 * keep. What it does is write a row that the renderer claims — section 11 of the
 * handover — so the honest thing for the dashboard to say afterwards is
 * "queued", which is what it says.
 *
 * Its own file rather than app/promoter/actions.ts, and the ownership check used
 * to be written out here for the third time: every export of a "use server"
 * module is a callable endpoint, so the two actions files could not share one.
 * It is `loadOwnedCard` in lib/visibility.ts now, beside the publish gate, which
 * is not a server module and can be imported by both.
 */

/** One bout, or every bout on the card. */
export async function requestRender(slug: string, bout: number | "all"): Promise<void> {
  const db = await getDb();
  const promoter = await requirePromoter();

  const card = await loadOwnedCard(db, slug, promoter.id);
  if (!card) throw new Error("No such show");

  await enqueueRender(db, card.eventId, bout === "all" ? "all" : [bout]);

  revalidatePath(`/promoter/e/${slug}`);
}
