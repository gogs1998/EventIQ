import type { Db } from "@/lib/db";
import { loadReportCounts } from "@/lib/db/queries";
import type { ReportCounts } from "@/lib/sponsor-report";
import { loadOwnedCard, type OwnedCard } from "@/lib/visibility";

/**
 * A show's sponsor counts, for the promoter who owns it and nobody else.
 *
 * The counts are the promoter's commercial evidence and say which sponsors are
 * on a card that may not be published yet, so the card comes through
 * `loadOwnedCard` before anything is counted: a show that is not theirs and a
 * show that does not exist both answer null, and no count is read for either.
 */
export async function loadOwnedReport(
  db: Db,
  slug: string,
  promoterId: string,
): Promise<{ card: OwnedCard; counts: ReportCounts } | null> {
  const card = await loadOwnedCard(db, slug, promoterId);
  if (!card) return null;
  return { card, counts: await loadReportCounts(db, card.eventId) };
}
