import { easeOutCubic, easeOutExpo, interpolate, progress } from "@/lib/anim";
import type { Card } from "@/lib/card";
import { CONFIRMED_COPY, announcementOf, fitSize, type Announcement } from "@/lib/confirmed";
import type { Bout, Corner } from "@/lib/types";
import { CONFIRMED_FRAMES, Hero, ProgrammeQr } from "./confirmed-parts";
import { ASH, Backdrop, CHALK, Embers, GOLD, INK, Label, SponsorLockup, Vignette, accentOf } from "./parts";
import { SEQ } from "./timeline";

/**
 * "Confirmed", as a broadcast graphic. Eight seconds.
 *
 * The shutter opens on the fighter under the arena lights and the camera keeps
 * pushing in for the whole clip, with the fighter moving faster than the room
 * behind them. The words arrive the way a fight broadcast puts a name on screen:
 * a strap wiped on from the left, a second under it, a tab above. It is the
 * quietest of the three looks and the one that most reads as television.
 *
 * Readable type stays between y 180 and y 1740, clear of a story's own bars.
 *
 * Pure function of `frame`. Handover section 4.
 */

const FRAMES = CONFIRMED_FRAMES.broadcast;
const STRAP = 30;
const CLOSE = 168;
const STRAP_TOP = 1200;
const TAB = 96;

export function ConfirmedBroadcast({
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

  const camera = interpolate(f, [0, FRAMES], [1.02, 1.12]);
  const subject = interpolate(f, [0, 40], [1.12, 1], easeOutExpo) + interpolate(f, [0, FRAMES], [0, 0.07]);
  const drift = interpolate(f, [0, FRAMES], [30, -40]);
  const shutter = interpolate(f, [0, 18], [960, 0], easeOutExpo);
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
      <div style={{ position: "absolute", inset: 0, transform: `scale(${camera})`, transformOrigin: "50% 36%" }}>
        <Backdrop event={card.event} frame={f} duration={FRAMES} opacity={0.3} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(70% 36% at 50% 30%, rgba(255,240,220,0.14) 0%, transparent 70%), linear-gradient(to bottom, transparent 40%, ${accent}22 70%, transparent)`,
          }}
        />
        <Beams frame={f} />
        <Embers frame={f} width={SEQ.width} height={SEQ.height} />

        <div
          style={{
            position: "absolute",
            left: 30,
            right: 30,
            top: 170,
            height: 1260,
            transform: `translateY(${drift}px) scale(${subject})`,
            transformOrigin: "50% 30%",
          }}
        >
          <Hero fighter={a.fighter} accent={accent} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, #07080a 14%, rgba(7,8,10,0.82) 30%, transparent 50%)",
        }}
      />

      <Bug a={a} frame={f} accent={accent} />
      <Straps a={a} frame={f} accent={accent} />
      <Lower a={a} frame={f} />
      <Close a={a} frame={f} />

      <Vignette />
      {/* The shutter: two black leaves opening from the middle on the first beat. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: shutter, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: shutter, background: "#000" }} />
      <div style={{ position: "absolute", inset: 0, background: INK, opacity: fadeOut }} />
    </div>
  );
}

/** Three spotlights from the rig, swinging slowly. Sines on the frame, not a clock. */
function Beams({ frame: f }: { frame: number }) {
  const beams = [
    { x: 160, base: 14, phase: 0 },
    { x: 540, base: 0, phase: 1.7 },
    { x: 920, base: -14, phase: 3.1 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
      {beams.map((beam, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: beam.x - 220,
            top: -80,
            width: 440,
            height: 1700,
            transformOrigin: "50% 0%",
            transform: `rotate(${beam.base + 5 * Math.sin(f / 34 + beam.phase)}deg)`,
            clipPath: "polygon(44% 0, 56% 0, 100% 100%, 0 100%)",
            background: "linear-gradient(to bottom, rgba(255,246,230,0.30), rgba(255,246,230,0.06) 60%, transparent)",
            opacity: progress(f, 4 + i * 4, 24 + i * 4) * 0.8,
          }}
        />
      ))}
    </div>
  );
}

function Bug({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "stretch",
        opacity: progress(f, 14, 28),
        transform: `translateY(${interpolate(f, [14, 30], [-24, 0], easeOutCubic)}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(7,8,10,0.72)", padding: "14px 22px" }}>
        <div style={{ width: 8, alignSelf: "stretch", background: accent }} />
        <div className="display" style={{ fontSize: 34, lineHeight: 1 }}>
          {a.show}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: a.billing ? GOLD : CHALK,
          color: INK,
          padding: "14px 22px",
        }}
      >
        <Label size={18} color={INK}>
          {a.billing ?? a.boutLabel}
        </Label>
      </div>
    </div>
  );
}

