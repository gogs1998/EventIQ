import {
  countTo,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  interpolate,
  progress,
  pulse,
} from "@/lib/anim";
import {
  boutBillingLabel,
  boutClassLine,
  boutFormat,
  formatEventDateShort,
  formatRecord,
  lastName,
  leadName,
  stated,
  weightLabel,
} from "@/lib/tape";
import type { Bout, Corner, FightEvent, Fighter, Sponsor } from "@/lib/types";
import type { Card } from "@/lib/card";
import {
  ASH,
  Backdrop,
  CHALK,
  Embers,
  GOLD,
  Label,
  Rule,
  SponsorLockup,
  Subject,
  Vignette,
  accentOf,
} from "./parts";
import { SEQ } from "./timeline";

/**
 * The main event promo. Twelve seconds, and it sells rather than explains.
 *
 * The tale of the tape is for somebody who has already opened the programme and
 * wants to know who these two are. This is for somebody scrolling past: it is
 * shorter, the type is bigger, the fighters arrive rather than being revealed,
 * and every number on it lands inside the first six seconds. Nothing on it is
 * derived differently from the tape — same fighters, same rows, same helpers —
 * it is the same facts at a different tempo.
 *
 * Pure function of `frame`, exactly as the tape is. No CSS animation, no timers,
 * no state: the exporter screenshots a frame number and needs the same picture
 * every time it asks. See handover section 4.
 */

export const FACEOFF_FRAMES = 360; // 12s at 30fps

const SCENES = {
  /** Promoter, billing and the belt on the line. */
  open: { start: 0, end: 66 },
  /** Both corners arrive, and every number about them lands. */
  clash: { start: 58, end: 302 },
  /** Where, when, and whose bout it is. */
  close: { start: 294, end: FACEOFF_FRAMES },
} as const;

/** Where the portrait columns sit, and where the type under them starts. */
const PORTRAITS_TOP = 120;
const PORTRAITS_HEIGHT = 1010;
const CORNER_BLOCK_TOP = 1168;
const FORMAT_BAR_TOP = 1590;

export function FaceOff({ card, bout, frame }: { card: Card; bout: Bout; frame: number }) {
  const { event, sponsors } = card;
  const red = card.fighters[bout.redId];
  const blue = card.fighters[bout.blueId];

  return (
    <div
      style={{
        position: "relative",
        width: SEQ.width,
        height: SEQ.height,
        overflow: "hidden",
        background: "#07080a",
        color: CHALK,
      }}
    >
      <Backdrop event={event} frame={frame} duration={FACEOFF_FRAMES} opacity={0.3} />
      <Embers frame={frame} width={SEQ.width} height={SEQ.height} />

      <Open event={event} bout={bout} frame={frame} />
      <Clash event={event} bout={bout} frame={frame} red={red} blue={blue} />
      <Close event={event} bout={bout} sponsors={sponsors} frame={frame} />

      <Vignette />
    </div>
  );
}

// ------------------------------------------------------------------- scene 1

function Open({ event, bout, frame }: { event: FightEvent; bout: Bout; frame: number }) {
  const { start, end } = SCENES.open;
  const opacity = pulse(frame, start, start + 8, end - 12, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  // Harder and quicker than the tape's equivalent: this is the beat that has to
  // stop a thumb, and a slow lift reads as a title card rather than a promo.
  const lift = interpolate(f, [0, 18], [70, 0], easeOutBack);
  const ruleWidth = interpolate(f, [4, 26], [0, 640], easeOutExpo);
  const detail = progress(f, 14, 30);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 80,
        textAlign: "center",
        opacity,
      }}
    >
      {event.promoter.mark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.promoter.mark}
          alt=""
          style={{ width: 92, height: 92, opacity: interpolate(f, [0, 16], [0, 0.9]) }}
        />
      ) : null}
      <Label size={20}>{event.promoter.name}</Label>

      <Rule width={ruleWidth} height={3} />

      <div
        className="display"
        style={{
          fontSize: 210,
          transform: `translateY(${lift}px)`,
          letterSpacing: "-0.03em",
          lineHeight: 0.84,
        }}
      >
        {boutBillingLabel(bout)}
      </div>

      {bout.titleLabel ? (
        <div
          className="display"
          style={{ fontSize: 44, color: GOLD, letterSpacing: "0.04em", opacity: detail, maxWidth: 840 }}
        >
          {bout.titleLabel}
        </div>
      ) : null}

      <Label size={26} color={CHALK} style={{ opacity: detail }}>
        {boutClassLine(bout)}
      </Label>
    </div>
  );
}

// ------------------------------------------------------------------- scene 2

