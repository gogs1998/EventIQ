"use client";

import { useTransition } from "react";
import { requestRender } from "@/app/promoter/render-actions";
import { RENDER_AGAIN } from "@/lib/copy";

/**
 * Asks for a bout's video to be made again.
 *
 * It queues and nothing more, so the label says what it does rather than what it
 * will produce. Rendering happens on a machine that is not this one and may not
 * be awake, and a button implying otherwise would be the dashboard making a
 * promise on somebody else's behalf.
 */
export function RenderAgainButton({ slug, bout }: { slug: string; bout: number | "all" }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void requestRender(slug, bout))}
      className="border-hairline hover:border-chalk/40 label shrink-0 border px-2 py-1 transition-colors disabled:opacity-50"
    >
      {pending ? "…" : RENDER_AGAIN}
    </button>
  );
}
