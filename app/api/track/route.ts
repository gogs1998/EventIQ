import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { getDb } from "@/lib/db";
import type { AnalyticsKind } from "@/lib/types";

/**
 * Counts one interaction.
 *
 * Always answers 204, whatever happened. A spectator's programme must never show
 * an error because a counter failed, and a caller that could tell the difference
 * between a recognised and an unrecognised event would be a way of enumerating
 * which shows exist.
 */

const KINDS = new Set<AnalyticsKind>([
  "programme_open",
  "bout_expand",
  "tape_play",
  "sponsor_tap",
  "profile_view",
]);

const ok = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return ok();
  }

  const kind = body.kind as AnalyticsKind;
  const slug = body.slug;
  if (!KINDS.has(kind) || typeof slug !== "string") return ok();

  try {
    const db = await getDb();
    const [event] = await db
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(eq(schema.events.slug, slug))
      .limit(1);
    if (!event) return ok();

    await db.insert(schema.analyticsEvents).values({
      eventId: event.id,
      kind,
      boutNumber: typeof body.boutNumber === "number" ? body.boutNumber : null,
      fighterId: typeof body.fighterId === "string" ? body.fighterId : null,
      sponsorId: typeof body.sponsorId === "string" ? body.sponsorId : null,
      // Truncated because it only ever needs to be distinct within one show, and
      // there is no reason to keep more of a value than the count requires.
      sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 36) : null,
      createdAt: Date.now(),
    });
  } catch {
    // A lost count is not worth an error in a spectator's face.
  }

  return ok();
}
