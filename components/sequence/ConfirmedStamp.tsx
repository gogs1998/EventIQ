import { easeOutBack, easeOutCubic, easeOutExpo, interpolate, progress, pulse } from "@/lib/anim";
import type { Card } from "@/lib/card";
import { CONFIRMED_COPY, announcementOf, fitSize, type Announcement } from "@/lib/confirmed";
import type { Bout, Corner } from "@/lib/types";
import { CONFIRMED_FRAMES, Hero, hasPicture, LightSweep, ProgrammeQr, shake } from "./confirmed-parts";
import { ASH, Backdrop, CHALK, Embers, GOLD, INK, Label, SponsorLockup, Vignette, accentOf } from "./parts";
import { SEQ } from "./timeline";

/**
 * "Confirmed", stamped. One fighter, seven and a half seconds, for them to post.
 *
 * The face-off works because the fighters arrive rather than fade in and the
 * type is too big to scroll past. This keeps both and adds one beat the
 * face-off does not have: the fighter is already standing there, large, and the
 * word lands on them like ink on a contract. Everything after that is the
 * small print a follower needs — who, when, where, and the way in.
 *
 * Everything readable sits between y 220 and y 1700, clear of the bars a story
 * draws over the top and bottom of the frame.
 *
 * Pure function of `frame`. Handover section 4.
 */

const FRAMES = CONFIRMED_FRAMES.stamp;
const IMPACT = 46;
const CLOSE = 158;

export function ConfirmedStamp({
  card,
  bout,
  frame,
  corner,
}: {
  card: Card;
  bout: Bout;
  frame: number;
  corner: Corner;
}) {
  const a = announcementOf(card, bout, corner);
  const accent = accentOf(corner);
  const f = frame;

  const rise = interpolate(f, [0, 28], [180, 0], easeOutExpo);
  const push = interpolate(f, [0, 28], [1.16, 1.03], easeOutExpo) - interpolate(f, [28, FRAMES], [0, 0.04]);
  const jolt = shake(f, IMPACT + 6, 16, 18);
  const flash = pulse(f, IMPACT + 5, IMPACT + 7, IMPACT + 8, IMPACT + 18) * 0.32;
  const fadeOut = 1 - progress(f, FRAMES - 6, FRAMES);

  return (
    <div
      style={{
        position: "relative",
        width: SEQ.width,
        height: SEQ.height,
        overflow: "hidden",
        background: INK,
        color: CHALK,
      }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `translate(${jolt.x}px, ${jolt.y}px)` }}>
        <Backdrop event={card.event} frame={f} duration={FRAMES} opacity={0.2} />

        {/* The corner's colour, cut across the frame behind them. */}
        <div
          style={{
            position: "absolute",
            left: -200,
            right: -200,
            top: 520,
            height: 560,
            background: `linear-gradient(90deg, transparent, ${accent} 30%, ${accent} 70%, transparent)`,
            opacity: 0.5,
            transform: `rotate(-14deg) translateX(${interpolate(f, [0, 22], [-1400, 0], easeOutExpo)}px)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(60% 40% at 50% 38%, ${accent}40 0%, transparent 75%)`,
          }}
        />
        <Embers frame={f} width={SEQ.width} height={SEQ.height} />

        <div
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            top: 210,
            height: 1240,
            transform: `translateY(${rise}px) scale(${push})`,
            transformOrigin: "50% 30%",
          }}
        >
          <Hero fighter={a.fighter} accent={accent} />
        </div>

        {/* So the type below always sits on dark, whatever the picture was. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, #07080a 22%, rgba(7,8,10,0.88) 36%, transparent 56%)",
          }}
        />

        <TopLine a={a} frame={f} />
        {/* Ink in the corner's colour on a photograph; chalk on the initials, which
            already sit on that colour and would swallow it. */}
        <Stamp frame={f} accent={hasPicture(a.fighter) ? accent : CHALK} />
        <LightSweep t={progress(f, IMPACT + 10, IMPACT + 44)} strength={0.42} />

        <Name a={a} frame={f} accent={accent} />
        <Details a={a} frame={f} accent={accent} />
        <Close a={a} frame={f} accent={accent} />
      </div>

      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash, mixBlendMode: "overlay" }} />
      <Vignette />
      <div style={{ position: "absolute", inset: 0, background: INK, opacity: 1 - fadeOut }} />
    </div>
  );
}

function TopLine({ a, frame: f }: { a: Announcement; frame: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 236,
        left: 70,
        right: 70,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        opacity: progress(f, 10, 26),
      }}
    >
      <Label size={22} color={CHALK}>
        {a.show}
      </Label>
      <Label size={22} color={a.billing ? GOLD : ASH}>
        {a.billing ?? a.boutLabel}
      </Label>
    </div>
  );
}

/**
 * The word, as ink. The roughness is an SVG filter with fixed seeds — the same
 * speckle on every frame — rather than an image, so there is nothing to fetch.
 */
