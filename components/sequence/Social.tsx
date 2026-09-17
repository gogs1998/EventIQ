import {
  countTo,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  interpolate,
  progress,
  pulse,
} from "@/lib/anim";
import type { Card } from "@/lib/card";
import {
  boutBillingLabel,
  boutFormat,
  boutGrading,
  formatEventDateShort,
  formatRecord,
  lastName,
  stated,
  weightLabel,
} from "@/lib/tape";
import type { Bout, Corner, FightEvent, Fighter } from "@/lib/types";
import {
  ASH,
  Backdrop,
  CHALK,
  Embers,
  GOLD,
  INK,
  Label,
  Rule,
  Subject,
  Vignette,
  accentOf,
} from "./parts";
import { SEQ } from "./timeline";

/**
 * The tape compressed to six seconds, for a story or a reel.
 *
 * Four beats, one fact each, cut rather than dissolved. There is no room here
 * for the tape's stat rows or its hooks: at a second and a half a beat the only
 * things that land are the two names, the two records, what they are making and
 * when it is on.
 *
 * **Square-safe.** It is a 9:16 frame like the others, because that is what a
 * story wants, but everything that has to be read sits inside the middle
 * 1080x1080 — so the same file survives being cropped to a square for a feed
 * post without losing a name or a date. What sits outside that band is the
 * portraits and the backdrop, which are texture: losing the top and bottom of
 * them costs the picture nothing.
 *
 * Pure function of `frame`, as the tape is. Handover section 4.
 */

export const SOCIAL_FRAMES = 180; // 6s at 30fps

/**
 * The square a feed crop keeps. Centred, so a crop from either the top or the
 * bottom of the frame lands on the same band.
 */
const SAFE_TOP = (SEQ.height - SEQ.width) / 2;
const SAFE_BOTTOM = SAFE_TOP + SEQ.width;

const BEAT = 45; // 1.5s each, four of them

/** Start and end of beat `i`, in frames. */
function beatAt(index: number): { start: number; end: number } {
  return { start: index * BEAT, end: (index + 1) * BEAT };
}

/** How long one beat takes to arrive, and the one before it to leave. */
const CROSSFADE = 7;

/**
 * A beat's opacity.
 *
 * A beat leaves over the seven frames its successor arrives in, rather than
 * before them. Written the other way round first — out over the last seven
 * frames of the beat, in over the first seven of the next — and every boundary
 * was then one frame with nothing on it at all, including the frame at three
 * seconds, which is exactly the one a poster gets taken from. Overlapping the
 * ramps also means a beat's own timeline starts where its container does, so
 * nothing arrives at full opacity with its contents still at zero.
 *
 * The last beat never fades, so the file does not end on an empty frame that a
 * looping player shows as a stutter.
 */
function beatOpacity(frame: number, index: number): number {
  const { start, end } = beatAt(index);
  const last = end >= SOCIAL_FRAMES;
  return pulse(
    frame,
    start,
    start + CROSSFADE,
    last ? SOCIAL_FRAMES : end,
    last ? SOCIAL_FRAMES : end + CROSSFADE,
  );
}

export function Social({ card, bout, frame }: { card: Card; bout: Bout; frame: number }) {
  const { event } = card;
  const red = card.fighters[bout.redId];
  const blue = card.fighters[bout.blueId];

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
      <Backdrop event={event} frame={frame} duration={SOCIAL_FRAMES} opacity={0.24} />
      <Texture red={red} blue={blue} frame={frame} />
      <Embers frame={frame} width={SEQ.width} height={SEQ.height} />

      <SafeArea bout={bout} event={event} frame={frame}>
        <Beat index={0} frame={frame}>
          <Names red={red} blue={blue} frame={frame} />
        </Beat>
        <Beat index={1} frame={frame}>
          <Corners red={red} blue={blue} frame={frame} />
        </Beat>
        <Beat index={2} frame={frame}>
          <Making bout={bout} frame={frame} />
        </Beat>
        <Beat index={3} frame={frame}>
          <Show event={event} frame={frame} />
        </Beat>
      </SafeArea>

      <Vignette />
    </div>
  );
}

