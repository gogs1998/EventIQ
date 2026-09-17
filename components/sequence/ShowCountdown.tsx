import {
  clamp,
  countTo,
  easeOutBack,
  easeOutExpo,
  interpolate,
  progress,
  pulse,
} from "@/lib/anim";
import { boutsRunning, cornersOf, showSponsors } from "@/lib/card";
import { countdownRowFrames, daysToGoLabel, formatShowDateLong } from "@/lib/promo";
import { daysUntilShow } from "@/lib/promoter";
import { boutBillingLabel, lastName } from "@/lib/tape";
import type { Bout, FightEvent } from "@/lib/types";
import type { Card } from "@/lib/card";
import {
  ASH,
  Backdrop,
  BLUE,
  CHALK,
  Embers,
  GOLD,
  INK,
  Label,
  PortraitChip,
  QrPlate,
  RED,
  Rule,
  SponsorEmblems,
  Vignette,
  type ShowSceneProps,
} from "./show-parts";
import { SEQ } from "./timeline";

/**
 * Fight week, in twelve seconds.
 *
 * What a promoter posts on the Monday: the show, when and where it is, how long
 * is left, everything that is on, and the code to open the programme. It leads
 * on the count because that is the only thing about a show that changes every
 * day, and it is the reason to post the same video again on the Thursday.
 *
 * A pure function of its props, as every composition here is — including the
 * clock, which arrives as `now` from the page rather than being read inside.
 */

export const COUNTDOWN_DURATION = 360; // 12s at 30fps

/** The centred full-frame box four of the scenes below are laid out in. */
const FILL: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 80,
  textAlign: "center",
};

/**
 * Scenes overlap by eight frames, so each one crossfades into the next — the
 * same handover the bout sequence uses.
 *
 * The boundaries are also placed so that no transition sits on frame 180. That
 * is the midpoint, which is where the poster frame is taken from and where every
 * platform's own thumbnail picker tends to look, and a frame taken halfway
 * through a dissolve is two scenes at half strength on top of each other.
 */
const SCENES = {
  title: { start: 0, end: 70 },
  when: { start: 62, end: 128 },
  countdown: { start: 120, end: 172 },
  bouts: { start: 164, end: 300 },
  close: { start: 292, end: 360 },
} as const;

/** Every scene's own fade, so the handover is stated once. */
const fade = (frame: number, { start, end }: { start: number; end: number }): number =>
  pulse(frame, start, start + 10, end - 10, end);

export function ShowCountdown({ card, frame, now, qr }: ShowSceneProps) {
  const { event } = card;

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
      <Backdrop event={event} frame={frame} duration={COUNTDOWN_DURATION} />
      <Embers frame={frame} />

      <Title event={event} frame={frame} />
      <When event={event} frame={frame} />
      <DaysToGo event={event} frame={frame} now={now} />
      <BoutRun card={card} frame={frame} />
      <Close card={card} frame={frame} qr={qr} />

      <Vignette />
    </div>
  );
}

// ------------------------------------------------------------------ scene 1

