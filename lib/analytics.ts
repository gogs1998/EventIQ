import type { AnalyticsKind } from "@/lib/types";

/**
 * Counting what a sponsor asks about.
 *
 * The point of this is the report a promoter sends afterwards, which turns bout
 * sponsorship from a favour into a product. That only works if the numbers are
 * true, so this counts real interactions and nothing else. There is no
 * estimation, no modelling, and no filling in of gaps: a show with no spectators
 * scanning the code reads as zero, which is information.
 *
 * There is no identifier for a person here and none is wanted. The session id is
 * a random value that lives in sessionStorage for the length of one visit, so
 * that opening the programme twice on the same walk to your seat is one
 * spectator rather than two. It is not a cookie, it is not stored against
 * anything else, and closing the tab ends it.
 */

export const SESSION_KEY = "eventiq_session_id";

export type TrackEvent = {
  slug: string;
  kind: AnalyticsKind;
  boutNumber?: number;
  fighterId?: string;
  sponsorId?: string;
};

export function sessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

/**
 * Fire and forget, via sendBeacon where it exists.
 *
 * A tap on a sponsor's logo navigates away immediately, and a normal fetch is
 * cancelled when the page unloads, so the taps that matter most are exactly the
 * ones a fetch would lose. Nothing here is ever awaited by the caller: counting
 * must never be able to make the programme feel slow, and a failure to count is
 * not worth telling a spectator about.
 */
export function track(event: TrackEvent): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ ...event, sessionId: sessionId() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/track", { method: "POST", body, keepalive: true });
  } catch {
    // Private browsing can make sessionStorage throw. Losing a count is fine.
  }
}
