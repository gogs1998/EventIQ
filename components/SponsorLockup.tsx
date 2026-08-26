import { cx } from "@/lib/cx";
import type { Sponsor } from "@/lib/types";

/**
 * The emblem is artwork but the name is set in our own type, so a sponsor's
 * name is never at the mercy of an image.
 */
export function SponsorLockup({
  sponsor,
  size = "md",
  className,
}: {
  sponsor: Sponsor;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const mark = { sm: "h-5 w-5", md: "h-8 w-8", lg: "h-12 w-12" }[size];
  const name = { sm: "text-[0.6rem]", md: "text-xs", lg: "text-base" }[size];

  return (
    <div className={cx("flex items-center gap-2", className)}>
      {sponsor.mark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sponsor.mark}
          alt=""
          className={cx(mark, "shrink-0 opacity-85")}
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 leading-none">
        <div className={cx("display text-chalk truncate", name)}>{sponsor.name}</div>
        {sponsor.qualifier ? (
          <div
            className={cx(
              "text-ash truncate font-mono uppercase tracking-[0.18em]",
              size === "sm" ? "text-[0.5rem]" : "text-[0.55rem]",
            )}
          >
            {sponsor.qualifier}
          </div>
        ) : null}
      </div>
    </div>
  );
}
