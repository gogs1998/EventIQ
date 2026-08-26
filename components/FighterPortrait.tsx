import { cx } from "@/lib/cx";
import type { Corner, Fighter } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

/**
 * A fighter who has not sent a photo is the normal case on an amateur card, so
 * the empty state is designed rather than left blank: corner-tinted, initialled,
 * and captioned so it reads as "not in yet" instead of "broken".
 */
export function FighterPortrait({
  fighter,
  corner,
  className,
  rounded = true,
}: {
  fighter: Fighter;
  corner: Corner;
  className?: string;
  rounded?: boolean;
}) {
  const tint =
    corner === "red"
      ? "from-red-corner/45 via-red-corner/10"
      : "from-blue-corner/45 via-blue-corner/10";

  return (
    <div
      className={cx(
        "bg-panel relative overflow-hidden",
        rounded && "rounded-sm",
        className,
      )}
    >
      {fighter.photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fighter.photo}
            alt={fighter.name}
            className="absolute inset-0 h-full w-full object-cover object-top"
            loading="lazy"
          />
          <div
            className={cx(
              "absolute inset-0 bg-gradient-to-t to-transparent mix-blend-multiply",
              tint,
            )}
          />
          <div className="from-ink/85 absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 9px)",
            }}
          />
          <div
            className={cx("absolute inset-0 bg-gradient-to-t to-transparent", tint)}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="display text-ash-dim text-3xl leading-none">
              {initials(fighter.name)}
            </span>
            <span className="text-ash-dim font-mono text-[0.45rem] uppercase tracking-[0.2em]">
              No photo
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
