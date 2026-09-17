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
import { qrPath } from "@/lib/qr";
import { SITE_URL } from "@/lib/site";
import {
  boutBillingLabel,
  formatEventDateShort,
  formatRecord,
  fullName,
  lastName,
  leadName,
  stated,
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
  cornerName,
} from "./parts";
import { SEQ } from "./timeline";

/**
 * One fighter, ten seconds, made for them to post.
 *
 * The other two templates are the promoter's. This one is the fighter's, and
 * that changes what is on it: their picture large, their name, their gym, their
 * record, and then the three things that make it an advert rather than a
 * portrait — which show, which bout, and who they are facing. It closes on the
 * programme's QR code, because the only thing the fighter's followers can
 * usefully do with it is open the card.
 *
 * Rendered once per corner rather than once per bout, which is what the `corner`
 * prop is for: the two fighters get a video each with their own name on it
 * rather than one they have to share.
 *
 * Pure function of `frame`, as the tape is. Handover section 4.
 */

export const WALKOUT_FRAMES = 300; // 10s at 30fps

const SCENES = {
  /** The fighter: portrait, name, gym, record, show, bout, opponent. */
  hero: { start: 0, end: 232 },
  /** The way in to the programme. */
  close: { start: 224, end: WALKOUT_FRAMES },
} as const;

export function Walkout({
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
  const { event } = card;
  const fighter = card.fighters[corner === "red" ? bout.redId : bout.blueId];
  const opponent = card.fighters[corner === "red" ? bout.blueId : bout.redId];

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
      <Backdrop event={event} frame={frame} duration={WALKOUT_FRAMES} opacity={0.28} />
      <Embers frame={frame} width={SEQ.width} height={SEQ.height} />

      <Hero
        event={event}
        bout={bout}
        fighter={fighter}
        opponent={opponent}
        corner={corner}
        frame={frame}
      />
      <Close event={event} fighter={fighter} corner={corner} frame={frame} />

      <Vignette />
    </div>
  );
}

// ------------------------------------------------------------------- scene 1

function Hero({
  event,
  bout,
  fighter,
  opponent,
  corner,
  frame,
}: {
  event: FightEvent;
  bout: Bout;
  fighter: Fighter;
  opponent: Fighter;
  corner: Corner;
  frame: number;
}) {
  const { start, end } = SCENES.hero;
  const opacity = pulse(frame, start, start + 10, end - 12, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const accent = accentOf(corner);

  // One fighter on their own, so the move is a rise and a settle rather than the
  // sideways travel the two-corner compositions use. The push-in runs the whole
  // scene, which is what stops a single still portrait reading as a stalled
  // render.
  const rise = interpolate(f, [0, 30], [70, 0], easeOutCubic);
  const push = interpolate(f, [0, 220], [1.1, 1.01]);

  const surname = lastName(fighter);
  const lead = leadName(fighter);
  const gym = stated(fighter.gym);
  const hometown = stated(fighter.hometown);

  const record = formatRecord(fighter);
  const counted = countTo(f, [56, 96], fighter.record?.w ?? 0);
  const countedRecord =
    record && record !== "Debut" ? [counted, ...record.split("-").slice(1)].join("-") : record;

  const nameIn = progress(f, 20, 44);
  const metaIn = progress(f, 44, 64);

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {/* Their corner's colour, behind them. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(64% 44% at 50% 36%, ${accent}4d 0%, transparent 72%)`,
          opacity: progress(f, 0, 24),
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 40,
          top: 128,
          width: 1000,
          height: 1240,
          transform: `translateY(${rise}px) scale(${push})`,
          transformOrigin: "50% 26%",
        }}
      >
        <Subject fighter={fighter} accent={accent} objectPosition="50% 12%" />
      </div>

      {/* Scrim, so every line below sits on something dark whatever the
          photograph behind it turned out to be. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, #07080a 26%, rgba(7,8,10,0.86) 42%, transparent 66%)",
        }}
      />

      <div style={{ position: "absolute", top: 62, left: 70, opacity: progress(f, 12, 30) }}>
        <Label size={18}>{event.name}</Label>
      </div>
      <div style={{ position: "absolute", top: 62, right: 70, opacity: progress(f, 12, 30) }}>
        <Label size={18} color={accent}>
          {cornerName(corner)}
        </Label>
      </div>

      <div style={{ position: "absolute", left: 70, right: 70, top: 1150, display: "grid", gap: 16 }}>
        {lead ? (
          <Label size={26} color={CHALK} style={{ opacity: nameIn }}>
            {lead}
          </Label>
        ) : null}

        <div
          className="display"
          style={{
            fontSize: surname.length > 8 ? 130 : 158,
            lineHeight: 0.84,
            opacity: nameIn,
            transform: `translateY(${interpolate(f, [20, 44], [58, 0], easeOutBack)}px)`,
          }}
        >
          {surname}
        </div>

        {fighter.nickname ? (
          <div className="display" style={{ fontSize: 50, color: GOLD, opacity: metaIn }}>
            &ldquo;{fighter.nickname}&rdquo;
          </div>
        ) : null}

        <div
          style={{
            height: 4,
            background: accent,
            width: interpolate(f, [26, 54], [0, 340], easeOutExpo),
          }}
        />

        {gym ? (
          <div className="display" style={{ fontSize: 44, opacity: metaIn }}>
            {gym}
          </div>
        ) : null}
        {hometown ? (
          <Label size={20} style={{ opacity: metaIn }}>
            {hometown}
          </Label>
        ) : null}

        {countedRecord ? (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "baseline",
              gap: 20,
              opacity: progress(f, 54, 72),
            }}
          >
            <Label size={20}>Record</Label>
            <div className="display tnum" style={{ fontSize: 82 }}>
              {countedRecord}
            </div>
          </div>
        ) : null}
      </div>

      {/* The show, then the bout. Two beats rather than one line, because the
          date is what a follower needs and the opponent is what they stay for. */}
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          bottom: 210,
          borderTop: "2px solid rgba(255,255,255,0.14)",
          paddingTop: 26,
          display: "grid",
          gap: 12,
          opacity: progress(f, 108, 132),
          transform: `translateY(${interpolate(f, [108, 132], [22, 0], easeOutCubic)}px)`,
        }}
      >
        <Label size={19} color={CHALK}>
          {formatEventDateShort(event.date)} · {event.venue}
        </Label>
      </div>

      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          bottom: 92,
          display: "flex",
          alignItems: "baseline",
          gap: 22,
          opacity: progress(f, 144, 170),
          transform: `translateY(${interpolate(f, [144, 170], [22, 0], easeOutCubic)}px)`,
        }}
      >
        <Label size={19} color={accent}>
          Bout {bout.number}
        </Label>
        {/* The billing only where there is one, so an undercard bout does not get
            a blank slot where a main event's flash would be. */}
        {bout.billing ? (
          <Label size={17} color={GOLD}>
            {boutBillingLabel(bout)}
          </Label>
        ) : null}
        <div className="display" style={{ fontSize: 46, marginLeft: "auto" }}>
          <span style={{ color: ASH, fontSize: 30 }}>vs </span>
          {fullName(opponent)}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- scene 2