/** The name, wiped on from the left like a broadcast strap. */
function Straps({ a, frame: f, accent }: { a: Announcement; frame: number; accent: string }) {
  const wipe = (start: number) => `inset(0 ${interpolate(f, [start, start + 12], [100, 0], easeOutExpo)}% 0 0)`;
  const surname = a.surname.toUpperCase();
  const size = fitSize(surname, 820, 170, 0.47);
  const glint = progress(f, STRAP + 18, STRAP + 44);
  const tab = [a.lead, a.nickname ? `“${a.nickname}”` : undefined].filter(Boolean).join("  ");

  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: STRAP_TOP }}>
      {/* Tab: the word itself, then the first name and the nickname. */}
      <div style={{ display: "flex", alignItems: "stretch", height: TAB, clipPath: wipe(STRAP + 34) }}>
        <div style={{ background: GOLD, color: INK, display: "flex", alignItems: "center", padding: "0 30px" }}>
          <div className="display" style={{ fontSize: 72, lineHeight: 1, letterSpacing: "0.03em" }}>
            {CONFIRMED_COPY.stamp}
          </div>
        </div>
        {tab ? (
          <div style={{ background: INK, display: "flex", alignItems: "center", padding: "0 24px" }}>
            <Label size={22} color={CHALK} style={{ letterSpacing: "0.18em" }}>
              {tab}
            </Label>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: Math.max(size + 30, 150),
          background: CHALK,
          color: INK,
          overflow: "hidden",
          clipPath: wipe(STRAP),
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ alignSelf: "stretch", width: 28, background: accent }} />
        <div
          className="display"
          style={{
            fontSize: size,
            lineHeight: 1,
            paddingLeft: 30,
            transform: `translateX(${interpolate(f, [STRAP + 2, STRAP + 18], [-60, 0], easeOutExpo)}px)`,
          }}
        >
          {surname}
        </div>
        {glint > 0 && glint < 1 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${-30 + glint * 140}%`,
              width: "18%",
              background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.9), transparent)",
              transform: "skewX(-18deg)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Lower({ a, frame: f }: { a: Announcement; frame: number }) {
  const out = 1 - progress(f, CLOSE - 4, CLOSE + 6);
  const wipe = (start: number) => `inset(0 ${interpolate(f, [start, start + 12], [100, 0], easeOutExpo)}% 0 0)`;
  const line = [a.gym, a.hometown].filter(Boolean).join(" · ");
  const strapHeight = Math.max(fitSize(a.surname.toUpperCase(), 820, 170, 0.47) + 30, 150);

  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: STRAP_TOP + TAB + strapHeight, opacity: out }}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          background: "rgba(7,8,10,0.9)",
          clipPath: wipe(STRAP + 12),
          minHeight: 84,
        }}
      >
        <div className="display" style={{ fontSize: 40, display: "flex", alignItems: "center", padding: "0 28px" }}>
          {line || a.classLine}
        </div>
        {a.record ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 28px", background: "rgba(244,245,247,0.08)" }}>
            <Label size={16}>{a.debut ? CONFIRMED_COPY.debutLead : CONFIRMED_COPY.record}</Label>
            <div className="display tnum" style={{ fontSize: 52, lineHeight: 1 }}>
              {a.record}
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 22,
          display: "flex",
          alignItems: "baseline",
          gap: 18,
          opacity: progress(f, 84, 100),
          transform: `translateY(${interpolate(f, [84, 102], [20, 0], easeOutCubic)}px)`,
        }}
      >
        <span className="display" style={{ fontSize: 30, color: ASH }}>
          vs
        </span>
        <span className="display" style={{ fontSize: 46 }}>
          {a.opponent}
        </span>
        <Label size={17} style={{ marginLeft: "auto" }}>
          {a.boutLabel} · {a.classLine}
        </Label>
      </div>
    </div>
  );
}

function Close({ a, frame: f }: { a: Announcement; frame: number }) {
  if (f < CLOSE) return null;
  const c = f - CLOSE;
  const strapHeight = Math.max(fitSize(a.surname.toUpperCase(), 820, 170, 0.47) + 30, 150);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: STRAP_TOP + TAB + strapHeight + 30,
        display: "flex",
        gap: 32,
        alignItems: "center",
        opacity: progress(c, 2, 14),
        transform: `translateY(${interpolate(c, [2, 18], [30, 0], easeOutCubic)}px)`,
      }}
    >
      <ProgrammeQr url={a.programmeUrl} size={210} />
      <div style={{ display: "grid", gap: 12 }}>
        <Label size={21} color={CHALK}>
          {a.date}
        </Label>
        {a.venue ? <Label size={18}>{a.venue}</Label> : null}
        <div className="display" style={{ fontSize: 40, color: GOLD, lineHeight: 1, marginTop: 4 }}>
          {CONFIRMED_COPY.scan}
        </div>
        <Label size={17} color={CHALK} style={{ letterSpacing: "0.12em", textTransform: "none" }}>
          {a.programmeLabel}
        </Label>
        {a.sponsor ? (
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6 }}>
            <Label size={13}>{CONFIRMED_COPY.sponsoredBy}</Label>
            <SponsorLockup sponsor={a.sponsor} size={52} align="left" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
