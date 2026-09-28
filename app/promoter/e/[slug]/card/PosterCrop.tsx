"use client";

import { useRef, useState } from "react";
import { SHEET_IMPORT } from "@/lib/copy";
import { cx } from "@/lib/cx";

/**
 * Where one fighter is on a poster, as a fraction of it.
 *
 * Fractions rather than pixels because the box is drawn over an image scaled to
 * whatever width the panel happens to be, and cut out of the original at its
 * full size. A number of pixels would be true of one of those and wrong about
 * the other.
 */
export type CropBox = { x: number; y: number; w: number; h: number };

export type PosterCrops = { red: CropBox | null; blue: CropBox | null };

type Corner = keyof PosterCrops;

/** Small enough to be a mis-click rather than a crop, and dropped rather than sent. */
const MIN_SIDE = 0.04;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

/**
 * Two boxes over a poster, one per corner.
 *
 * The crop is made in the browser and uploaded as an ordinary photograph,
 * because there is no image library on the Workers runtime to make it with — the
 * one thing that already crosses that line is the background removal, which runs
 * on the renderer's machine and takes three and a half seconds a picture. A
 * canvas the promoter already has open is the cheap side of that trade.
 *
 * Drawing is a drag: press on the poster, pull a box, let go. Which corner it
 * belongs to is a choice above the image rather than something inferred from the
 * order the boxes were drawn, because a promoter who drew them the other way
 * round would otherwise have two fighters in each other's corner and no way to
 * see that they had.
 */
export function PosterCrop({
  url,
  crops,
  redName,
  blueName,
  onChange,
}: {
  url: string;
  crops: PosterCrops;
  redName: string;
  blueName: string;
  onChange: (crops: PosterCrops) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<Corner>("red");
  const [live, setLive] = useState<CropBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const pointAt = (event: React.PointerEvent): { x: number; y: number } | null => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  };

  const boxBetween = (a: { x: number; y: number }, b: { x: number; y: number }): CropBox => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">{SHEET_IMPORT.postersCrop}</span>
        {(["red", "blue"] as const).map((corner) => (
          <button
            key={corner}
            type="button"
            aria-pressed={drawing === corner}
            onClick={() => setDrawing(corner)}
            className={cx(
              "border px-2.5 py-1 text-xs transition-colors",
              drawing === corner
                ? corner === "red"
                  ? "border-red-corner text-chalk"
                  : "border-blue-corner text-chalk"
                : "border-hairline text-ash hover:text-chalk",
            )}
          >
            {corner === "red"
              ? redName || SHEET_IMPORT.postersRed
              : blueName || SHEET_IMPORT.postersBlue}
            {crops[corner] ? " ✓" : ""}
          </button>
        ))}
        {(crops.red || crops.blue) && (
          <button
            type="button"
            onClick={() => onChange({ red: null, blue: null })}
            className="text-ash hover:text-chalk px-2 py-1 text-xs underline underline-offset-2"
          >
            Clear both
          </button>
        )}
      </div>

      <div
        ref={frame}
        onPointerDown={(event) => {
          const at = pointAt(event);
          if (!at) return;
          // Capture so a drag that leaves the poster still ends on it. It is not
          // what makes the drag work, so a browser that will not give it up must
          // not take the crop with it.
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {}
          start.current = at;
          setLive({ x: at.x, y: at.y, w: 0, h: 0 });
        }}
        onPointerMove={(event) => {
          const from = start.current;
          const at = from && pointAt(event);
          if (from && at) setLive(boxBetween(from, at));
        }}
        onPointerUp={(event) => {
          const from = start.current;
          const at = from && pointAt(event);
          start.current = null;
          setLive(null);
          if (!from || !at) return;
          const box = boxBetween(from, at);
          // A tap rather than a drag clears the corner instead of putting a
          // one-pixel crop on a fighter, which is what the upload would
          // otherwise send.
          onChange({ ...crops, [drawing]: box.w >= MIN_SIDE && box.h >= MIN_SIDE ? box : null });
        }}
        className="border-hairline relative mt-2 touch-none border select-none"
      >
        {/* Plain img: this is an object URL for a file the browser is already
            holding, so there is nothing for the image optimiser to do with it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" draggable={false} className="block w-full" />

        {(["red", "blue"] as const).map((corner) => {
          const box = corner === drawing && live ? live : crops[corner];
          if (!box) return null;
          return (
            <div
              key={corner}
              aria-hidden
              style={{
                left: percent(box.x),
                top: percent(box.y),
                width: percent(box.w),
                height: percent(box.h),
              }}
              className={cx(
                "pointer-events-none absolute border-2",
                corner === "red" ? "border-red-corner" : "border-blue-corner",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * The crop itself, as a JPEG small enough to upload.
 *
 * The same downscale the questionnaire does to a photograph off a phone, for the
 * same reason: what comes out of a poster at full size is several megabytes and
 * the action refuses anything over four. Quality is the questionnaire's too, so
 * a fighter cropped off a poster and a fighter who sent their own picture reach
 * the video through the same kind of file.
 */
export async function cropToJpeg(file: File, box: CropBox, max = 1000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const sx = Math.round(box.x * bitmap.width);
  const sy = Math.round(box.y * bitmap.height);
  const sw = Math.max(1, Math.round(box.w * bitmap.width));
  const sh = Math.max(1, Math.round(box.h * bitmap.height));
  const scale = Math.min(1, max / Math.max(sw, sh));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext("2d")?.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image"))),
      "image/jpeg",
      0.86,
    ),
  );
}
