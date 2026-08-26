"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import type { AnalyticsKind } from "@/lib/types";

/**
 * Counts one page open.
 *
 * A component rather than a call inside the page because the page is a server
 * component, and counting has to happen in the browser: a count taken on the
 * server would include every crawler, every prefetch and the promoter's own
 * dashboard refresh, and the whole value of these numbers is that a sponsor can
 * check them.
 *
 * The strict-mode double effect in development would double-count, so the guard
 * is a module-level set keyed on what was counted rather than a ref.
 */
const counted = new Set<string>();

export function TrackOpen({
  slug,
  kind,
  fighterId,
}: {
  slug: string;
  kind: AnalyticsKind;
  fighterId?: string;
}) {
  useEffect(() => {
    const key = `${slug}:${kind}:${fighterId ?? ""}`;
    if (counted.has(key)) return;
    counted.add(key);
    track({ slug, kind, fighterId });
  }, [slug, kind, fighterId]);

  return null;
}
