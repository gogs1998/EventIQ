"use client";

import { useState, useTransition } from "react";
import { setPublished } from "@/app/promoter/actions";
import { ActionStatus } from "@/components/ActionStatus";
import { cx } from "@/lib/cx";

/**
 * The one control that decides whether a stranger can read the card.
 *
 * Deliberately a button with the current state written on it rather than a
 * switch, because a promoter glancing at this needs to know whether the show is
 * live, not what tapping would do.
 *
 * Which is exactly why it must not fail quietly. A publish that did not go
 * through left the button reading "not published" with no reason given, and the
 * commonest reason by a distance is a session that ran out while the card was
 * being typed.
 */
export function PublishToggle({ slug, published }: { slug: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    // The status is out of the layout while it is empty, so this is still one
    // button on the row of controls it sits in.
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setPublished(slug, !published);
            setError(result.ok ? null : result.error);
          })
        }
        className={cx(
          "label border px-3 py-2 transition-colors disabled:opacity-50",
          published
            ? "border-gold/50 text-gold hover:border-gold"
            : "border-red-corner/50 text-red-corner-hot hover:border-red-corner",
        )}
      >
        {pending ? "…" : published ? "Published — unpublish" : "Not published — publish"}
      </button>
      <ActionStatus error={error} />
    </div>
  );
}