/**
 * Both fighters bled off the sides for the whole six seconds.
 *
 * Deliberately outside the readable band and deliberately quiet: it is what
 * stops four beats of centred type reading as a slide deck, and it is the first
 * thing a square crop eats into, which is exactly what it is there to be.
 */
function Texture({ red, blue, frame }: { red: Fighter; blue: Fighter; frame: number }) {
  const drift = interpolate(frame, [0, SOCIAL_FRAMES], [0, -50]);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: 0.32 }}>
      {(["red", "blue"] as const).map((corner) => (
        <div
          key={corner}
          style={{
            position: "absolute",
            [corner === "red" ? "left" : "right"]: 0,
            top: 100,
            width: 520,
            height: 1500,
            overflow: "hidden",
            transform: `translateY(${corner === "red" ? drift : -drift}px)`,
          }}
        >
          <Subject
            fighter={corner === "red" ? red : blue}
            accent={accentOf(corner)}
            frame={{ column: corner }}
            mirror={corner === "blue"}
            objectPosition="50% 14%"
          />
        </div>
      ))}
      {/* Pulls the middle back down so the type on top of it always has contrast. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(62% 38% at 50% 50%, rgba(7,8,10,0.96) 0%, rgba(7,8,10,0.74) 58%, rgba(7,8,10,0.34) 100%)",
        }}
      />
    </div>
  );
}

/**
 * The band everything readable lives in, with the two lines that stay up for all
 * six seconds: which bout it is, and whose show.
 */
function SafeArea({
  bout,
  event,
  frame,
  children,
}: {
  bout: Bout;
  event: FightEvent;
  frame: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: SAFE_TOP,
        height: SAFE_BOTTOM - SAFE_TOP,
      }}
    >
      <div style={{ position: "absolute", top: 54, left: 0, right: 0, textAlign: "center" }}>
        <Label size={19} color={CHALK} style={{ opacity: progress(frame, 2, 16) }}>
          {boutBillingLabel(bout)}
        </Label>
      </div>

      {/* The beats all draw into the same box, one at a time. */}
      <div style={{ position: "absolute", left: 60, right: 60, top: 170, bottom: 170 }}>
        {children}
      </div>

      <div style={{ position: "absolute", bottom: 52, left: 0, right: 0, textAlign: "center" }}>
        <Label size={16} style={{ opacity: progress(frame, 6, 22) }}>
          {event.promoter.name}
        </Label>
      </div>
    </div>
  );
}

function Beat({
  index,
  frame,
  children,
}: {
  index: number;
  frame: number;
  children: React.ReactNode;
}) {
  const opacity = beatOpacity(frame, index);
  if (opacity <= 0.001) return null;

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
        textAlign: "center",
        opacity,
      }}
    >
      {children}
    </div>
  );
}

// --------------------------------------------------------------------- beats

function Names({ red, blue, frame }: { red: Fighter; blue: Fighter; frame: number }) {
  const f = frame - beatAt(0).start;

  return (
    <>
      <CornerName fighter={red} corner="red" frame={f} delay={0} />
      <div
        className="display"
        style={{ fontSize: 46, color: ASH, opacity: progress(f, 10, 24) }}
      >
        Vs
      </div>
      <CornerName fighter={blue} corner="blue" frame={f} delay={8} />
    </>
  );
}

function CornerName({
  fighter,
  corner,
  frame: f,
  delay,
}: {
  fighter: Fighter;
  corner: Corner;
  frame: number;
  delay: number;
}) {
  const name = lastName(fighter);

  return (
    <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
      <div
        className="display"
        style={{
          fontSize: name.length > 10 ? 96 : 122,
          lineHeight: 0.86,
          opacity: progress(f, delay, delay + 16),
          transform: `translateY(${interpolate(f, [delay, delay + 18], [40, 0], easeOutBack)}px)`,
        }}
      >
        {name}
      </div>
      <div
        style={{
          height: 5,
          width: interpolate(f, [delay + 4, delay + 22], [0, 180], easeOutExpo),
          background: accentOf(corner),
        }}
      />
    </div>
  );
}