/**
 * The way in.
 *
 * A code rather than an address, because a URL read off a video is a URL nobody
 * types. It points at SITE_URL rather than at whatever origin rendered it: an
 * mp4 leaves this app entirely and gets posted somewhere else, so a code made on
 * a laptop that said `localhost` would be a code that works for precisely one
 * person. That is the opposite of the choice components/QrCode.tsx makes for the
 * printed table card, and for the same reason — where the thing ends up decides
 * which address is the true one.
 */
function Close({
  event,
  fighter,
  corner,
  frame,
}: {
  event: FightEvent;
  fighter: Fighter;
  corner: Corner;
  frame: number;
}) {
  const { start, end } = SCENES.close;
  const opacity = pulse(frame, start, start + 12, end - 6, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const code = qrPath(`${SITE_URL}/e/${event.slug}`);
  const panel = 420;
  const quiet = 2; // modules of margin, so the code is never flush to the panel

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 34,
        padding: 90,
        textAlign: "center",
        opacity,
        background: "linear-gradient(to bottom, rgba(7,8,10,0.82), rgba(7,8,10,0.97))",
      }}
    >
      <Label size={19} color={accentOf(corner)}>
        {lastName(fighter)} · {event.name}
      </Label>

      <div
        style={{
          width: panel,
          height: panel,
          background: CHALK,
          padding: 22,
          transform: `scale(${interpolate(f, [0, 22], [0.86, 1], easeOutBack)})`,
          opacity: progress(f, 0, 18),
        }}
      >
        <svg
          viewBox={`${-quiet} ${-quiet} ${code.size + quiet * 2} ${code.size + quiet * 2}`}
          width="100%"
          height="100%"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <path d={code.path} fill={INK} />
        </svg>
      </div>

      <Rule width={interpolate(f, [10, 34], [0, 400], easeOutExpo)} />

      <div className="display" style={{ fontSize: 46, color: GOLD, opacity: progress(f, 16, 36) }}>
        Scan for the full programme
      </div>

      <div style={{ display: "grid", gap: 12, opacity: progress(f, 24, 46) }}>
        <Label size={20} color={CHALK}>
          {formatEventDateShort(event.date)}
        </Label>
        <Label size={17}>
          {event.venue}, {event.city}
        </Label>
      </div>
    </div>
  );
}
