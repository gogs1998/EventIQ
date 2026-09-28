"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "@/db/schema";
import { DONE, attempt, type ActionResult } from "@/lib/action-result";
import { clearedFighterColumns } from "@/lib/consent";
import { ACTION_ERRORS } from "@/lib/copy";
import { getMedia } from "@/lib/db";
import { inviteFor } from "@/lib/db/owned";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import { logError } from "@/lib/log";
import { mediaKeyOf } from "@/lib/portrait";

/**
 * Taking it back.
 *
 * A consent that cannot be withdrawn is not a consent, so this is a control on
 * the fighter's own form rather than a request to somebody's inbox. It needs
 * nothing but the link they already hold, which matters: the promoter may be the
 * person a fighter no longer wants to talk to.
 *
 * It is in its own file because it is the other half of the questionnaire's
 * story and it changes for its own reasons. It re-reads the invite itself, the
 * same way everything on this route does, because the token is the whole of the
 * authorisation and re-reading it is what stops a fighter writing to somebody
 * else's row — through `inviteFor` in lib/db/owned.ts, which is where the three
 * "use server" files here share the one copy of that lookup.
 */

/**
 * Clears everything the fighter sent, takes their pictures out of the bucket,
 * switches their link off and asks for the videos to be made again.
 *
 * The order is deliberate. The database write goes first and carries the whole
 * of the removal in one batch, so a bucket that will not answer cannot leave a
 * profile half-cleared. The objects are deleted afterwards, best effort: by that
 * point no row points at them, /media refuses an object nothing points at
 * (lib/visibility.ts), and a delete that failed is litter rather than exposure.
 * `npm run retention` sweeps the same paths again.
 *
 * The re-render is asked for quietly. A removal that worked must not report a
 * failure because a queue row would not write; the hourly stale run compares
 * fingerprints and catches the bout up regardless, and `updatedAt` has moved.
 */
export async function removeMyDetails(token: string): Promise<ActionResult> {
  return attempt(
    { event: "removeMyDetails", route: "/f/[token]" },
    ACTION_ERRORS.detailsNotRemoved,
    async () => {
      const found = await inviteFor(token);
      if (!found.ok) return found;
      const { db, row } = found;
      const { invite, fighter, event } = row;

      const objects = [fighter.photo, fighter.cutout, fighter.stylised]
        .map(mediaKeyOf)
        .filter((key): key is string => key !== null);

      const now = Date.now();
      const writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        db
          .update(schema.fighters)
          .set(clearedFighterColumns(now))
          .where(eq(schema.fighters.id, fighter.id)),
        // Sponsors a fighter chose are a choice they made about themselves.
        db.delete(schema.fighterSponsors).where(eq(schema.fighterSponsors.fighterId, fighter.id)),
        // The row stays so there is a record that they asked; the token stops
        // resolving the moment this is set. See loadInviteByToken.
        db.update(schema.invites).set({ revokedAt: now }).where(eq(schema.invites.id, invite.id)),
      ];
      await db.batch(writes);

      const media = await getMedia();
      for (const key of objects) {
        await media
          .delete(key)
          .catch((error) =>
            logError({ event: "removeMyDetails", route: "/f/[token]", fighterId: fighter.id }, error),
          );
      }

      await requestRenderQuietly(db, event.id, "all", {
        event: "removeMyDetails",
        route: "/f/[token]",
        fighterId: fighter.id,
      });

      revalidatePath(`/e/${event.slug}`);
      revalidatePath(`/promoter/e/${event.slug}`);
      return DONE;
    },
  );
}