/**
 * What each corner brings.
 *
 * A record where there is one, and the gym where there is not — because the
 * fighter this has to work for is the one who is a name and a gym and nothing
 * else, and a beat with two empty slots on it is worse than no beat at all. The
 * gym goes through `stated`, so the placeholder a card editor writes is treated
 * as the blank it is rather than printed as a fact.
 */
function Corners({ red, blue, frame }: { red: Fighter; blue: Fighter; frame: number }) {
  const f = frame - beatAt(1).start;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, width: "100%" }}>
      <CornerFact fighter={red} corner="red" frame={f} delay={0} />
      <CornerFact fighter={blue} corner="blue" frame={f} delay={7} />
    </div>
  );
}

function CornerFact({
  fighter,
  corner,
  frame: f,
  delay,
}: {
  fighter: Fighter;
  corner: Corner;
  frame: number;
  delay: number;
}) {
  const record = formatRecord(fighter);
  const gym = stated(fighter.gym);
  const counted = countTo(f, [delay + 6, delay + 30], fighter.record?.w ?? 0);
  const countedRecord =
    record && record !== "Debut" ? [counted, ...record.split("-").slice(1)].join("-") : record;

  const label = countedRecord ? "Record" : gym ? "Gym" : undefined;
  const value = countedRecord ?? gym;

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        justifyItems: "center",
        opacity: progress(f, delay, delay + 16),
        transform: `translateY(${interpolate(f, [delay, delay + 20], [28, 0], easeOutCubic)}px)`,
      }}
    >
      <div style={{ height: 5, width: 120, background: accentOf(corner) }} />
      <Label size={17} color={CHALK}>
        {lastName(fighter)}
      </Label>
      {label ? <Label size={15}>{label}</Label> : null}
      {value ? (
        <div className="display tnum" style={{ fontSize: countedRecord ? 104 : 54, lineHeight: 0.9 }}>
          {value}
        </div>
      ) : null}
    </div>
  );
}

function Making({ bout, frame }: { bout: Bout; frame: number }) {
  const f = frame - beatAt(2).start;
  // The weight is the one number on a matchmaking sheet that is not whole, so it
  // is printed through weightLabel rather than counted up: 61.5kg must not spend
  // half a second reading 61kg, a weight neither corner agreed to make.
  const lift = interpolate(f, [0, 20], [44, 0], easeOutBack);

  return (
    <>
      <Label size={18} style={{ opacity: progress(f, 0, 14) }}>
        Contracted at
      </Label>
      <div
        className="display tnum"
        style={{
          fontSize: 210,
          lineHeight: 0.84,
          opacity: progress(f, 2, 18),
          transform: `translateY(${lift}px)`,
        }}
      >
        {weightLabel(bout.weightKg)}
      </div>
      <Rule width={interpolate(f, [8, 28], [0, 380], easeOutExpo)} height={3} />
      {/* The grading without the weight: the slab above already is the weight. */}
      <Label size={24} color={CHALK} style={{ opacity: progress(f, 14, 30) }}>
        {boutGrading(bout)}
      </Label>
      <Label size={20} style={{ opacity: progress(f, 18, 34) }}>
        {boutFormat(bout)}
      </Label>
    </>
  );
}

function Show({ event, frame }: { event: FightEvent; frame: number }) {
  const f = frame - beatAt(3).start;

  return (
    <>
      <div
        className="display"
        style={{
          fontSize: 124,
          lineHeight: 0.86,
          opacity: progress(f, 0, 16),
          transform: `translateY(${interpolate(f, [0, 20], [44, 0], easeOutBack)}px)`,
        }}
      >
        {event.name}
      </div>
      <Rule width={interpolate(f, [6, 26], [0, 460], easeOutExpo)} height={3} />
      <Label size={26} color={CHALK} style={{ opacity: progress(f, 12, 28) }}>
        {formatEventDateShort(event.date)}
      </Label>
      <Label size={20} style={{ opacity: progress(f, 16, 32) }}>
        {event.venue}, {event.city}
      </Label>
      <Label size={17} color={GOLD} style={{ marginTop: 18, opacity: progress(f, 24, 40) }}>
        Scan for the full programme
      </Label>
    </>
  );
}