function Title({ event, frame }: { event: FightEvent; frame: number }) {
  const { start, end } = SCENES.title;
  const opacity = fade(frame, { start, end });
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const lift = interpolate(f, [2, 26], [56, 0], easeOutBack);
  const ruleWidth = interpolate(f, [8, 34], [0, 520], easeOutExpo);
  const under = progress(f, 18, 34);

  return (
    <div style={{ ...FILL, gap: 28, opacity }}>
      {event.promoter.mark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.promoter.mark}
          alt=""
          style={{ width: 92, height: 92, opacity: interpolate(f, [0, 20], [0, 0.9]) }}
        />
      ) : null}
      <Label size={18}>{event.promoter.name}</Label>

      <Rule width={ruleWidth} />

      <div
        className="display"
        style={{
          fontSize: event.name.length > 16 ? 132 : 164,
          transform: `translateY(${lift}px)`,
          letterSpacing: "-0.02em",
        }}
      >
        {event.name}
      </div>

      {event.tagline ? (
        <div className="display" style={{ fontSize: 52, color: GOLD, opacity: under }}>
          {event.tagline}
        </div>
      ) : null}

      {event.sanctioning ? (
        <Label size={16} style={{ opacity: under, marginTop: 8 }}>
          {event.sanctioning}
        </Label>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ scene 2

function When({ event, frame }: { event: FightEvent; frame: number }) {
  const { start, end } = SCENES.when;
  const opacity = fade(frame, { start, end });
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const lift = interpolate(f, [0, 26], [44, 0], easeOutBack);

  return (
    <div style={{ ...FILL, gap: 30, opacity }}>
      <Label size={18}>Doors {event.doorsTime} · First bell {event.firstBellTime}</Label>
      <div
        className="display"
        style={{ fontSize: 108, transform: `translateY(${lift}px)`, lineHeight: 0.92 }}
      >
        {formatShowDateLong(event.date)}
      </div>
      <Rule width={interpolate(f, [6, 30], [0, 420], easeOutExpo)} />
      <div className="display" style={{ fontSize: 72, opacity: progress(f, 16, 34) }}>
        {event.venue}
      </div>
      <Label size={22} style={{ opacity: progress(f, 22, 40) }}>
        {event.city}
      </Label>
    </div>
  );
}

// ------------------------------------------------------------------ scene 3

function DaysToGo({
  event,
  frame,
  now,
}: {
  event: FightEvent;
  frame: number;
  now: number;
}) {
  const { start, end } = SCENES.countdown;
  const opacity = fade(frame, { start, end });
  if (opacity <= 0.001) return null;

  const days = daysUntilShow(event.date, new Date(now));
  const label = daysToGoLabel(days);
  // A show that has already happened has nothing to count, so the beat is left
  // out rather than filled with a number counting the wrong way.
  if (!label) return null;

  const f = frame - start;
  // The number counts up to itself, the way the tape's stats do. Only where
  // there is a number: "Tonight" is a word and has nothing to count.
  const counted = days > 1 ? countTo(f, [6, 40], days) : null;

  return (
    <div style={{ ...FILL, gap: 24, opacity }}>
      {counted === null ? (
        <div
          className="display"
          style={{
            fontSize: 180,
            color: GOLD,
            transform: `scale(${interpolate(f, [2, 30], [1.3, 1], easeOutExpo)})`,
          }}
        >
          {label}
        </div>
      ) : (
        <>
          <div className="display tnum" style={{ fontSize: 400, color: GOLD, lineHeight: 0.8 }}>
            {counted}
          </div>
          <Label size={34} color={CHALK} style={{ opacity: progress(f, 18, 36) }}>
            days to go
          </Label>
        </>
      )}

      <div style={{ opacity: progress(f, 30, 48), marginTop: 30, display: "grid", gap: 12, justifyItems: "center" }}>
        <Rule width={280} />
        <div className="display" style={{ fontSize: 56 }}>
          {event.name}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ scene 4

/** How tall one bout is in the run. */
const RUN_ROW_HEIGHT = 168;

/**
 * Every bout on the card, top-down, going past.
 *
 * Main event first, and only the bouts still going ahead: a withdrawal keeps its
 * place on the printed programme but there is no sense advertising a walkout
 * nobody is walking out for.
 *
 * The column travels at the pace `countdownRowFrames` sets, so a six-bout card
 * lingers on each row and a fifteen-bout card flashes through them, and both
 * take the same beat of the video.
 */
function BoutRun({ card, frame }: { card: Card; frame: number }) {
  const { start, end } = SCENES.bouts;
  const opacity = fade(frame, { start, end });
  if (opacity <= 0.001) return null;

  const bouts = boutsRunning(card);
  if (!bouts.length) return null;

  const f = frame - start;
  const perRow = countdownRowFrames(bouts.length);
  // Clamped to the last row, so a short card settles on its final bout instead
  // of scrolling on into empty space.
  const position = clamp(f / perRow, 0, bouts.length - 1);
  const bandCentre = SEQ.height / 2;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: bandCentre - RUN_ROW_HEIGHT / 2 - position * RUN_ROW_HEIGHT,
        }}
      >
        {bouts.map((bout, i) => (
          <RunRow key={bout.number} card={card} bout={bout} distance={i - position} />
        ))}
      </div>

      {/* The band the eye reads, so the rows above and below are plainly on the
          way in and on the way out rather than half-drawn. Over the rows and
          under the heading: the heading sits inside the top of it, and drawn the
          other way round the gradient would take it out. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            `linear-gradient(to bottom, ${INK} 22%, transparent 40%, transparent 60%, ${INK} 78%)`,
        }}
      />

      <div style={{ position: "absolute", top: 96, left: 0, right: 0, textAlign: "center" }}>
        <Label size={20} color={CHALK}>
          On the card
        </Label>
      </div>
    </div>
  );
}

function RunRow({ card, bout, distance }: { card: Card; bout: Bout; distance: number }) {
  const away = Math.abs(distance);
  if (away > 3) return null;

  const { red, blue } = cornersOf(card, bout);
  const opacity = clamp(1 - away / 2.4, 0, 1);
  const scale = clamp(1 - away * 0.08, 0.7, 1);
  // Set to the pair, so a row of two long surnames stays inside the space
  // between the two portraits rather than running underneath them.
  const nameSize = lastName(red).length + lastName(blue).length > 15 ? 48 : 60;

  return (
    <div
      style={{
        height: RUN_ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <PortraitChip fighter={red} size={104} accent={RED} />
      <div style={{ display: "grid", gap: 8, justifyItems: "center", maxWidth: 640 }}>
        <Label size={15} color={bout.billing ? GOLD : ASH}>
          {boutBillingLabel(bout)}
        </Label>
        <div className="display" style={{ fontSize: nameSize, lineHeight: 0.9, textAlign: "center" }}>
          {lastName(red)}
          <span style={{ color: ASH }}> v </span>
          {lastName(blue)}
        </div>
      </div>
      <PortraitChip fighter={blue} size={104} accent={BLUE} />
    </div>
  );
}

// ------------------------------------------------------------------ scene 5

function Close({ card, frame, qr }: { card: Card; frame: number; qr: ShowSceneProps["qr"] }) {
  const { start, end } = SCENES.close;
  const opacity = fade(frame, { start, end });
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const { event } = card;
  const sponsors = showSponsors(card).slice(0, 6);

  return (
    <div
      style={{
        ...FILL,
        gap: 30,
        opacity,
        background: "linear-gradient(to bottom, rgba(7,8,10,0.72), rgba(7,8,10,0.96))",
      }}
    >
      <div
        className="display"
        style={{
          fontSize: 88,
          transform: `translateY(${interpolate(f, [0, 22], [36, 0], easeOutBack)}px)`,
        }}
      >
        {event.name}
      </div>
      <Label size={18}>
        {formatShowDateLong(event.date)} · {event.venue}, {event.city}
      </Label>

      <div style={{ marginTop: 12, opacity: progress(f, 10, 28) }}>
        <QrPlate matrix={qr} size={360} />
      </div>
      <Label size={17} color={GOLD}>
        Scan for the full programme
      </Label>

      {sponsors.length ? (
        <div style={{ marginTop: 34, display: "grid", gap: 20, justifyItems: "center" }}>
          <Label size={15}>With thanks to</Label>
          <SponsorEmblems sponsors={sponsors} opacity={progress(f, 24, 46)} size={54} />
        </div>
      ) : null}
    </div>
  );
}