function Clash({
  event,
  bout,
  frame,
  red,
  blue,
}: {
  event: FightEvent;
  bout: Bout;
  frame: number;
  red: Fighter;
  blue: Fighter;
}) {
  const { start, end } = SCENES.clash;
  const opacity = pulse(frame, start, start + 10, end - 12, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;

  // The arrival. Expo rather than cubic and half the tape's duration, because
  // the whole point of this template is that the two of them are already there
  // by the time anybody has decided whether to keep watching.
  const slam = (dir: number) => interpolate(f, [0, 20], [dir * 660, 0], easeOutExpo);
  // A single frame-driven flash on the impact. Ramped both ways rather than
  // switched on: a step would be one bright frame arriving out of nowhere, which
  // is exactly what a 30fps encode makes look like a fault.
  const impact = pulse(f, 14, 20, 21, 32) * 0.22;
  const seam = progress(f, 14, 32);
  const vsScale = interpolate(f, [12, 36], [2.2, 1], easeOutExpo);

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(100deg, rgba(232,18,31,0.26) 0%, transparent 40%, transparent 60%, rgba(22,104,240,0.26) 100%)",
        }}
      />

      <div style={{ position: "absolute", top: 54, left: 0, right: 0, textAlign: "center" }}>
        <Label size={18} style={{ opacity: progress(f, 18, 34) }}>
          {event.name} · {boutBillingLabel(bout)}
        </Label>
      </div>

      {/* Both corners, turned in across a centre seam. */}
      <div
        style={{
          position: "absolute",
          top: PORTRAITS_TOP,
          left: 0,
          right: 0,
          height: PORTRAITS_HEIGHT,
        }}
      >
        <PortraitColumn fighter={red} corner="red" offset={slam(-1)} height={PORTRAITS_HEIGHT} />
        <PortraitColumn fighter={blue} corner="blue" offset={slam(1)} height={PORTRAITS_HEIGHT} />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 3,
            marginLeft: -1.5,
            background:
              "linear-gradient(to bottom, transparent, rgba(255,255,255,0.55) 26%, rgba(255,255,255,0.55) 74%, transparent)",
            opacity: seam,
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 380,
            transform: `translate(-50%, 0) scale(${vsScale})`,
            width: 150,
            height: 150,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#07080a",
            border: "3px solid rgba(255,255,255,0.32)",
            borderRadius: "50%",
            opacity: progress(f, 10, 28),
          }}
        >
          <span className="display" style={{ fontSize: 68 }}>
            Vs
          </span>
        </div>
      </div>

      {/* Scrim, so the type under the portraits always sits on something dark. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: PORTRAITS_TOP + PORTRAITS_HEIGHT - 320,
          bottom: 0,
          background: "linear-gradient(to bottom, transparent, #07080a 32%)",
        }}
      />

      <CornerBlock fighter={red} corner="red" frame={f} />
      <CornerBlock fighter={blue} corner="blue" frame={f} />

      {/* What they have agreed to make, and for how long. */}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: FORMAT_BAR_TOP,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          borderTop: "2px solid rgba(255,255,255,0.14)",
          borderBottom: "2px solid rgba(255,255,255,0.14)",
          padding: "26px 0",
          opacity: progress(f, 128, 152),
          transform: `translateY(${interpolate(f, [128, 152], [24, 0], easeOutCubic)}px)`,
        }}
      >
        <Stat label="Weight" value={weightLabel(bout.weightKg)} />
        <Stat label="Rounds" value={boutFormat(bout)} />
      </div>

      {bout.titleLabel ? (
        <div
          className="display"
          style={{
            position: "absolute",
            left: 70,
            right: 70,
            top: FORMAT_BAR_TOP + 190,
            textAlign: "center",
            fontSize: 40,
            color: GOLD,
            letterSpacing: "0.04em",
            opacity: progress(f, 150, 176),
          }}
        >
          {bout.titleLabel}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: CHALK,
          opacity: impact,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
      <Label size={17}>{label}</Label>
      <div className="display tnum" style={{ fontSize: 62 }}>
        {value}
      </div>
    </div>
  );
}

function PortraitColumn({
  fighter,
  corner,
  offset,
  height,
}: {
  fighter: Fighter;
  corner: Corner;
  offset: number;
  height: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        [corner === "red" ? "left" : "right"]: 0,
        width: 545,
        height,
        overflow: "hidden",
        transform: `translateX(${offset}px)`,
      }}
    >
      <Subject
        fighter={fighter}
        accent={accentOf(corner)}
        frame={{ column: corner }}
        // The cutout is mirrored so the two of them square up across the seam. A
        // photograph is not: reversing a picture of a real room reverses the
        // lettering on a vest and on a sponsor's banner behind it.
        mirror={corner === "blue"}
        objectPosition="50% 12%"
      />
    </div>
  );
}

