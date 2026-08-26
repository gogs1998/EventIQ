"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";

/**
 * Copies a ready-written chase message. The promoter's next action after this
 * is pasting it into WhatsApp, so the whole job is one tap and no typing.
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Clipboard can be blocked; the message is still on screen to select.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={message}
      aria-label={`Copy a chase message for ${name}`}
      className={cx(
        "shrink-0 border transition-colors",
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
  );
}
