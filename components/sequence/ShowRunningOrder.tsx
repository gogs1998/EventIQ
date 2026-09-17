import { easeOutBack, easeOutCubic, interpolate, progress, pulse } from "@/lib/anim";
import type { Card } from "@/lib/card";
import { boutsRunning, cornersOf, showSponsors } from "@/lib/card";
import { cardRowFrames, formatShowDateLong } from "@/lib/promo";
import { boutBillingLabel, boutClassLine, fullName, stated } from "@/lib/tape";
import type { Bout, FightEvent } from "@/lib/types";
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
 * The whole running order, scrolling past.
 *
 * The paper programme's page 2: every bout, main event first, with both corners
 * on it. What it adds is the two faces — where there are any — and the fact that
 * it fits on a phone screen and can be posted.
 *
 * The one thing it has to get right is that a card is anywhere between one bout
 * and fifteen. `cardRowFrames` in lib/promo.ts is that decision, with the
 * reasoning; here it sets both the stagger and the scroll, so the list always
 * finishes moving at the same moment whatever is on it.
 */

export const RUNNING_ORDER_DURATION = 480; // 16s at 30fps

const SCENES = {
  intro: { start: 0, end: 84 },
  rows: { start: 72, end: 432 },
  close: { start: 420, end: 480 },
} as const;

/** One bout's height in the list, and the window the list scrolls inside. */
const ROW_HEIGHT = 150;
const LIST_TOP = 300;
const LIST_BOTTOM = 130;

export function ShowRunningOrder({ card, frame, qr }: ShowSceneProps) {
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
      <Backdrop event={event} frame={frame} duration={RUNNING_ORDER_DURATION} />
      <Embers frame={frame} />

      {/* Painting order, not reading order: the list scrolls underneath the
          header, and the opening card sits over both while it hands over. */}
      <List card={card} frame={frame} />
      <Header event={event} frame={frame} />
      <Intro event={event} frame={frame} />
      <Close card={card} frame={frame} qr={qr} />

      <Vignette />
    </div>
  );
}

// ------------------------------------------------------------------ scene 1

function Intro({ event, frame }: { event: FightEvent; frame: number }) {
  const { start, end } = SCENES.intro;
  const opacity = pulse(frame, start, start + 12, end - 12, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: 80,
        textAlign: "center",
        opacity,
        background: INK,
      }}
    >
      <Label size={18}>{event.promoter.name}</Label>
      <div
        className="display"
        style={{
          fontSize: event.name.length > 16 ? 124 : 150,
          transform: `translateY(${interpolate(f, [2, 26], [52, 0], easeOutBack)}px)`,
        }}
      >
        {event.name}
      </div>
      <Rule width={interpolate(f, [8, 32], [0, 480], easeOutCubic)} />
      <div className="display" style={{ fontSize: 64, color: GOLD, opacity: progress(f, 16, 34) }}>
        Running order
      </div>
      <Label size={19} style={{ opacity: progress(f, 22, 40) }}>
        {formatShowDateLong(event.date)} · {event.venue}
      </Label>
    </div>
  );
}

// ---------------------------------------------------------- the fixed header

/** Stays for the length of the scroll, so a clip lifted from it still says what it is. */
function Header({ event, frame }: { event: FightEvent; frame: number }) {
  const opacity = pulse(frame, SCENES.rows.start, SCENES.rows.start + 20, SCENES.close.start, SCENES.close.start + 14);
  if (opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: LIST_TOP,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        opacity,
        // Opaque almost to its own edge: the list runs underneath, and a long
        // fade left half a row of somebody else's bout showing through the
        // masthead.
        background: `linear-gradient(to bottom, ${INK} 84%, rgba(7,8,10,0.92) 93%, transparent 100%)`,
      }}
    >
      <Label size={16}>{event.promoter.name}</Label>
      <div className="display" style={{ fontSize: 78, lineHeight: 0.9 }}>
        {event.name}
      </div>
      <Label size={15} color={GOLD}>
        Running order · {formatShowDateLong(event.date)} · {event.venue}
      </Label>
    </div>
  );
}

// ------------------------------------------------------------------ scene 2

