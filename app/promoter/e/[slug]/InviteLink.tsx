"use client";

import { useState, useTransition } from "react";
import { markInviteSent, regenerateInvite } from "@/app/promoter/actions";

/**
 * A fighter's link, ready to paste.
 *
 * The token is shown rather than hidden behind a "copy" that reveals nothing:
 * a promoter forwarding this on WhatsApp needs to be able to see they have the
 * right one, and there is nothing secret about it from the person holding the
 * dashboard.
 *
 * The address is built in the browser from the current origin so a link copied
 * off a laptop in a meeting actually opens, which is not true of one built from
 * the configured public URL while working locally.
 */
export function InviteLink({
  slug,
  fighterId,
  token,
  sent,
}: {
  slug: string;
  fighterId: string;
  token: string;
  sent: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const copy = async () => {
    const url = `${window.location.origin}/f/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    // Copying it is not the same as sending it, but it is the only moment we can
    // observe, so the promoter is asked to confirm rather than having it assumed.
    if (!sent) start(() => void markInviteSent(slug, fighterId));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="bg-panel text-ash-dim min-w-0 truncate px-2 py-1 font-mono text-[0.55rem]">
        /f/{token.slice(0, 10)}…
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={pending}
        className="border-hairline hover:border-chalk/40 shrink-0 border px-2 py-1 font-mono text-[0.5rem] uppercase tracking-[0.14em] transition-colors disabled:opacity-50"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={() => start(() => void regenerateInvite(slug, fighterId))}
        disabled={pending}
        className="text-ash-dim hover:text-chalk shrink-0 font-mono text-[0.5rem] uppercase tracking-[0.14em] transition-colors disabled:opacity-50"
        title="Issues a new link and stops the old one working"
      >
        New link
      </button>
    </div>
  );
}
