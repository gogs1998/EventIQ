import { event } from "@/data/event";
import {
  countTo,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  interpolate,
  progress,
  pulse,
  staggered,
} from "@/lib/anim";
import {
  boutBillingLabel,
  boutClassLine,
  boutFormat,
  buildHooksFrom,
  buildTapeFrom,
  firstName,
  formatEventDateShort,
  formatRecord,
  getFighter,
  getSponsor,
  lastName,
  type TapeRow,
} from "@/lib/tape";
import type { Bout, Corner, Fighter, Sponsor } from "@/lib/types";
import { emberX, emberY, embers } from "./atmosphere";
import { SCENES, SEQ } from "./timeline";

/**
 * The tale of the tape as a still image at a given frame.
 *
 * No state, no CSS animation, no timers: every pixel is derived from `frame`.
 * The in-page player advances `frame` with requestAnimationFrame; the exporter
 * screenshots each frame in headless Chrome. Both get identical output.
 */

const RED = "#e8121f";
const BLUE = "#1668f0";
const GOLD = "#f0c04a";

const EMBERS = embers(34);

export function TaleOfTheTape({
  bout,
  frame,
  red: redOverride,
  blue: blueOverride,
}: {
  bout: Bout;
  frame: number;
  /** Supplied by the questionnaire preview, where the fighter is not on the card yet. */
  red?: Fighter;
  blue?: Fighter;
}) {
  const red = redOverride ?? getFighter(bout.redId);
  const blue = blueOverride ?? getFighter(bout.blueId);

  return (
    <div
      style={{
        position: "relative",
        width: SEQ.width,
        height: SEQ.height,
        overflow: "hidden",
        background: "#07080a",
        color: "#f4f5f7",
      }}
    >
      <Backdrop frame={frame} />
      <Embers frame={frame} />

      <Billing bout={bout} frame={frame} />
      <Reveal bout={bout} fighter={red} corner="red" frame={frame} scene={SCENES.red} />
      <Reveal bout={bout} fighter={blue} corner="blue" frame={frame} scene={SCENES.blue} />
      <HeadToHead bout={bout} frame={frame} red={red} blue={blue} />
      <Close bout={bout} frame={frame} red={red} blue={blue} />

      <Vignette />
    </div>
  );
}

// ------------------------------------------------------------------- layers

/** Drifts for the whole sequence so the cutouts always have something to move against. */
function Backdrop({ frame }: { frame: number }) {
  const scale = interpolate(frame, [0, SEQ.duration], [1.05, 1.28]);
  const y = interpolate(frame, [0, SEQ.duration], [0, -70]);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: 0.34 }}>
      {event.backdrop ? (
        // eslint-disable-next-line @next/next/no-img-element
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
      ) : null}
    </div>
  );
}

function Embers({ frame }: { frame: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {EMBERS.map((ember, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: emberX(ember, frame, SEQ.width),
            top: emberY(ember, frame, SEQ.height),
            width: ember.size,
            height: ember.size,
            borderRadius: "50%",
            background: "#ffb47a",
            opacity: ember.opacity,
            filter: "blur(1px)",
          }}
        />
      ))}
    </div>
  );
}

function Vignette() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(120% 80% at 50% 40%, transparent 40%, rgba(0,0,0,0.72) 100%)",
      }}
    />
  );
}

// ------------------------------------------------------------------- pieces

function Rule({ width, color = "#ffffff" }: { width: number; color?: string }) {
  return <div style={{ width, height: 2, background: color, opacity: 0.85 }} />;
}

