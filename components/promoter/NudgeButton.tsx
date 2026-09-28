"use client";

import { useState } from "react";
import { ActionStatus } from "@/components/ActionStatus";
import { INVITE_SHARE } from "@/lib/copy";
import { cx } from "@/lib/cx";

/**
 * Copies a ready-written chase message. The promoter's next action after this
 * is pasting it into WhatsApp, so the whole job is one tap and no typing.
 *
 * Which is exactly why it must not say "Copied" when nothing was. A clipboard
 * write is refused over plain http, in a hardened profile and behind some
 * extensions, and this used to swallow that and report success anyway — on the
 * one control in the product whose result is invisible until somebody pastes.
 * Bug 36 is the same mistake one layer down.
 */
export function NudgeButton({
  message,
  name,
  compact = false,
}: {
  message: string;
  name: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      setError(INVITE_SHARE.nudgeNotCopied);
      return;
    }
    setError(null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    // The status is out of the layout while it is empty, so the ordinary row is
    // still one button wide.
    <div className="grid gap-1">
      <button
        type="button"
        onClick={() => void copy()}
        title={message}
        aria-label={`Copy a chase message for ${name}`}
        className={cx(
          "shrink-0 justify-self-start border transition-colors",
          compact
            ? "px-2 py-1 font-mono text-[0.5rem] uppercase tracking-[0.12em]"
            : "px-3 py-1.5 text-xs",
          copied
            ? "border-gold text-gold"
            : "border-hairline text-ash hover:border-chalk/40 hover:text-chalk",
        )}
      >
        {copied ? "Copied" : "Copy nudge"}
      </button>
      <ActionStatus error={error} className="text-[0.65rem]" />
    </div>
  );
}
