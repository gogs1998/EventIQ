import { easeOutBack, interpolate, progress } from "@/lib/anim";
import { boutsRunning, showSponsors } from "@/lib/card";
import { boutCountLabel } from "@/lib/copy";
import { formatShowDateLong } from "@/lib/promo";
import {
  ASH,
  Backdrop,
  CHALK,
  Embers,
  GOLD,
  INK,
  Label,
  QrPlate,
  Rule,
  SponsorEmblems,
  Vignette,
  riseIn,
  type ShowSceneProps,
} from "./show-parts";
import { SEQ } from "./timeline";

/**
 * The night itself, in eight seconds.
 *
 * What a promoter posts on the morning of the show and pins: where it is, when
 * the doors open, when the first bell goes, how much is on, and the code. It
 * assembles rather than cutting between scenes, because the last second of it is
 * a still worth screenshotting — which is what a poster frame is.
 *
 * The bout count comes from `boutCountLabel`, so a card whose running order is
 * not in yet says what is true instead of advertising nought bouts. That rule is
 * in lib/copy.ts with a test on it, and this is exactly the kind of surface it
 * was written for: nobody reads a video by eye for its empty case.
 */

export const DOORS_DURATION = 240; // 8s at 30fps

export function ShowDoors({ card, frame, qr }: ShowSceneProps) {
  const { event } = card;
  const bouts = boutsRunning(card).length;
  const sponsors = showSponsors(card).slice(0, 6);

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
      <Backdrop event={event} frame={frame} duration={DOORS_DURATION} />
      <Embers frame={frame} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "110px 80px 96px",
          textAlign: "center",
        }}
      >
        {/* Who is putting it on, and what it is called. */}
        <div style={{ display: "grid", gap: 20, justifyItems: "center", ...riseIn(frame, 0, 28) }}>
          {event.promoter.mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.promoter.mark}
              alt=""
              style={{ width: 84, height: 84, opacity: 0.9 }}
            />
          ) : null}
          <Label size={17}>{event.promoter.name}</Label>
          <div
            className="display"
            style={{
              fontSize: event.name.length > 16 ? 116 : 140,
              lineHeight: 0.88,
              transform: `translateY(${interpolate(frame, [2, 30], [30, 0], easeOutBack)}px)`,
            }}
          >
            {event.name}
          </div>
          <div style={{ opacity: progress(frame, 18, 44), display: "grid", gap: 14, justifyItems: "center" }}>
            <Rule width={360} />
            <div className="display" style={{ fontSize: 56 }}>
              {event.venue}
            </div>
            <Label size={19}>
              {formatShowDateLong(event.date)} · {event.city}
            </Label>
          </div>
        </div>

        {/* The two times somebody standing outside actually needs. */}
        <div
          style={{
            display: "flex",
            gap: 90,
            alignItems: "flex-start",
            ...riseIn(frame, 44, 76, 28),
          }}
        >
          <TimeBlock label="Doors" time={event.doorsTime} />
          <div style={{ width: 2, height: 128, background: "rgba(255,255,255,0.18)" }} />
          <TimeBlock label="First bell" time={event.firstBellTime} accent />
        </div>

        <div style={{ ...riseIn(frame, 66, 92, 22) }}>
          <div className="display" style={{ fontSize: 68, color: GOLD }}>
            {boutCountLabel(bouts)}
          </div>
        </div>

        {/* The code, at the size it is read at from across a room. */}
        <div style={{ display: "grid", gap: 20, justifyItems: "center", ...riseIn(frame, 84, 112, 24) }}>
          <QrPlate matrix={qr} size={440} />
          <Label size={17} color={GOLD}>
            Scan for the full programme
          </Label>
        </div>

        {/* Everything is in by the fourth second, so the still the poster frame
            is taken from is the finished poster rather than a half-built one. */}
        {sponsors.length ? (
          <SponsorEmblems
            sponsors={sponsors}
            opacity={progress(frame, 104, 140)}
            size={46}
            gap={26}
          />
        ) : null}
      </div>

      <Vignette />
    </div>
  );
}

function TimeBlock({ label, time, accent }: { label: string; time: string; accent?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <Label size={18} color={accent ? GOLD : ASH}>
        {label}
      </Label>
      <div className="display tnum" style={{ fontSize: 112, lineHeight: 0.9 }}>
        {time}
      </div>
    </div>
  );
}
