import { interpolate } from "@/lib/anim";
import { plateInitials, portraitOf } from "@/lib/portrait";
import type { Corner, FightEvent, Fighter, Sponsor } from "@/lib/types";
import { emberX, emberY, embers } from "./atmosphere";

/**
 * The pieces every bout template is built out of.
 *
 * TaleOfTheTape keeps its own copies of these and is deliberately left alone —
 * it is the one composition with five mp4s already published from it, and the
 * golden frames are signatures of exactly the picture it draws today. So the
 * promo templates share a set of parts here rather than the tape being opened up
 * to hand them out, and the duplication is the price of the tape not moving.
 *
 * Everything in this file is a pure function of what it is given. Nothing reads
 * a clock, holds state or animates in CSS, for the reason section 4 of the
 * handover gives: the exporter screenshots a frame number and every frame has to
 * be the same picture every time it is drawn.
 */

export const INK = "#07080a";
export const CHALK = "#f4f5f7";
export const ASH = "#9aa1ad";
export const RED = "#e8121f";
export const BLUE = "#1668f0";
export const GOLD = "#f0c04a";

export function accentOf(corner: Corner): string {
  return corner === "red" ? RED : BLUE;
}

export function cornerName(corner: Corner): string {
  return corner === "red" ? "Red Corner" : "Blue Corner";
}

/**
 * Embers are seeded from their index, so a template that asks for twenty gets
 * the same twenty in the same places on every render of a given frame. Built
 * once at module scope for the same reason the tape does it: rebuilding the
 * array per frame would still be deterministic, but it would allocate twenty
 * objects thirty times a second for nothing.
 */
const EMBERS = embers(20);