function Stamp({ frame: f, accent }: { frame: number; accent: string }) {
  if (f < IMPACT) return null;
  const scale = interpolate(f, [IMPACT, IMPACT + 7], [2.8, 1], easeOutExpo);
  const settle = f >= CLOSE ? interpolate(f, [CLOSE, CLOSE + 18], [1, 0.62], easeOutCubic) : 1;
  const lift = f >= CLOSE ? interpolate(f, [CLOSE, CLOSE + 18], [0, -330], easeOutCubic) : 0;
  const opacity = progress(f, IMPACT, IMPACT + 3);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 760,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translateY(${lift}px) rotate(-9deg) scale(${scale * settle})`,
      }}
    >
      <svg width={900} height={300} viewBox="0 0 900 300" aria-hidden="true" style={{ overflow: "visible" }}>
        <defs>
          <filter id="confirmed-ink" x="-6%" y="-10%" width="112%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="2" seed="4" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="6" xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="11" result="grain" />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.35"
              result="speck"
            />
            <feComposite in="rough" in2="speck" operator="in" />
          </filter>
        </defs>
        <g filter="url(#confirmed-ink)">
          <rect x="14" y="14" width="872" height="272" fill="none" stroke={accent} strokeWidth="12" />
          <rect x="34" y="34" width="832" height="232" fill="none" stroke={accent} strokeWidth="4" />
          <text
            x="450"
            y="214"
            textAnchor="middle"
            textLength="760"
            lengthAdjust="spacingAndGlyphs"
            fill={accent}
            style={{ fontFamily: "var(--font-display)", fontSize: 200, textTransform: "uppercase" }}
          >
            {CONFIRMED_COPY.stamp}
          </text>
        </g>
      </svg>
    </div>
  );
}

function Name({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  const out = 1 - progress(f, CLOSE - 4, CLOSE + 10);
  const surname = a.surname.toUpperCase();
  const size = fitSize(surname, 960, 230);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1176,
        display: "grid",
        gap: 10,
        opacity: out,
        transform: `translateY(${interpolate(f, [CLOSE - 4, CLOSE + 10], [0, -40], easeOutCubic)}px)`,
      }}
    >
      {a.lead ? (
        <Label size={30} color={CHALK} style={{ opacity: progress(f, 16, 30) }}>
          {a.lead}
        </Label>
      ) : null}
      <div
        className="display"
        style={{
          fontSize: size,
          lineHeight: 0.84,
          letterSpacing: "-0.01em",
          opacity: progress(f, 14, 24),
          transform: `translateY(${interpolate(f, [14, 34], [90, 0], easeOutBack)}px)`,
        }}
      >
        {surname}
      </div>
      <div style={{ height: 6, background: accent, width: interpolate(f, [22, 46], [0, 420], easeOutExpo) }} />
      {a.nickname ? (
        <div className="display" style={{ fontSize: 56, color: GOLD, opacity: progress(f, 30, 44) }}>
          &ldquo;{a.nickname}&rdquo;
        </div>
      ) : null}
    </div>
  );
}

function Details({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  const out = 1 - progress(f, CLOSE - 4, CLOSE + 8);
  const line = [a.gym, a.hometown].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1510,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 30,
        opacity: out * progress(f, 66, 84),
        transform: `translateY(${interpolate(f, [66, 86], [30, 0], easeOutCubic)}px)`,
      }}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {line ? (
          <div className="display" style={{ fontSize: 44 }}>
            {line}
          </div>
        ) : null}
        <div className="display" style={{ fontSize: 40, color: ASH }}>
          <span style={{ fontSize: 30 }}>vs </span>
          <span style={{ color: CHALK }}>{a.opponent}</span>
        </div>
        <Label size={20}>
          {a.boutLabel} · {a.classLine}
        </Label>
      </div>
      {a.record ? (
        <div style={{ display: "grid", justifyItems: "end", gap: 6, opacity: progress(f, 80, 96) }}>
          <Label size={18} color={accent}>
            {a.debut ? CONFIRMED_COPY.debutLead : CONFIRMED_COPY.record}
          </Label>
          <div className="display tnum" style={{ fontSize: 110, lineHeight: 0.9 }}>
            {a.record}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Close({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  if (f < CLOSE) return null;
  const c = f - CLOSE;
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1150,
        display: "grid",
        gap: 34,
      }}
    >
      <div style={{ display: "grid", gap: 10, opacity: progress(c, 4, 18) }}>
        <Label size={24} color={accent}>
          {a.lead ? `${a.lead} ${a.surname}` : a.surname}
          {a.opponent ? ` vs ${a.opponent}` : ""}
        </Label>
        <div
          className="display"
          style={{
            fontSize: fitSize(a.show, 960, 140, 0.5),
            lineHeight: 0.88,
            transform: `translateY(${interpolate(c, [4, 22], [50, 0], easeOutBack)}px)`,
          }}
        >
          {a.show}
        </div>
        <Label size={24} color={CHALK}>
          {a.date}
        </Label>
        {a.venue ? <Label size={20}>{a.venue}</Label> : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 34,
          opacity: progress(c, 14, 30),
          transform: `translateY(${interpolate(c, [14, 32], [30, 0], easeOutCubic)}px)`,
        }}
      >
        <ProgrammeQr url={a.programmeUrl} size={230} />
        <div style={{ display: "grid", gap: 14 }}>
          <div className="display" style={{ fontSize: 44, color: GOLD, lineHeight: 1 }}>
            {CONFIRMED_COPY.scan}
          </div>
          <Label size={18} color={CHALK} style={{ letterSpacing: "0.12em", textTransform: "none" }}>
            {a.programmeLabel}
          </Label>
          {a.sponsor ? (
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <Label size={14}>{CONFIRMED_COPY.sponsoredBy}</Label>
              <SponsorLockup sponsor={a.sponsor} size={64} align="left" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
