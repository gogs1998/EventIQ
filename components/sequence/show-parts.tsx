import { interpolate, progress } from "@/lib/anim";
import type { Card } from "@/lib/card";
import { plateInitials, portraitOf } from "@/lib/portrait";
import type { QrMatrix } from "@/lib/qr";
import { qrPath } from "@/lib/qr";
import type { FightEvent, Fighter, Sponsor } from "@/lib/types";
import { emberX, emberY, embers } from "./atmosphere";
import { SEQ } from "./timeline";

/**
 * The furniture the three show-level compositions share.
 *
 * Everything here is a pure function of the numbers it is handed, exactly as
 * TaleOfTheTape is, and for the same reason: the exporter screenshots a frame at
 * a time and frame n has to be the same picture every time it is drawn.
 *
 * The small type and rule helpers are written out again rather than lifted out
 * of TaleOfTheTape. That file is the centrepiece and is being worked on beside
 * this; a shared header pulled out of it now would be an edit to the one
 * component with a rule about not being edited casually, for two divs.
 */

/**
 * What every show-level composition is drawn from.
 *
 * `now` is a prop rather than a call to Date.now() inside the composition, for
 * the same reason `card` is: a component that reads the clock draws a different
 * picture on every one of the frames the exporter captures, and "N days to go"
 * is exactly the sort of thing that would tick over halfway through a render.
 * The page fixes it once, at the top of the capture.
 */
export type ShowSceneProps = {
  card: Card;
  frame: number;
  /** Milliseconds since the epoch, fixed by the capture page. */
  now: number;
  /** The code for this show's programme, worked out on the server. */
  qr: QrMatrix;
};

export const INK = "#07080a";
export const CHALK = "#f4f5f7";
export const ASH = "#9aa1ad";
export const RED = "#e8121f";
export const BLUE = "#1668f0";
export const GOLD = "#f0c04a";

/** Fewer and dimmer than the bout sequence's: these frames carry more type. */
const EMBERS = embers(14, 11);

export function Label({
  children,
  size = 20,
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

export function Rule({ width, color = CHALK }: { width: number; color?: string }) {
  return <div style={{ width, height: 2, background: color, opacity: 0.85 }} />;
}

/**
 * The venue, drifting for the length of whatever it is behind.
 *
 * Takes its own duration rather than reading SEQ, because these three run to
 * three different lengths and a drift scaled to sixteen seconds finishes early
 * on the eight-second one and stops dead.
 */
export function Backdrop({
  event,
  frame,
  duration,
}: {
  event: FightEvent;
  frame: number;
  duration: number;
}) {
  if (!event.backdrop) return null;

  const scale = interpolate(frame, [0, duration], [1.06, 1.24]);
  const y = interpolate(frame, [0, duration], [0, -60]);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: 0.28 }}>
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

/**
 * Positions are rounded to a hundredth of a pixel, which is finer than anything
 * anybody can see and coarser than a float.
 *
 * React writes a style attribute out as `left:296.271182078186px`, the browser
 * parses it back as `296.271px`, and hydration then reports a mismatch on every
 * ember on the page. Nothing about the picture is wrong — but in development
 * Next.js puts an issue badge in the corner of the viewport for it, and the
 * corner of the viewport is inside the frame the exporter screenshots.
 */
const place = (value: number): number => Math.round(value * 100) / 100;

export function Embers({ frame }: { frame: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {EMBERS.map((ember, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: place(emberX(ember, frame, SEQ.width)),
            top: place(emberY(ember, frame, SEQ.height)),
            width: place(ember.size),
            height: place(ember.size),
            borderRadius: "50%",
            background: "#ffb47a",
            opacity: place(ember.opacity),
            filter: "blur(1px)",
          }}
        />
      ))}
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
        background: "radial-gradient(118% 78% at 50% 42%, transparent 42%, rgba(0,0,0,0.74) 100%)",
      }}
    />
  );
}

/**
 * A sponsor's emblem with their name set beside it in the app's own type.
 *
 * The emblem is artwork and the name never is: an image generator misspells a
 * real business's name and a promoter cannot sell a placement that is wrong. The
 * same rule as the sponsor strip on the programme, applied to a frame of video.
 */
export function SponsorEmblems({
  sponsors,
  opacity,
  size = 56,
  gap = 34,
}: {
  sponsors: Sponsor[];
  opacity: number;
  size?: number;
  gap?: number;
}) {
  if (!sponsors.length) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap,
        opacity,
      }}
    >
      {sponsors.map((sponsor) => (
        <div key={sponsor.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {sponsor.mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sponsor.mark} alt="" style={{ width: size, height: size, opacity: 0.9 }} />
          ) : null}
          <div style={{ lineHeight: 1 }}>
            <div className="display" style={{ fontSize: size * 0.4 }}>
              {sponsor.name}
            </div>
            {sponsor.qualifier ? (
              <div
                className="font-mono"
                style={{
                  fontSize: size * 0.23,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: ASH,
                  marginTop: 4,
                }}
              >
                {sponsor.qualifier}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The code, drawn from the matrix the page worked out. White plate, because a
 * scanner wants the contrast and a phone pointed at a screen across a room gets
 * one attempt at it.
 */
export function QrPlate({
  matrix,
  size,
  opacity = 1,
}: {
  matrix: QrMatrix;
  size: number;
  opacity?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: CHALK,
        padding: size * 0.04,
        opacity,
      }}
    >
      <svg
        viewBox={`0 0 ${matrix.size} ${matrix.size}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
      >
        <path d={qrPath(matrix)} fill="#000000" />
      </svg>
    </div>
  );
}

/**
 * A fighter's face at the size a running order can afford: a disc.
 *
 * Most of an amateur card has sent nothing, so the plate is the ordinary state
 * rather than the exception, and it is initials on a ring — not the reveal's
 * "Photo to follow" slab, which is a prompt aimed at the fighter and has no
 * business on something a promoter posts to sell tickets.
 */
export function PortraitChip({
  fighter,
  size,
  accent,
  opacity = 1,
}: {
  fighter: Fighter;
  size: number;
  accent: string;
  opacity?: number;
}) {
  const portrait = portraitOf(fighter);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#12151b",
        border: `2px solid ${accent}`,
        flexShrink: 0,
        opacity,
      }}
    >
      {portrait.kind === "plate" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="display" style={{ fontSize: size * 0.4, color: ASH }}>
            {plateInitials(fighter.name)}
          </span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait.src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Heads sit near the top of a portrait snapshot, and a cutout has
            // nothing but head at the top of its frame.
            objectPosition: portrait.kind === "cutout" ? "50% 4%" : "50% 18%",
            filter: "saturate(0.9) contrast(1.05)",
          }}
        />
      )}
    </div>
  );
}

/**
 * A line that rises as it fades in. Written once because all three compositions
 * open with one and it is the same eight characters of arithmetic each time.
 */
export function riseIn(
  frame: number,
  start: number,
  end: number,
  distance = 40,
): { opacity: number; transform: string } {
  const t = progress(frame, start, end);
  return {
    opacity: t,
    transform: `translateY(${interpolate(frame, [start, end], [distance, 0])}px)`,
  };
}
