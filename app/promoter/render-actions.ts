"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getDb, type Db } from "@/lib/db";
import { enqueueRender } from "@/lib/db/render-jobs";
import { requirePromoter } from "@/lib/session";

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
 * Its own file rather than app/promoter/actions.ts, which is being rewritten
 * elsewhere. The ownership check is the same one, repeated rather than exported:
 * every export of a "use server" module is a callable endpoint, and a helper
 * that takes a slug and hands back a show is not something to publish.
 */

async function ownedEvent(db: Db, slug: string) {
  const promoter = await requirePromoter();
  const [event] = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.slug, slug), eq(schema.events.promoterId, promoter.id)))
    .limit(1);
  if (!event) throw new Error("No such show");
  return { promoter, event };
}

/** One bout, or every bout on the card. */
export async function requestRender(slug: string, bout: number | "all"): Promise<void> {
  const db = await getDb();
  const { event } = await ownedEvent(db, slug);

  await enqueueRender(db, event.id, bout === "all" ? "all" : [bout]);

  revalidatePath(`/promoter/e/${slug}`);
}