/**
 * One corner's name, record, gym and hometown.
 *
 * Every line here is optional, because on an amateur card most of them are:
 * plenty of these fighters are a name and a gym and nothing else, and the block
 * has to read as a deliberate design at that size rather than as a form with the
 * boxes empty. The gym and the hometown go through `stated`, so the placeholder
 * a promoter's card editor writes is treated as the blank it is and never
 * printed as a fact about where somebody trains.
 */
function CornerBlock({
  fighter,
  corner,
  frame: f,
}: {
  fighter: Fighter;
  corner: Corner;
  frame: number;
}) {
  const accent = accentOf(corner);
  const align = corner === "red" ? "left" : "right";
  const surname = lastName(fighter);
  const lead = leadName(fighter);
  const gym = stated(fighter.gym);
  const hometown = stated(fighter.hometown);

  const record = formatRecord(fighter);
  const wins = fighter.record?.w ?? 0;
  const counted = countTo(f, [46, 86], wins);
  // Only the wins tick. The losses and draws are already settled and a number
  // rolling up beside them reads as a scoreboard rather than a record.
  const countedRecord =
    record && record !== "Debut" ? [counted, ...record.split("-").slice(1)].join("-") : record;

  const nameIn = progress(f, 20, 40);

  return (
    <div
      style={{
        position: "absolute",
        top: CORNER_BLOCK_TOP,
        [align]: 56,
        width: 470,
        textAlign: align,
        display: "grid",
        gap: 14,
        justifyItems: align === "left" ? "start" : "end",
      }}
    >
      <div
        style={{
          height: 6,
          width: interpolate(f, [18, 42], [0, 200], easeOutExpo),
          background: accent,
        }}
      />

      {lead ? (
        <Label size={20} color={CHALK} style={{ opacity: nameIn }}>
          {lead}
        </Label>
      ) : null}

      <div
        className="display"
        style={{
          fontSize: surname.length > 9 ? 78 : 96,
          lineHeight: 0.86,
          opacity: nameIn,
          transform: `translateY(${interpolate(f, [20, 40], [46, 0], easeOutBack)}px)`,
        }}
      >
        {surname}
      </div>

      {countedRecord ? (
        <div style={{ opacity: progress(f, 44, 60), display: "grid", gap: 4, justifyItems: align === "left" ? "start" : "end" }}>
          <Label size={15}>Record</Label>
          <div className="display tnum" style={{ fontSize: 86, lineHeight: 0.9 }}>
            {countedRecord}
          </div>
        </div>
      ) : null}

      {gym ? (
        <div
          className="display"
          style={{ fontSize: 38, opacity: progress(f, 90, 112), marginTop: 6 }}
        >
          {gym}
        </div>
      ) : null}

      {hometown ? (
        <Label size={19} style={{ opacity: progress(f, 100, 122) }}>
          {hometown}
        </Label>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------- scene 3

function Close({
  event,
  bout,
  sponsors,
  frame,
}: {
  event: FightEvent;
  bout: Bout;
  sponsors: Record<string, Sponsor>;
  frame: number;
}) {
  const { start, end } = SCENES.close;
  const opacity = pulse(frame, start, start + 12, end - 8, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const sponsor = bout.sponsorId ? sponsors[bout.sponsorId] : undefined;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        padding: 90,
        textAlign: "center",
        opacity,
        background: "linear-gradient(to bottom, rgba(7,8,10,0.78), rgba(7,8,10,0.96))",
      }}
    >
      <Label size={20}>{event.promoter.name}</Label>

      <div
        className="display"
        style={{
          fontSize: 132,
          lineHeight: 0.86,
          transform: `translateY(${interpolate(f, [0, 20], [44, 0], easeOutBack)}px)`,
        }}
      >
        {event.name}
      </div>

      <Rule width={interpolate(f, [6, 30], [0, 520], easeOutExpo)} height={3} />

      <div style={{ display: "grid", gap: 14, opacity: progress(f, 14, 32) }}>
        <Label size={22} color={CHALK}>
          {formatEventDateShort(event.date)}
        </Label>
        <Label size={19} color={ASH}>
          {event.venue}, {event.city}
        </Label>
      </div>

      {/* The bout's own sponsor closes it out, which is the thing a promoter is
          actually selling. Their name is set in our type, never drawn. */}
      {sponsor ? (
        <div
          style={{
            position: "absolute",
            bottom: 150,
            display: "grid",
            gap: 20,
            justifyItems: "center",
            opacity: progress(f, 28, 48),
          }}
        >
          <Label size={16}>This bout brought to you by</Label>
          <SponsorLockup sponsor={sponsor} size={82} />
        </div>
      ) : (
        <div style={{ position: "absolute", bottom: 150, opacity: progress(f, 28, 48) }}>
          <Label size={16} color={GOLD}>
            Scan for the full programme
          </Label>
        </div>
      )}
    </div>
  );
}
