"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PAGE_ERROR } from "@/lib/copy";
import { logError } from "@/lib/log";

/**
 * What a route shows when it throws.
 *
 * The root layout survives this, so the masthead above it is still the one
 * `lib/masthead.ts` decided on for the address that broke: EventIQ's name on the
 * promoter's side, nothing at all over a programme. That is the whole reason
 * this is one boundary rather than one per segment — the branding rule is
 * already written down once and this inherits it.
 *
 * In production the browser is handed a digest instead of the message, so the
 * only way to join this to the server log that has the stack in it is to log the
 * digest from both ends. `error.digest` is what does that.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    logError({ event: "render", route: pathname, digest: error.digest }, error);
  }, [error, pathname]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-24">
      <span className="label">Something went wrong</span>
      <h1 className="display mt-3 text-4xl">{PAGE_ERROR.heading}</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">{PAGE_ERROR.body}</p>

      <button
        type="button"
        onClick={reset}
        className="bg-chalk text-ink display hover:bg-gold mt-8 self-start px-6 py-3 text-lg transition-colors"
      >
        {PAGE_ERROR.retry}
      </button>

      {/* Only ever a digest, never a message: the message can name a table or a
          binding, and this page is reachable by a spectator. */}
      {error.digest ? (
        <p className="text-ash-dim mt-6 font-mono text-[0.55rem] uppercase tracking-[0.16em]">
          Reference {error.digest}
        </p>
      ) : null}
    </main>
  );
}
