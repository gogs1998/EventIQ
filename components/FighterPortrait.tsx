import { cx } from "@/lib/cx";
import { plateInitials, portraitOf } from "@/lib/portrait";
import type { Corner, Fighter } from "@/lib/types";

/**
 * A fighter's face on the programme, chosen by the same rule as everywhere else.
 *
 * It read `fighter.photo` directly, which made this the one surface that could
 * disagree with the rest: a fighter who asked for a stylised portrait and
 * approved it saw it in the questionnaire preview and in their video, and their
 * own profile page still showed the photograph it was drawn from. `portraitOf`
 * is the single place that decides between the four — see lib/portrait.ts — so
 * this asks it rather than keeping a fifth opinion.
 *
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
  const portrait = portraitOf(fighter);
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
      {portrait.kind !== "plate" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portrait.src}
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
              {plateInitials(fighter.name)}
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
