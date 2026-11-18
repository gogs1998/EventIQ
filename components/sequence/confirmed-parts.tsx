import { plateInitials, portraitOf } from "@/lib/portrait";
import { qrPath } from "@/lib/qr";
import type { Fighter } from "@/lib/types";
import { CHALK, INK, Subject } from "./parts";

/**
 * The pieces the three "confirmed" looks share.
 *
 * Pure functions of their props, like everything under components/sequence:
 * the exporter screenshots a frame number and needs the same picture each time.
 */

/** Seven and a half to eight seconds. Long enough to read, short enough for a story. */
export const CONFIRMED_FRAMES = {
  stamp: 225,
  poster: 240,
  broadcast: 240,
} as const;

/**
 * The fighter, as large as the box allows.
 *
 * lib/portrait.ts decides which of the states this is; this only decides how a
 * fighter with nothing sent is drawn on a clip that is *about* them. The plate
 * the two-corner templates use says "photo to follow", which is right on a
 * promoter's promo and wrong on a video the fighter posts themselves — it would
 * be the one line on their own announcement about something not yet done. So it
 * is their initials instead, set as the picture, and nothing else.
 */
export function Hero({
  fighter,
  accent,
  objectPosition = "50% 12%",
}: {
  fighter: Fighter;
  accent: string;
  objectPosition?: string;
}) {
  if (portraitOf(fighter).kind !== "plate") {
    return <Subject fighter={fighter} accent={accent} objectPosition={objectPosition} />;
  }
  return <Monogram fighter={fighter} accent={accent} />;
}

export function hasPicture(fighter: Fighter): boolean {
  return portraitOf(fighter).kind !== "plate";
}

function Monogram({ fighter, accent }: { fighter: Fighter; accent: string }) {
  const initials = plateInitials(fighter.name);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "8% 4%",
          background: `radial-gradient(50% 50% at 50% 50%, ${accent}55 0%, transparent 70%)`,
        }}
      />
      <div
        className="display"
        style={{
          fontSize: initials.length > 1 ? 620 : 760,
          lineHeight: 0.8,
          letterSpacing: "-0.04em",
          color: "transparent",
          WebkitTextStroke: "5px rgba(244,245,247,0.42)",
          backgroundImage: `repeating-linear-gradient(135deg, ${accent}99 0 4px, transparent 3px 22px)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          filter: `drop-shadow(0 30px 60px rgba(0,0,0,0.6))`,
        }}
      >
        {initials}
      </div>
    </div>
  );
}

/**
 * The programme's code, as geometry.
 *
 * Points at SITE_URL, never at whatever origin rendered it: the file leaves the
 * app and is watched on somebody else's phone, so a code naming localhost would
 * work for nobody. Same choice, same reason, as the face-off's close.
 */
export function ProgrammeQr({ url, size }: { url: string; size: number }) {
  const code = qrPath(url);
  const quiet = 2;
  return (
    <div
      style={{
        width: size,
        height: size,
        background: CHALK,
        padding: Math.round(size * 0.06),
        boxSizing: "border-box",
      }}
    >
      <svg
        viewBox={`${-quiet} ${-quiet} ${code.size + quiet * 2} ${code.size + quiet * 2}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d={code.path} fill={INK} />
      </svg>
    </div>
  );
}

/**
 * A diagonal band of light crossing the frame once, at `t` from 0 to 1.
 *
 * A gradient moved by the frame number rather than a CSS animation, so frame n
 * is the same band in the same place on every capture.
 */
export function LightSweep({
  t,
  angle = 112,
  strength = 0.5,
}: {
  t: number;
  angle?: number;
  strength?: number;
}) {
  if (t <= 0 || t >= 1) return null;
  const at = -30 + t * 160;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        mixBlendMode: "screen",
        background: `linear-gradient(${angle}deg, transparent ${at - 14}%, rgba(255,255,255,${strength * 0.35}) ${at - 4}%, rgba(255,255,255,${strength}) ${at}%, rgba(255,255,255,${strength * 0.35}) ${at + 4}%, transparent ${at + 14}%)`,
      }}
    />
  );
}

/**
 * A decaying shake after an impact, in pixels. Sine rather than random, so it
 * is the same offset for the same frame every time it is asked.
 */
export function shake(f: number, at: number, length: number, amplitude: number): { x: number; y: number } {
  if (f < at || f > at + length) return { x: 0, y: 0 };
  const decay = 1 - (f - at) / length;
  const amp = amplitude * decay * decay;
  return { x: amp * Math.sin((f - at) * 2.6), y: amp * 0.6 * Math.cos((f - at) * 3.3) };
}
