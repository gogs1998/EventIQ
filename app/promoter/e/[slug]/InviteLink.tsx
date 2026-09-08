"use client";

import { useState, useTransition } from "react";
import { markInviteSent, regenerateInvite, revokeInvite } from "@/app/promoter/invite-actions";
import { ActionStatus } from "@/components/ActionStatus";
import { INVITE_SHARE, INVITE_STATE } from "@/lib/copy";
import type { LinkState } from "@/lib/promoter";
import type { SentChannel } from "@/lib/types";

/**
 * A fighter's link, and the four things a promoter does with it.
 *
 * The token is shown rather than hidden behind a "copy" that reveals nothing: a
 * promoter forwarding this on WhatsApp needs to be able to see they have the
 * right one, and there is nothing secret about it from the person holding the
 * dashboard.
 *
 * **Send is a deep link, not a send.** There is no SMS or email provider behind
 * this product and adding one would be the wrong trade: a fighter answers a
 * message from the promoter they know and ignores one from a service they have
 * never heard of. So these hand the promoter's own WhatsApp or messages app the
 * finished message with the link already in it, and record which one was used on
 * the way past. That recording is the whole reason the chase list can tell
 * "never went out" from "went out and was ignored" (HANDOVER bug 9).
 *
 * "New link" and "Revoke link" sit together because they answer different
 * problems: a link that went to the wrong number wants replacing, and a link
 * that went somewhere it should not have wants stopping. Neither can be allowed
 * to fail silently — a promoter who presses one and sees nothing carries on as
 * though it worked, and in both cases the thing they think has stopped has not.
 */
export function InviteLink({
  slug,
  fighterId,
  token,
  message,
  state,
}: {
  slug: string;
  fighterId: string;
  /** Absent only where the stored link cannot be read back, i.e. a rotated key. */
  token?: string;
  /** The nudge, already written, with this fighter's own link in it. */
  message: string;
  state: LinkState;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const record = (channel: SentChannel) =>
    start(async () => {
      const result = await markInviteSent(slug, fighterId, channel);
      setError(result.ok ? null : result.error);
    });

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(`${window.location.origin}/f/${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    // Copying is not sending, but it is the moment that can be observed, and a
    // promoter who copies a link is on their way to pasting it somewhere.
    record("copied");
  };

  const share =
    "border-hairline hover:border-chalk/40 shrink-0 border px-2 py-1 font-mono text-[0.5rem] uppercase tracking-[0.14em] transition-colors";
  const quiet =
    "text-ash-dim hover:text-chalk shrink-0 font-mono text-[0.5rem] uppercase tracking-[0.14em] transition-colors disabled:opacity-50";

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-panel text-ash-dim min-w-0 truncate px-2 py-1 font-mono text-[0.55rem]">
          {token ? `/f/${token.slice(0, 10)}…` : "—"}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={pending || !token}
          className={`${share} disabled:opacity-50`}
        >
          {copied ? "Copied" : INVITE_SHARE.copy}
        </button>
        {/* Anchors rather than buttons: these hand an address to the operating
            system, which is what opens the promoter's own app with the message
            in it. Nothing is sent from here. */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => record("whatsapp")}
          className={share}
        >
          {INVITE_SHARE.whatsapp}
        </a>
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          onClick={() => record("sms")}
          className={share}
        >
          {INVITE_SHARE.sms}
        </a>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              const result = await regenerateInvite(slug, fighterId);
              setError(result.ok ? null : result.error);
            })
          }
          disabled={pending}
          className={quiet}
          title={INVITE_SHARE.regenerateHint}
        >
          {INVITE_SHARE.regenerate}
        </button>
        {state === "live" ? (
          <button
            type="button"
            onClick={() =>
              start(async () => {
                const result = await revokeInvite(slug, fighterId);
                setError(result.ok ? null : result.error);
              })
            }
            disabled={pending}
            className={quiet}
            title={INVITE_SHARE.revokeHint}
          >
            {INVITE_SHARE.revoke}
          </button>
        ) : null}
      </div>
      {state !== "live" || !token ? (
        <p className="text-ash-dim text-[0.65rem] leading-relaxed">
          {state === "revoked"
            ? INVITE_STATE.revoked
            : state === "expired"
              ? INVITE_STATE.expired
              : INVITE_STATE.unreadable}
        </p>
      ) : null}
      <ActionStatus error={error} className="text-[0.65rem]" />
    </div>
  );
}
