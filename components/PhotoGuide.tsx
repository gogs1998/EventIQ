import { PHOTO_GUIDE } from "@/lib/copy";

/**
 * What a photograph that cuts out well looks like, beside the control that
 * takes one.
 *
 * Drawn rather than photographed. A stock picture of a real person would be a
 * stranger's face on every fighter's form, and a drawing says "this shape"
 * without anybody wondering whose it is. Static on purpose: it is read once, on
 * a phone, and nothing about it needs to move.
 */
export function PhotoGuide() {
  return (
    <div className="border-hairline mt-3 border p-3">
      <p className="text-chalk text-xs">{PHOTO_GUIDE.headline}</p>
      <div className="mt-3 grid grid-cols-2 gap-3" role="img" aria-label={PHOTO_GUIDE.alt}>
        <Frame label={PHOTO_GUIDE.good} points={PHOTO_GUIDE.goodPoints} tone="good">
          <GoodSketch />
        </Frame>
        <Frame label={PHOTO_GUIDE.avoid} points={PHOTO_GUIDE.avoidPoints} tone="avoid">
          <AvoidSketch />
        </Frame>
      </div>
    </div>
  );
}

function Frame({
  label,
  points,
  tone,
  children,
}: {
  label: string;
  points: readonly string[];
  tone: "good" | "avoid";
  children: React.ReactNode;
}) {
  return (
    <div aria-hidden="true">
      <div className={tone === "good" ? "border-gold/50 border" : "border-hairline border"}>
        {children}
      </div>
      <p
        className={
          tone === "good"
            ? "text-gold mt-1.5 font-mono text-[0.5rem] uppercase tracking-[0.14em]"
            : "text-ash-dim mt-1.5 font-mono text-[0.5rem] uppercase tracking-[0.14em]"
        }
      >
        {label}
      </p>
      <ul className="text-ash-dim mt-1 grid gap-0.5 text-[0.65rem] leading-snug">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

/** One figure, centred, head to waist, lit, against a flat wall. */
function GoodSketch() {
  return (
    <svg viewBox="0 0 120 150" className="block h-auto w-full">
      <rect width="120" height="150" fill="#d9dce2" />
      <Figure x={60} scale={1} body="#5d6470" skin="#c79b7d" />
    </svg>
  );
}

/** Two figures shoulder to shoulder in a dark room, the second cut by the edge. */
function AvoidSketch() {
  return (
    <svg viewBox="0 0 120 150" className="block h-auto w-full">
      <rect width="120" height="150" fill="#1a1c22" />
      <circle cx="18" cy="16" r="2" fill="#6b5a3a" />
      <circle cx="34" cy="10" r="1.6" fill="#6b5a3a" />
      <circle cx="96" cy="14" r="2" fill="#6b5a3a" />
      <Figure x={104} scale={1} body="#121318" skin="#5b4a40" />
      <Figure x={52} scale={1} body="#121318" skin="#6e5a4c" />
    </svg>
  );
}

function Figure({ x, scale, body, skin }: { x: number; scale: number; body: string; skin: string }) {
  return (
    <g transform={`translate(${x} 0) scale(${scale}) translate(${-60} 0)`}>
      <path d="M18 150 C20 112 34 100 60 98 C86 100 100 112 102 150 Z" fill={body} />
      <rect x="52" y="78" width="16" height="24" rx="6" fill={skin} />
      <ellipse cx="60" cy="62" rx="19" ry="23" fill={skin} />
    </g>
  );
}
