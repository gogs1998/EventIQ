import * as schema from "@/db/schema";
import { getDb } from "@/lib/db";
import { eventVisibility, trackRefsBelong } from "@/lib/db/queries";
import { withinTrackLimit } from "@/lib/rate-limit";
import { parseTrackBody } from "@/lib/track";

/**
 * Counts one interaction.
 *
 * Always answers 204, whatever happened. A spectator's programme must never show
 * an error because a counter failed, and a caller that could tell the difference
 * between a recognised and an unrecognised event would be a way of enumerating
 * which shows exist.
 *
 * Which is why what it will write has to be narrow. It takes no credential and
 * cannot — the beacon is sent as the page goes — so an open endpoint that wrote
 * whatever it was handed would be a table anybody could fill, and these counts
 * are the evidence a promoter puts in front of a sponsor. Three things bound it:
 * the caller's allowance, the shape check in lib/track.ts, and the requirement
 * that the show is published and that every id named is actually on it.
 *
 * Privacy is unchanged and is the point: no address is stored, no cookie is set
 * and nothing here identifies a person. See section 9.
 */

const ok = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  if (!(await withinTrackLimit(request))) return ok();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const write = parseTrackBody(body);
  if (!write) return ok();

  try {
    const db = await getDb();

    // A draft show counts nothing. Its programme is not readable, so an
    // interaction with it did not happen, and a row saying otherwise would be in
    // the report the promoter sends afterwards.
    const event = await eventVisibility(db, write.slug);
    if (!event?.published) return ok();
    if (!(await trackRefsBelong(db, event.id, write))) return ok();

    await db.insert(schema.analyticsEvents).values({
      eventId: event.id,
      kind: write.kind,
      boutNumber: write.boutNumber,
      fighterId: write.fighterId,
      sponsorId: write.sponsorId,
      sessionId: write.sessionId,
      createdAt: Date.now(),
    });
  } catch {
    // A lost count is not worth an error in a spectator's face.
  }

  return ok();
}