function Label({
  children,
  size = 22,
  color = "#9aa1ad",
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

function SponsorRow({
  sponsors,
  opacity,
  size = 44,
}: {
  sponsors: Sponsor[];
  opacity: number;
  size?: number;
}) {
  if (!sponsors.length) return null;
  return (
    <div style={{ display: "flex", gap: 28, alignItems: "center", opacity }}>
      {sponsors.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {s.mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.mark} alt="" style={{ width: size, height: size, opacity: 0.9 }} />
          ) : null}
          <div style={{ lineHeight: 1 }}>
            <div className="display" style={{ fontSize: size * 0.42 }}>
              {s.name}
            </div>
            {s.qualifier ? (
              <div
                className="font-mono"
                style={{
                  fontSize: size * 0.24,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#9aa1ad",
                }}
              >
                {s.qualifier}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function fighterSponsors(f: Fighter): Sponsor[] {
  return (f.sponsorIds ?? []).map((id) => getSponsor(id)).filter((s): s is Sponsor => !!s);
}

// ------------------------------------------------------------------- scene 1

function Billing({ bout, frame }: { bout: Bout; frame: number }) {
  const { start, end } = SCENES.billing;
  const opacity = pulse(frame, start, start + 12, end - 14, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const lift = interpolate(f, [2, 24], [50, 0], easeOutBack);
  const ruleWidth = interpolate(f, [8, 34], [0, 560], easeOutExpo);
  const classFade = progress(f, 18, 34);

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
        opacity,
        padding: 80,
        textAlign: "center",
      }}
    >
      {event.promoter.mark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.promoter.mark}
          alt=""
          style={{
            width: 96,
            height: 96,
            opacity: interpolate(f, [0, 20], [0, 0.9]),
          }}
        />
      ) : null}
      <Label size={20}>{event.promoter.name}</Label>

      <Rule width={ruleWidth} />

      <div
        className="display"
        style={{
          fontSize: bout.billing ? 168 : 200,
          transform: `translateY(${lift}px)`,
          letterSpacing: "-0.02em",
        }}
      >
        {boutBillingLabel(bout)}
      </div>

      {bout.titleLabel ? (
        <div
          className="display"
          style={{
            fontSize: 40,
            color: GOLD,
            letterSpacing: "0.06em",
            opacity: classFade,
            maxWidth: 820,
          }}
        >
          {bout.titleLabel}
        </div>
      ) : null}

      <div style={{ opacity: classFade, display: "grid", gap: 12, marginTop: 8 }}>
        <Label size={26} color="#f4f5f7">
          {boutClassLine(bout)}
        </Label>
        <Label size={20}>{boutFormat(bout)}</Label>
      </div>

      <div style={{ position: "absolute", bottom: 90, display: "grid", gap: 10, justifyItems: "center" }}>
        <div className="display" style={{ fontSize: 44, opacity: classFade }}>
          {event.name}
        </div>
        <Label size={18} style={{ opacity: classFade }}>
          {formatEventDateShort(event.date)} · {event.venue}
        </Label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- scenes 2 and 3

function Reveal({
  bout,
  fighter,
  corner,
  frame,
  scene,
}: {
  bout: Bout;
  fighter: Fighter;
  corner: Corner;
  frame: number;
  scene: { start: number; end: number };
}) {
  const { start, end } = scene;
  const opacity = pulse(frame, start, start + 12, end - 14, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const dir = corner === "red" ? -1 : 1;
  const accent = corner === "red" ? RED : BLUE;

  // The cutout travels further and faster than the backdrop behind it, which is
  // what sells depth from what is only ever a flat photograph.
  const cutoutX = interpolate(f, [0, 46], [dir * 150, 0], easeOutCubic);
  const cutoutScale = interpolate(f, [0, 100], [1.16, 1.02]);
  const glowX = interpolate(f, [0, 46], [dir * 60, 0], easeOutCubic);

  const nameLift = interpolate(f, [12, 34], [64, 0], easeOutBack);
  const nameFade = progress(f, 12, 28);
  const metaFade = progress(f, 26, 42);
  const recordFade = progress(f, 34, 48);
  const sweep = progress(f, 26, 62);

  const record = formatRecord(fighter);
  const wins = fighter.record?.w ?? 0;
  const countedWins = countTo(f, [34, 62], wins);
  const animatedRecord =
    record && record !== "Debut" ? [countedWins, ...record.split("-").slice(1)].join("-") : record;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      {/* Corner glow, the slowest moving layer. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${glowX}px)`,
          background: `radial-gradient(60% 45% at ${corner === "red" ? "34%" : "66%"} 42%, ${accent}55 0%, transparent 70%)`,
        }}
      />

      {/* The fighter. */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 150,
          width: 1000,
          height: 1333,
          transform: `translateX(${cutoutX}px) scale(${cutoutScale})`,
          transformOrigin: "50% 30%",
        }}
      >
        {fighter.cutout ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fighter.cutout}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "top center",
              filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.75)) contrast(1.06)",
            }}
          />
        ) : (
          <NoPhotoPlate fighter={fighter} accent={accent} />
        )}

        {/* Light sweep across the subject. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            mixBlendMode: "overlay",
            opacity: sweep > 0 && sweep < 1 ? 0.5 : 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -100,
              bottom: -100,
              width: 240,
              left: `${-30 + sweep * 130}%`,
              background: "linear-gradient(90deg, transparent, #ffffff, transparent)",
              transform: "skewX(-16deg)",
            }}
          />
        </div>
      </div>

      {/* Scrim so the type always sits on something dark. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, #07080a 20%, rgba(7,8,10,0.85) 38%, transparent 62%)",
        }}
      />

      {/* Vertical corner tag, kept clear of the event label at the top. */}
      <div
        style={{
          position: "absolute",
          top: 620,
          [corner === "red" ? "left" : "right"]: 44,
          transform: `rotate(${corner === "red" ? -90 : 90}deg)`,
          transformOrigin: corner === "red" ? "left top" : "right top",
          opacity: metaFade,
        }}
      >
        <Label size={24} color={accent}>
          {corner === "red" ? "Red Corner" : "Blue Corner"}
        </Label>
      </div>

      {/* Name block. */}
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          bottom: 190,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ opacity: nameFade }}>
          <Label size={26} color="#f4f5f7">
            {firstName(fighter)}
          </Label>
        </div>
        <div
          className="display"
          style={{
            fontSize: lastName(fighter).length > 8 ? 132 : 164,
            transform: `translateY(${nameLift}px)`,
            opacity: nameFade,
            lineHeight: 0.84,
          }}
        >
          {lastName(fighter)}
        </div>

        {fighter.nickname ? (
          <div
            className="display"
            style={{ fontSize: 48, color: GOLD, opacity: metaFade }}
          >
            &ldquo;{fighter.nickname}&rdquo;
          </div>
        ) : null}

        <div style={{ height: 3, background: accent, width: interpolate(f, [20, 48], [0, 320], easeOutExpo) }} />

        <div style={{ opacity: metaFade, display: "grid", gap: 8 }}>
          <div className="display" style={{ fontSize: 40 }}>
            {fighter.gym}
          </div>
          {fighter.hometown ? <Label size={20}>{fighter.hometown}</Label> : null}
        </div>

        {animatedRecord ? (
          <div
            style={{
              opacity: recordFade,
              display: "flex",
              alignItems: "baseline",
              gap: 18,
              marginTop: 10,
            }}
          >
            <Label size={20}>Record</Label>
            <div className="display tnum" style={{ fontSize: 76 }}>
              {animatedRecord}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <SponsorRow
            sponsors={fighterSponsors(fighter)}
            opacity={progress(f, 52, 72)}
            size={58}
          />
        </div>
      </div>

      {/* Bout marker, so a clip lifted from the middle still says what it is. */}
      <div style={{ position: "absolute", top: 70, left: 70, opacity: metaFade }}>
        <Label size={18}>
          {event.name} · {boutBillingLabel(bout)}
        </Label>
      </div>
    </div>
  );
}