function List({ card, frame }: { card: Card; frame: number }) {
  const { start, end } = SCENES.rows;
  const opacity = pulse(frame, start, start + 16, end - 12, end);
  if (opacity <= 0.001) return null;

  const bouts = boutsRunning(card);
  if (!bouts.length) return null;

  const f = frame - start;
  const perRow = cardRowFrames(bouts.length);
  const visible = SEQ.height - LIST_TOP - LIST_BOTTOM;
  const content = bouts.length * ROW_HEIGHT;

  /**
   * Where the column sits.
   *
   * A card long enough to need it travels exactly far enough to bring its last
   * bout into view and no further, at the pace `cardRowFrames` set — so fifteen
   * bouts all get their turn in the reading band and the list never runs on
   * into blank space. A card short enough to fit does not scroll at all and is
   * centred instead, which is the difference between a short card and a card
   * with a hole under it.
   */
  const top =
    content > visible
      ? LIST_TOP - (content - visible) * progress(f, perRow, bouts.length * perRow)
      : LIST_TOP + (visible - content) / 2;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", top, left: 0, right: 0 }}>
        {bouts.map((bout, i) => (
          // The rows land one after another over the first seconds whatever the
          // scroll is doing, so the list reads as being written down rather
          // than as one block arriving. Off the index rather than off `perRow`,
          // because a short card would otherwise take the whole video to
          // assemble six rows that were on screen from the start.
          <Row key={bout.number} card={card} bout={bout} enter={progress(f, i * 6, i * 6 + 18)} />
        ))}
      </div>
    </div>
  );
}

function Row({ card, bout, enter }: { card: Card; bout: Bout; enter: number }) {
  if (enter <= 0) return null;

  const { red, blue } = cornersOf(card, bout);
  const redName = fullName(red);
  const blueName = fullName(blue);
  // Set to whichever name is longer, so neither corner is the one that wraps.
  const nameSize = Math.max(redName.length, blueName.length) > 11 ? 30 : 38;

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        display: "grid",
        // The centre column is wide enough for the longest class line a mixed
        // card produces — "57kg · Women's · Amateur · MMA" — on one line. Broken
        // over two it reads as a second bout rather than as the detail of this
        // one.
        gridTemplateColumns: "88px 1fr 290px 1fr 88px",
        alignItems: "center",
        gap: 14,
        padding: "0 40px",
        borderTop: "1px solid rgba(255,255,255,0.09)",
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [40, 0], easeOutCubic)}px)`,
      }}
    >
      <PortraitChip fighter={red} size={88} accent={RED} />
      <Corner name={redName} gym={stated(red.gym)} size={nameSize} align="right" />

      <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
        <Label size={13} color={bout.billing ? GOLD : ASH}>
          {boutBillingLabel(bout)}
        </Label>
        <div className="display" style={{ fontSize: 34, color: ASH }}>
          v
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 13,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: CHALK,
            textAlign: "center",
          }}
        >
          {boutClassLine(bout)}
        </div>
      </div>

      <Corner name={blueName} gym={stated(blue.gym)} size={nameSize} align="left" />
      <PortraitChip fighter={blue} size={88} accent={BLUE} />
    </div>
  );
}

/**
 * One corner of a row. The gym is left out where nobody has given one, rather
 * than printed as the prompt the card editor holds: `stated()` treats "Gym to
 * confirm" as the blank it is, and a promotional video is the last place to
 * print a placeholder as a fact.
 */
function Corner({
  name,
  gym,
  size,
  align,
}: {
  name: string;
  gym: string | undefined;
  size: number;
  align: "left" | "right";
}) {
  return (
    <div style={{ display: "grid", gap: 8, textAlign: align, justifyItems: align === "right" ? "end" : "start" }}>
      <div className="display" style={{ fontSize: size, lineHeight: 0.94 }}>
        {name}
      </div>
      {gym ? <Label size={14}>{gym}</Label> : null}
    </div>
  );
}

// ------------------------------------------------------------------ scene 3

function Close({ card, frame, qr }: { card: Card; frame: number; qr: ShowSceneProps["qr"] }) {
  const { start, end } = SCENES.close;
  const opacity = pulse(frame, start, start + 14, end - 6, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const { event } = card;
  const sponsors = showSponsors(card).slice(0, 6);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: 80,
        textAlign: "center",
        opacity,
        background: "linear-gradient(to bottom, rgba(7,8,10,0.86), rgba(7,8,10,0.97))",
      }}
    >
      <div
        className="display"
        style={{
          fontSize: 84,
          transform: `translateY(${interpolate(f, [0, 20], [32, 0], easeOutBack)}px)`,
        }}
      >
        {event.name}
      </div>
      <Label size={17}>
        {formatShowDateLong(event.date)} · {event.venue}, {event.city}
      </Label>

      <div style={{ marginTop: 14, opacity: progress(f, 8, 26) }}>
        <QrPlate matrix={qr} size={340} />
      </div>
      <Label size={16} color={GOLD}>
        Scan for the full programme
      </Label>

      {sponsors.length ? (
        <div style={{ marginTop: 30 }}>
          <SponsorEmblems sponsors={sponsors} opacity={progress(f, 20, 40)} size={48} gap={28} />
        </div>
      ) : null}
    </div>
  );
}
