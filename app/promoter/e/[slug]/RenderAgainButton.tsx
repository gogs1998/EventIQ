"use client";

import { useState, useTransition } from "react";
import { requestRender } from "@/app/promoter/render-actions";
import { ActionStatus } from "@/components/ActionStatus";
import { RENDER_AGAIN } from "@/lib/copy";

/**
 * Asks for a bout's video to be made again.
 *
 * It queues and nothing more, so the label says what it does rather than what it
 * will produce. Rendering happens on a machine that is not this one and may not
 * be awake, and a button implying otherwise would be the dashboard making a
 * promise on somebody else's behalf.
 *
 * Which is why it also has to say when the queueing itself did not happen. This
 * was the last control on the promoter's side still throwing its result away:
 * the button greyed out, came back, and a promoter whose session had run out
 * went on waiting for a video nothing had been asked for.
 */
export function RenderAgainButton({ slug, bout }: { slug: string; bout: number | "all" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    // The status is out of the layout while it is empty, so this stays one
    // button on the row it sits in.
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await requestRender(slug, bout);
            setError(result.ok ? null : result.error);
          })
        }
        className="border-hairline hover:border-chalk/40 label shrink-0 border px-2 py-1 transition-colors disabled:opacity-50"
      >
        {pending ? "…" : RENDER_AGAIN}
      </button>
      <ActionStatus error={error} className="text-right text-[0.65rem]" />
    </div>
  );
}
