import { easeOutBack, easeOutCubic, easeOutExpo, interpolate, progress } from "@/lib/anim";
import type { Card } from "@/lib/card";
import { CONFIRMED_COPY, announcementOf, fitSize, type Announcement } from "@/lib/confirmed";
import type { Bout, Corner } from "@/lib/types";
import { CONFIRMED_FRAMES, Hero, LightSweep, ProgrammeQr, hasPicture } from "./confirmed-parts";
import { ASH, Backdrop, CHALK, GOLD, INK, Label, SponsorLockup, Vignette, accentOf } from "./parts";
import { SEQ } from "./timeline";

/**
 * "Confirmed", as a fight poster. Eight seconds.
 *
 * The fighter stands in front of their own name, set four times as tall as the
 * frame will take it and stacking in from alternate sides, the way a boxing
 * poster on a pub wall does it. A gold sash says the word. It is the loudest of
 * the three looks and the one with the least motion once it has landed, so the
 * last two seconds are a poster somebody could screenshot.
 *
 * Readable type stays between y 220 and y 1700, clear of a story's own bars.
 *
 * Pure function of `frame`. Handover section 4.
 */

const FRAMES = CONFIRMED_FRAMES.poster;
const SASH = 52;
const CLOSE = 172;
const STACK_TOP = 300;

