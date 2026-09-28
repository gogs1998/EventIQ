"use client";

import { useState, useTransition } from "react";
import { markVideoSent } from "@/app/promoter/invite-actions";
import { ActionStatus } from "@/components/ActionStatus";
import { VIDEO_SHARE, videoSentNote } from "@/lib/copy";

/**
 * Hands one fighter their own bout's promo.
 *
 * Same shape as the invite's send, and deliberately so: an anchor into the
 * promoter's own WhatsApp with the message already written, not a send. There is
 * no messaging provider behind this product and adding one would be the wrong
 * trade — a fighter answers a message from the promoter they know and ignores
 * one from a service they have never heard of.
 *
 * What it records is the tap, which is the only moment anything here can
 * observe. That is what lets the dashboard tell "nobody has been told there is
 * a video" from "they were told", and it is never inferred from a render
 * finishing: a video being made is not a video being handed over.
 */
export function SendVideo({
  slug,
  fighters,
}: {
  slug: string;
  fighters: readonly {
    id: string;
    /** What the control is labelled with. A first name, so the row stays short. */
    label: string;
    message: string;
    sentAt?: number;
  }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const record = (fighterId: string) =>
    start(async () => {
      const result = await markVideoSent(slug, fighterId);
      setError(result.ok ? null : result.error);
    });

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {fighters.map((fighter) => (
          <a
            key={fighter.id}
            href={`https://wa.me/?text=${encodeURIComponent(fighter.message)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => record(fighter.id)}
            title={VIDEO_SHARE.sendHint}
            className="border-hairline hover:border-chalk/40 shrink-0 border px-2 py-1 font-mono text-[0.5rem] uppercase tracking-[0.14em] transition-colors"
          >
            {VIDEO_SHARE.send}: {fighter.label}
          </a>
        ))}
      </div>
      {/* Beside the control rather than inside it, and only where it happened.
          A promoter deciding whether to message somebody again wants when. */}
      {fighters.some((fighter) => fighter.sentAt) ? (
        <div className="text-ash-dim font-mono text-[0.5rem] uppercase tracking-[0.1em]">
          {fighters
            .filter((fighter) => fighter.sentAt)
            .map((fighter) => `${fighter.label} · ${videoSentNote(fighter.sentAt)}`)
            .join("  ")}
        </div>
      ) : null}
      <ActionStatus error={error} className="text-[0.65rem]" />
    </div>
  );
}
