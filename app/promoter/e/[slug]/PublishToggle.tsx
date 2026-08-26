"use client";

import { useTransition } from "react";
import { setPublished } from "@/app/promoter/actions";
import { cx } from "@/lib/cx";

/**
 * The one control that decides whether a stranger can read the card.
 *
 * Deliberately a button with the current state written on it rather than a
 * switch, because a promoter glancing at this needs to know whether the show is
 * live, not what tapping would do.
 */
export function PublishToggle({ slug, published }: { slug: string; published: boolean }) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void setPublished(slug, !published))}
      className={cx(
        "label border px-3 py-2 transition-colors disabled:opacity-50",
        published
          ? "border-gold/50 text-gold hover:border-gold"
          : "border-red-corner/50 text-red-corner-hot hover:border-red-corner",
      )}
    >
      {pending ? "…" : published ? "Published — unpublish" : "Not published — publish"}
    </button>
  );
}