export function ConfirmedPoster({
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
  const fadeOut = progress(f, FRAMES - 6, FRAMES);

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
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, ${accent}99 0%, ${accent}33 46%, ${INK} 78%)`,
        }}
      />
      <Backdrop event={card.event} frame={f} duration={FRAMES} opacity={0.14} />
      {/* Halftone, fading out down the frame like ink running dry. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(0,0,0,0.42) 2.4px, transparent 2.8px)",
          backgroundSize: "13px 13px",
          maskImage: "linear-gradient(to bottom, #000 0%, #000 30%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 30%, transparent 70%)",
        }}
      />

      <Stack a={a} frame={f} accent={accent} />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 340,
          height: 1200,
          transform: `translateY(${interpolate(f, [8, 40], [700, 0], easeOutExpo)}px) scale(${interpolate(f, [8, FRAMES], [1.08, 1])})`,
          transformOrigin: "50% 40%",
        }}
      >
        {/* No initials here for a fighter with no picture: the stacked name
            behind is already the artwork, and a monogram over it is noise. */}
        {hasPicture(a.fighter) ? <Hero fighter={a.fighter} accent={accent} /> : null}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, #07080a 20%, rgba(7,8,10,0.9) 32%, transparent 48%)",
        }}
      />

      <Header a={a} frame={f} />
      <Sash frame={f} />
      <Billing a={a} frame={f} accent={accent} />
      <Facts a={a} frame={f} />
      <Close a={a} frame={f} />

      <LightSweep t={progress(f, SASH + 8, SASH + 40)} angle={100} strength={0.3} />
      <Vignette />
      <div style={{ position: "absolute", inset: 0, background: INK, opacity: fadeOut }} />
    </div>
  );
}

/** The surname, four times, behind the fighter. */
function Stack({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  const word = a.surname.toUpperCase();
  const size = fitSize(word, 1060, 380, 0.44);
  const row = Math.round(size * 0.82);
  const rows = [0, 1, 2, 3];

  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: STACK_TOP }}>
      {rows.map((i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const start = 2 + i * 5;
        const x =
          interpolate(f, [start, start + 22], [side * 1300, 0], easeOutExpo) +
          side * -1 * interpolate(f, [start + 22, FRAMES], [0, 50]);
        const solid = i === 1;
        return (
          <div
            key={i}
            className="display"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * row,
              textAlign: "center",
              whiteSpace: "nowrap",
              fontSize: size,
              lineHeight: 1,
              letterSpacing: "-0.01em",
              color: solid ? accent : "transparent",
              WebkitTextStroke: solid ? undefined : `3px rgba(244,245,247,${i === 0 ? 0.6 : 0.32})`,
              opacity: solid ? 0.95 : 1,
              transform: `translateX(${x}px)`,
            }}
          >
            {word}
          </div>
        );
      })}
    </div>
  );
}

function Header({ a, frame: f }: { a: Announcement; frame: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 200,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        opacity: progress(f, 0, 14),
        transform: `translateY(${interpolate(f, [0, 18], [-40, 0], easeOutCubic)}px)`,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <Label size={18} color={CHALK}>
          {a.promoter} presents
        </Label>
        <div className="display" style={{ fontSize: fitSize(a.show, 620, 76, 0.5), lineHeight: 0.9 }}>
          {a.show}
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, justifyItems: "end", textAlign: "right" }}>
        <Label size={18} color={a.billing ? GOLD : CHALK}>
          {a.billing ?? a.boutLabel}
        </Label>
        <Label size={18}>{a.date}</Label>
      </div>
    </div>
  );
}

/** A gold band across the fighter, wiped on rather than faded in. */
function Sash({ frame: f }: { frame: number }) {
  if (f < SASH) return null;
  const wipe = interpolate(f, [SASH, SASH + 10], [100, 0], easeOutExpo);
  const thump = interpolate(f, [SASH, SASH + 12], [1.12, 1], easeOutBack);
  return (
    <div
      style={{
        position: "absolute",
        left: -160,
        right: -160,
        top: 1010,
        height: 170,
        transform: `rotate(-6deg) scale(${thump})`,
        clipPath: `inset(0 ${wipe}% 0 0)`,
        background: GOLD,
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
      }}
    >
      <Bar />
      <div className="display" style={{ fontSize: 150, lineHeight: 1, color: INK, letterSpacing: "0.03em" }}>
        {CONFIRMED_COPY.stamp}
      </div>
      <Bar />
    </div>
  );
}

function Bar() {
  return <div style={{ width: 90, height: 14, background: INK }} />;
}

function Billing({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  const name = a.name.toUpperCase();
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1250,
        display: "grid",
        gap: 12,
        justifyItems: "center",
        textAlign: "center",
      }}
    >
      <div
        className="display"
        style={{
          fontSize: fitSize(name, 960, 124, 0.47),
          lineHeight: 0.9,
          opacity: progress(f, 66, 78),
          transform: `translateY(${interpolate(f, [66, 86], [50, 0], easeOutBack)}px)`,
        }}
      >
        {name}
      </div>
      {a.nickname ? (
        <div className="display" style={{ fontSize: 52, color: GOLD, opacity: progress(f, 78, 92) }}>
          &ldquo;{a.nickname}&rdquo;
        </div>
      ) : null}
      <div style={{ height: 5, background: accent, width: interpolate(f, [72, 100], [0, 520], easeOutExpo) }} />
    </div>
  );
}

function Facts({ a, frame: f }: { a: Announcement; frame: number }) {
  const out = 1 - progress(f, CLOSE - 4, CLOSE + 8);
  const cells = [
    a.gym ? { label: "Gym", value: a.gym } : null,
    a.record ? { label: a.debut ? CONFIRMED_COPY.debutLead : CONFIRMED_COPY.record, value: a.record } : null,
    a.hometown ? { label: "From", value: a.hometown } : null,
  ].filter((cell): cell is { label: string; value: string } => cell !== null);

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 1480,
        display: "grid",
        gap: 30,
        justifyItems: "center",
        opacity: out,
      }}
    >
      {cells.length ? (
        <div style={{ display: "flex", gap: 54, justifyContent: "center" }}>
          {cells.map((cell, i) => (
            <div
              key={cell.label}
              style={{
                display: "grid",
                gap: 6,
                justifyItems: "center",
                opacity: progress(f, 92 + i * 8, 106 + i * 8),
                transform: `translateY(${interpolate(f, [92 + i * 8, 110 + i * 8], [24, 0], easeOutCubic)}px)`,
              }}
            >
              <Label size={16} color={ASH}>
                {cell.label}
              </Label>
              <div className="display tnum" style={{ fontSize: 50, lineHeight: 1 }}>
                {cell.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          border: "2px solid rgba(244,245,247,0.5)",
          padding: "12px 28px",
          opacity: progress(f, 120, 136),
        }}
      >
        <span className="display" style={{ fontSize: 36, color: GOLD }}>
          vs
        </span>
        <span className="display" style={{ fontSize: 44 }}>
          {a.opponent}
        </span>
      </div>
      <Label size={18} style={{ opacity: progress(f, 130, 146) }}>
        {a.boutLabel} · {a.classLine}
      </Label>
    </div>
  );
}

function Close({ a, frame: f }: { a: Announcement; frame: number }) {
  if (f < CLOSE) return null;
  const c = f - CLOSE;
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top: 1470,
        display: "flex",
        gap: 36,
        alignItems: "center",
        opacity: progress(c, 4, 18),
        transform: `translateY(${interpolate(c, [4, 22], [40, 0], easeOutCubic)}px)`,
      }}
    >
      <ProgrammeQr url={a.programmeUrl} size={220} />
      <div style={{ display: "grid", gap: 12 }}>
        <Label size={20} color={CHALK}>
          {a.date}
        </Label>
        {a.venue ? <Label size={18}>{a.venue}</Label> : null}
        <div className="display" style={{ fontSize: 40, color: GOLD, lineHeight: 1, marginTop: 6 }}>
          {CONFIRMED_COPY.scan}
        </div>
        <Label size={17} color={CHALK} style={{ letterSpacing: "0.12em", textTransform: "none" }}>
          {a.programmeLabel}
        </Label>
        {a.sponsor ? (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <Label size={13}>{CONFIRMED_COPY.sponsoredBy}</Label>
            <SponsorLockup sponsor={a.sponsor} size={56} align="left" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
