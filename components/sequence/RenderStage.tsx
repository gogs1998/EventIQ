"use client";

import { useEffect, useState } from "react";
import { getBout } from "@/lib/tape";
import { TaleOfTheTape } from "./TaleOfTheTape";
import { SEQ } from "./timeline";

declare global {
  interface Window {
    /** Jump to an exact frame. The exporter calls this between screenshots. */
    __setFrame?: (frame: number) => void;
    /** Set once fonts and images have settled and capture can begin. */
    __ready?: boolean;
    __duration?: number;
  }
}

/**
 * The capture surface. Rendered at exactly 1080x1920 with no scaling so a
 * screenshot of the viewport is a finished video frame.
 *
 * The exporter navigates here once and then drives frames through
 * `window.__setFrame`, which is far quicker than reloading 480 times and
 * guarantees every frame comes from the same page state.
 */
export function RenderStage({ boutNumber }: { boutNumber: number }) {
  const [frame, setFrame] = useState(0);
  const bout = getBout(boutNumber);

  useEffect(() => {
    window.__setFrame = (next: number) => setFrame(next);
    window.__duration = SEQ.duration;

    let cancelled = false;
    const settle = async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
      );
      if (!cancelled) window.__ready = true;
    };
    void settle();

    return () => {
      cancelled = true;
      delete window.__setFrame;
      window.__ready = false;
    };
  }, []);

  if (!bout) return <div>Unknown bout</div>;

  return (
    <>
      {/* The page-wide grain overlay is viewport-sized, so it would not scale with
          the composition. Keep it out of the captured frame. */}
      <style>{`.grain{display:none!important}html,body{margin:0;overflow:hidden;background:#07080a}`}</style>
      <div
        id="stage"
        style={{ width: SEQ.width, height: SEQ.height, overflow: "hidden" }}
      >
        <TaleOfTheTape bout={bout} frame={frame} />
      </div>
    </>
  );
}
