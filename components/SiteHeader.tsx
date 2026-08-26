"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mastheadFor } from "@/lib/masthead";

/**
 * The masthead, mounted once in the root layout and deciding for itself whether
 * the route it has landed on is one EventIQ is entitled to put its name at the
 * top of. `lib/masthead.ts` holds that judgement and the reasoning behind it.
 *
 * It reads the pathname rather than being mounted per route group because the
 * app has no route groups: `/`, `/e`, `/f`, `/promoter` and `/render` are all
 * directories directly under `app/`, and introducing groups to hang three
 * layouts off would move every route file to buy a rule that fits in a line.
 *
 * The mark is the deployed favicon, not a copy of it. Every coordinate in it is
 * emitted from GEOMETRY in scripts/make-icons.mjs, so fetching the same file the
 * tab strip gets is what keeps the masthead from drifting away from the icon.
 */
export function SiteHeader() {
  const masthead = mastheadFor(usePathname());
  if (masthead === "none") return null;

  const full = masthead === "full";

  return (
    // The hairline is the same rule that divides every section below it, so the
    // masthead reads as the first band of the page rather than as furniture
    // bolted above it.
    <header className="border-hairline shrink-0 border-b">
      <div
        className={
          full
            ? "mx-auto flex w-full max-w-5xl items-center px-5 py-3.5 sm:py-4"
            : "mx-auto flex w-full max-w-5xl items-center px-4 py-3 sm:px-6"
        }
      >
        {/* Always to `/`, from the promoter's side too, which is where the
            "Back to EventIQ" links already at the foot of those pages go. */}
        <Link href="/" className="group flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 332 bytes of
              hand-authored vector; the image pipeline has nothing to do to it. */}
          <img
            src="/icon.svg"
            alt=""
            width={32}
            height={32}
            className={full ? "h-7 w-7 sm:h-8 sm:w-8" : "h-5 w-5"}
          />
          {/* Confident, and still less than half the size of the hero headline
              underneath, which has to stay the loudest thing on the page. */}
          <span
            className={
              full
                ? "display text-chalk group-hover:text-gold pt-0.5 text-2xl transition-colors sm:text-3xl"
                : "display text-ash group-hover:text-chalk pt-0.5 text-base transition-colors"
            }
          >
            EventIQ
          </span>
        </Link>
      </div>
    </header>
  );
}
