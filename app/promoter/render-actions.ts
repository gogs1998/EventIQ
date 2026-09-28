"use server";

import { revalidatePath } from "next/cache";
import { DONE, attempt, type ActionResult } from "@/lib/action-result";
import { ACTION_ERRORS } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { ownedEvent } from "@/lib/db/owned";
import { enqueueRender } from "@/lib/db/render-jobs";

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
 * It is `ownedEvent` in lib/db/owned.ts now, over `loadOwnedCard` beside the
 * publish gate, which is not a server module and can be imported by all of them.
 *
 * It answered `void` and threw for an expired session and for another promoter's
 * show, which is the shape every other action here was moved off (lib/action-result.ts):
 * the control greyed out, came back, and changed nothing, and the commonest
 * reason by a distance is a session that ran out while the card was being typed.
 * It is an `ActionResult` now and the button renders it.
 */

/** One bout, or every bout on the card. */
export async function requestRender(
  slug: string,
  bout: number | "all",
): Promise<ActionResult> {
  return attempt(
    { event: "requestRender", route: `/promoter/e/${slug}` },
    ACTION_ERRORS.renderNotQueued,
    async () => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      await enqueueRender(db, owned.card.eventId, bout === "all" ? "all" : [bout]);

      revalidatePath(`/promoter/e/${slug}`);
      return DONE;
    },
  );
}