export function Embers({
  frame,
  width,
  height,
}: {
  frame: number;
  width: number;
  height: number;
}) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {EMBERS.map((ember, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: emberX(ember, frame, width),
            top: emberY(ember, frame, height),
            width: ember.size,
            height: ember.size,
            borderRadius: "50%",
            background: "#ffb47a",
            opacity: ember.opacity,
            filter: "blur(1px)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * The venue behind everything, drifting for the length of whatever is playing.
 *
 * `duration` rather than a constant, because the three promo templates are
 * different lengths and a drift tuned for sixteen seconds crosses six of them in
 * a rush. A show with no backdrop gets the ground colour, which is the ordinary
 * state of a promoter who has not uploaded one.
 */
export function Backdrop({
  event,
  frame,
  duration,
  opacity = 0.34,
}: {
  event: FightEvent;
  frame: number;
  duration: number;
  opacity?: number;
}) {
  if (!event.backdrop) return null;

  const scale = interpolate(frame, [0, duration], [1.06, 1.26]);
  const y = interpolate(frame, [0, duration], [0, -60]);

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={event.backdrop}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateY(${y}px)`,
          filter: "saturate(0.5) contrast(1.15)",
        }}
      />
    </div>
  );
}

export function Vignette() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.72) 100%)",
      }}
    />
  );
}

export function Label({
  children,
  size = 22,
  color = ASH,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: size,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Rule({
  width,
  color = "#ffffff",
  height = 2,
}: {
  width: number;
  color?: string;
  height?: number;
}) {
  return <div style={{ width, height, background: color, opacity: 0.85 }} />;
}

/**
 * A sponsor lockup: the emblem, and the name set in the app's own type.
 *
 * The name is never drawn into artwork and never generated, because a real
 * business's name misspelled by an image model is the one mistake in here that
 * costs somebody else money. The emblem is artwork; the words are ours.
 */
export function SponsorLockup({
  sponsor,
  size = 64,
  align = "center",
}: {
  sponsor: Sponsor;
  size?: number;
  align?: "center" | "left";
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: size * 0.24,
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      {sponsor.mark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sponsor.mark} alt="" style={{ width: size, height: size, opacity: 0.92 }} />
      ) : null}
      <div style={{ lineHeight: 1, textAlign: "left" }}>
        <div className="display" style={{ fontSize: size * 0.44 }}>
          {sponsor.name}
        </div>
        {sponsor.qualifier ? (
          <div
            className="font-mono"
            style={{
              marginTop: size * 0.08,
              fontSize: size * 0.2,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: ASH,
            }}
          >
            {sponsor.qualifier}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ portraits

/**
 * How a rectangle is given no edge of its own.
 *
 * The reasoning is the tape's, in full at the top of TaleOfTheTape.tsx: a cutout
 * can sit anywhere over a moving backdrop because its edge is the fighter's own
 * silhouette, and a photograph cannot, because four straight edges over a
 * drifting picture read as a photograph being dragged about. Two nested fades
 * rather than one composited mask, because nesting is the same result in every
 * browser and `mask-composite` is not, and a colour vignette as well as alpha,
 * because a portrait shot in a bright gym fades to a pale mass otherwise.
 */
const SOFT_MASK_Y =
  "linear-gradient(to bottom, transparent 0%, #000 12%, #000 56%, rgba(0,0,0,0.38) 84%, transparent 100%)";
const SOFT_MASK_X =
  "linear-gradient(to right, transparent 0%, #000 16%, #000 84%, transparent 100%)";
const SOFT_VIGNETTE =
  "radial-gradient(56% 46% at 50% 30%, transparent 10%, rgba(7,8,10,0.6) 56%, #07080a 95%)";

/** Fade on the side facing the seam. The outer side bleeds off the frame. */
function columnMaskX(corner: Corner): string {
  return `linear-gradient(to ${corner === "red" ? "right" : "left"}, #000 0%, #000 54%, transparent 100%)`;
}

const COLUMN_MASK_Y =
  "linear-gradient(to bottom, transparent 0%, #000 8%, #000 58%, transparent 96%)";

function columnVignette(corner: Corner): string {
  return (
    `linear-gradient(to ${corner === "red" ? "right" : "left"}, transparent 32%, rgba(7,8,10,0.6) 100%),` +
    "linear-gradient(to bottom, rgba(7,8,10,0.5) 0%, transparent 24%)"
  );
}

export type SubjectFrame =
  /** Free-standing, softened on all four sides. One fighter on their own. */
  | "soft"
  /** A tall column bled off the side of the picture, facing a centre seam. */
  | { column: Corner };

/**
 * A fighter where their face should be, in whichever of the four states
 * lib/portrait.ts decides on.
 *
 * It fills whatever box it is put in. The plate is the state for a fighter who
 * has sent nothing, which on an amateur card is most of the bill — so it is
 * drawn as a deliberate piece of the design rather than as a missing asset, and
 * it never says the fighter did anything wrong.
 */
export function Subject({
  fighter,
  accent,
  frame: shape = "soft",
  /** Mirrors a cutout so two corners square up. Never a photograph: see below. */
  mirror = false,
  objectPosition = "50% 14%",
}: {
  fighter: Fighter;
  accent: string;
  frame?: SubjectFrame;
  mirror?: boolean;
  objectPosition?: string;
}) {
  const portrait = portraitOf(fighter);

  if (portrait.kind === "plate") {
    return <InitialPlate fighter={fighter} accent={accent} />;
  }

  if (portrait.kind === "cutout") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={portrait.src}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: shape === "soft" ? "contain" : "cover",
          objectPosition: "top center",
          transform: mirror ? "scaleX(-1)" : undefined,
          filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.75)) contrast(1.06)",
          maskImage: shape === "soft" ? undefined : "linear-gradient(to bottom, #000 64%, transparent 97%)",
          WebkitMaskImage:
            shape === "soft" ? undefined : "linear-gradient(to bottom, #000 64%, transparent 97%)",
        }}
      />
    );
  }

  // Anything that is not a cutout and not the plate is a rectangle with a
  // background of its own — a photograph, or the poster art a fighter approved.
  // Written that way round so a fifth kind added to lib/portrait.ts gets the
  // treatment a rectangle needs rather than falling through to the plate.
  //
  // A photograph is never mirrored, where a cutout is. Reversing a picture of a
  // real room reverses the lettering on a gym vest and on a sponsor's banner up
  // the wall, and a fighter facing the wrong way is a smaller error than a
  // sponsor's name printed backwards.
  const maskY = shape === "soft" ? SOFT_MASK_Y : COLUMN_MASK_Y;
  const maskX = shape === "soft" ? SOFT_MASK_X : columnMaskX(shape.column);
  const vignette = shape === "soft" ? SOFT_VIGNETTE : columnVignette(shape.column);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        maskImage: maskY,
        WebkitMaskImage: maskY,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={portrait.src}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // Heads sit near the top of a phone snapshot, so the crop favours the
          // top of the frame rather than its middle. Fixed rather than
          // interpolated: the frame-driven move belongs to the wrapper.
          objectPosition,
          maskImage: maskX,
          WebkitMaskImage: maskX,
          filter: "saturate(0.86) contrast(1.06) brightness(0.94)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: vignette,
          maskImage: maskX,
          WebkitMaskImage: maskX,
        }}
      />
    </div>
  );
}

/**
 * The fighter who has sent no photograph.
 *
 * Their initials, set as a slab, with the corner colour around it. It says the
 * picture is still to come and nothing about whose fault that is — most of an
 * amateur card is in this state on the week of the show.
 */
export function InitialPlate({
  fighter,
  accent,
  size = 200,
}: {
  fighter: Fighter;
  accent: string;
  size?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.1,
          backgroundImage: "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 18px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "18% 20%",
          border: `3px solid ${accent}`,
          opacity: 0.35,
        }}
      />
      <div className="display" style={{ fontSize: size, opacity: 0.4 }}>
        {plateInitials(fighter.name)}
      </div>
      <Label size={20}>Photo to follow</Label>
    </div>
  );
}