function NoPhotoPlate({ fighter, accent }: { fighter: Fighter; accent: string }) {
  const initials = fighter.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.1,
          backgroundImage: "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 18px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "18% 22%",
          border: `3px solid ${accent}`,
          opacity: 0.35,
        }}
      />
      <div className="display" style={{ fontSize: 220, opacity: 0.4 }}>
        {initials}
      </div>
      <Label size={22}>Photo to follow</Label>
    </div>
  );
}

// ------------------------------------------------------------------- scene 4

/** Rebuilds a row's text with its number counting up. */
function countedValue(
  row: TapeRow,
  corner: Corner,
  frame: number,
  range: [number, number],
): string | undefined {
  const value = corner === "red" ? row.redValue : row.blueValue;
  const display = corner === "red" ? row.red : row.blue;
  if (value === undefined || display === undefined) return display;

  const n = countTo(frame, range, value);

  if (row.key === "height" || row.key === "reach") return `${n}cm`;
  if (row.key === "record") {
    if (display === "Debut") return display;
    return [n, ...display.split("-").slice(1)].join("-");
  }
  return String(n);
}

function HeadToHead({
  bout,
  frame,
  red,
  blue,
}: {
  bout: Bout;
  frame: number;
  red: Fighter;
  blue: Fighter;
}) {
  const { start, end } = SCENES.headToHead;
  const opacity = pulse(frame, start, start + 14, end - 14, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const rows = buildTapeFrom(red, blue);

  const enter = (dir: number) => interpolate(f, [0, 40], [dir * 220, 0], easeOutCubic);
  const vsScale = interpolate(f, [4, 40], [1.6, 1], easeOutExpo);
  const nameFade = progress(f, 20, 38);

  const FIGHTERS_TOP = 108;
  const FIGHTERS_HEIGHT = 840;
  const STATS_TOP = 992;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(105deg, rgba(232,18,31,0.20) 0%, transparent 42%, transparent 58%, rgba(22,104,240,0.20) 100%)",
        }}
      />

      {/* Both fighters, turned in to face each other across a centre seam. */}
      <div
        style={{
          position: "absolute",
          top: FIGHTERS_TOP,
          left: 0,
          right: 0,
          height: FIGHTERS_HEIGHT,
        }}
      >
        <FaceOff fighter={red} corner="red" offset={enter(-1)} height={FIGHTERS_HEIGHT} />
        <FaceOff fighter={blue} corner="blue" offset={enter(1)} height={FIGHTERS_HEIGHT} />

        {/* Seam. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 2,
            marginLeft: -1,
            background:
              "linear-gradient(to bottom, transparent, rgba(255,255,255,0.5) 30%, rgba(255,255,255,0.5) 70%, transparent)",
            opacity: progress(f, 16, 40),
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 300,
            transform: `translate(-50%, 0) scale(${vsScale})`,
            width: 132,
            height: 132,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#07080a",
            border: "2px solid rgba(255,255,255,0.28)",
            borderRadius: "50%",
            opacity: progress(f, 8, 30),
          }}
        >
          <span className="display" style={{ fontSize: 60 }}>
            Vs
          </span>
        </div>
      </div>

      {/* Names sit outside the clipped portrait frames so they can never crop. */}
      <FaceOffName fighter={red} corner="red" top={FIGHTERS_TOP + 596} opacity={nameFade} />
      <FaceOffName fighter={blue} corner="blue" top={FIGHTERS_TOP + 596} opacity={nameFade} />

      <div
        style={{
          position: "absolute",
          top: 44,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: progress(f, 10, 26),
        }}
      >
        <Label size={22} color="#f4f5f7">
          Tale of the Tape
        </Label>
      </div>

      {/* Stat rows, on their own plate so the venue behind never competes. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: STATS_TOP,
          bottom: 0,
          background: "linear-gradient(to bottom, rgba(7,8,10,0.55), #07080a 12%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: STATS_TOP + 40,
          display: "grid",
          gap: 4,
        }}
      >
        {rows.map((row, i) => {
          const rowStart = staggered(i, 30, 8);
          const rowIn = progress(f, rowStart, rowStart + 16);
          if (rowIn <= 0) return null;

          return (
            <div
              key={row.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 240px 1fr",
                alignItems: "center",
                opacity: rowIn,
                transform: `translateY(${interpolate(rowIn, [0, 1], [22, 0], easeOutCubic)}px)`,
                borderTop: "1px solid rgba(255,255,255,0.09)",
                padding: "10px 0",
              }}
            >
              <TapeValue
                text={countedValue(row, "red", f, [rowStart, rowStart + 26])}
                leading={row.leader === "red"}
                accent={RED}
                align="right"
              />
              <div style={{ textAlign: "center" }}>
                <Label size={17}>{row.label}</Label>
                {row.edge ? (
                  <div
                    className="font-mono tnum"
                    style={{
                      marginTop: 4,
                      fontSize: 17,
                      letterSpacing: "0.16em",
                      color: row.leader === "red" ? RED : BLUE,
                      opacity: progress(f, rowStart + 18, rowStart + 30),
                    }}
                  >
                    {row.edge}
                  </div>
                ) : null}
              </div>
              <TapeValue
                text={countedValue(row, "blue", f, [rowStart, rowStart + 26])}
                leading={row.leader === "blue"}
                accent={BLUE}
                align="left"
              />
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 64,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: progress(f, 96, 116),
        }}
      >
        <Label size={16}>
          {event.name} · {boutBillingLabel(bout)} · {boutClassLine(bout)}
        </Label>
      </div>
    </div>
  );
}

function FaceOff({
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
  const accent = corner === "red" ? RED : BLUE;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        [corner === "red" ? "left" : "right"]: 0,
        width: 538,
        height,
        overflow: "hidden",
        transform: `translateX(${offset}px)`,
      }}
    >
      {fighter.cutout ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fighter.cutout}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top center",
            // Mirror the blue corner so the two of them square up.
            transform: corner === "blue" ? "scaleX(-1)" : undefined,
            maskImage: "linear-gradient(to bottom, #000 62%, transparent 96%)",
            filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.7))",
          }}
        />
      ) : (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <NoPhotoPlate fighter={fighter} accent={accent} />
        </div>
      )}
    </div>
  );
}

function FaceOffName({
  fighter,
  corner,
  top,
  opacity,
}: {
  fighter: Fighter;
  corner: Corner;
  top: number;
  opacity: number;
}) {
  const accent = corner === "red" ? RED : BLUE;
  const name = lastName(fighter);

  return (
    <div
      style={{
        position: "absolute",
        top,
        [corner === "red" ? "left" : "right"]: 46,
        maxWidth: 470,
        textAlign: corner === "red" ? "left" : "right",
        opacity,
      }}
    >
      <div
        style={{
          height: 3,
          width: 84,
          background: accent,
          marginBottom: 14,
          marginLeft: corner === "blue" ? "auto" : 0,
        }}
      />
      <div
        className="display"
        style={{
          fontSize: name.length > 9 ? 54 : 68,
          lineHeight: 0.9,
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
      <Label size={16} style={{ marginTop: 10 }}>
        {fighter.gym}
      </Label>
    </div>
  );
}

function TapeValue({
  text,
  leading,
  accent,
  align,
}: {
  text?: string;
  leading: boolean;
  accent: string;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        padding: align === "right" ? "0 22px 0 0" : "0 0 0 22px",
      }}
    >
      {leading ? (
        <div
          style={{
            position: "absolute",
            [align === "right" ? "right" : "left"]: 0,
            top: 6,
            bottom: 6,
            width: 4,
            background: accent,
          }}
        />
      ) : null}
      <span
        className="display tnum"
        style={{ fontSize: 52, color: leading ? "#f4f5f7" : "#9aa1ad" }}
      >
        {text ?? "—"}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------- scene 5

function Close({
  bout,
  frame,
  red,
  blue,
}: {
  bout: Bout;
  frame: number;
  red: Fighter;
  blue: Fighter;
}) {
  const { start, end } = SCENES.close;
  const opacity = pulse(frame, start, start + 14, end - 10, end);
  if (opacity <= 0.001) return null;

  const f = frame - start;
  const hooks = buildHooksFrom(bout, red, blue);
  const sponsor = getSponsor(bout.sponsorId);

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
        background: "linear-gradient(to bottom, rgba(7,8,10,0.7), rgba(7,8,10,0.95))",
      }}
    >
      <div
        className="display"
        style={{
          fontSize: 96,
          lineHeight: 0.9,
          transform: `translateY(${interpolate(f, [0, 24], [40, 0], easeOutBack)}px)`,
        }}
      >
        {lastName(red)}
        <span style={{ color: "#5d646f" }}> vs </span>
        {lastName(blue)}
      </div>

      <Rule width={interpolate(f, [8, 34], [0, 420], easeOutExpo)} />

      {hooks.length ? (
        <div style={{ display: "grid", gap: 26, maxWidth: 840 }}>
          {hooks.slice(0, 2).map((hook, i) => {
            const hookStart = staggered(i, 16, 14);
            return (
              <div
                key={hook}
                // Sentences, so the readable face rather than the condensed one.
                style={{
                  fontSize: i === 0 ? 44 : 36,
                  fontWeight: i === 0 ? 500 : 400,
                  lineHeight: 1.28,
                  color: i === 0 ? "#f4f5f7" : "#9aa1ad",
                  opacity: progress(f, hookStart, hookStart + 16),
                  transform: `translateY(${interpolate(f, [hookStart, hookStart + 16], [18, 0], easeOutCubic)}px)`,
                }}
              >
                {hook}
              </div>
            );
          })}
        </div>
      ) : null}

      {sponsor ? (
        <div style={{ marginTop: 30, display: "grid", gap: 16, justifyItems: "center", opacity: progress(f, 40, 58) }}>
          <Label size={17}>This bout brought to you by</Label>
          <SponsorRow sponsors={[sponsor]} opacity={1} size={72} />
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          bottom: 110,
          display: "grid",
          gap: 12,
          justifyItems: "center",
          opacity: progress(f, 52, 70),
        }}
      >
        <div className="display" style={{ fontSize: 52 }}>
          {event.name}
        </div>
        <Label size={17}>
          {formatEventDateShort(event.date)} · {event.venue}, {event.city}
        </Label>
        <Label size={15} color={GOLD} style={{ marginTop: 10 }}>
          Scan for the full programme
        </Label>
      </div>
    </div>
  );
}
