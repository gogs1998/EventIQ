"use client";

import { useEffect, useState } from "react";
import { boutOf, type Card } from "@/lib/card";
import { captureState } from "@/lib/capture";
import { TaleOfTheTape } from "./TaleOfTheTape";
import { SEQ } from "./timeline";

declare global {
  interface Window {
    /** Jump to an exact frame. The exporter calls this between screenshots. */
    __setFrame?: (frame: number) => void;
    /** Set once fonts and images have settled and capture can begin. */
    __ready?: boolean;
    __duration?: number;
    /**
     * Every image source this page asked for and did not get. Empty is the only
     * state a bout may be captured in: a refused portrait is `complete` like any
     * other finished request, so readiness alone cannot tell a fighter from a
     * hole where one should be.
     */
    __brokenImages?: string[];
    /**
     * Re-reads the document and adds anything newly broken to that list, then
     * returns it. The exporter calls this on every frame, because a portrait
     * does not enter the document until its reveal starts — the settle below
     * happens long before there is a portrait to be wrong about.
     */
    __checkImages?: (undecodable?: readonly string[]) => string[];
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
export function RenderStage({ card, boutNumber }: { card: Card; boutNumber: number }) {
  const [frame, setFrame] = useState(0);
  const bout = boutOf(card, boutNumber);

  useEffect(() => {
    window.__setFrame = (next: number) => setFrame(next);
    window.__duration = SEQ.duration;

    const broken: string[] = [];
    window.__brokenImages = broken;
    // The list accumulates rather than being replaced, because each check sees
    // only the scene that is on screen at the time and a bout is refused for an
    // image that was broken at any point in its sixteen seconds.
    const check = (undecodable: readonly string[] = []) => {
      const state = captureState(Array.from(document.images));
      for (const src of [...state.broken, ...undecodable]) {
        if (src && !broken.includes(src)) broken.push(src);
      }
      return state;
    };
    window.__checkImages = (undecodable) => {
      check(undecodable);
      return broken;
    };

    let cancelled = false;
    const settle = async () => {
      await document.fonts.ready;
      // Asked again rather than once, because an image can enter the document
      // while we are waiting on the ones that were already in it, and a snapshot
      // taken before it arrived would call the page settled without it.
      for (let pass = 0; pass < 5 && !check().ready; pass += 1) {
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
      }
      // Ready means settled, and it is still set when something is broken: the
      // exporter has to be let in to read what went wrong, or a refused portrait
      // presents as a two-minute wait for a flag that never arrives rather than
      // as the missing object it is.
      if (!cancelled) window.__ready = true;
    };
    void settle();

    return () => {
      cancelled = true;
      delete window.__setFrame;
      delete window.__checkImages;
      delete window.__brokenImages;
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
        <TaleOfTheTape card={card} bout={bout} frame={frame} />
      </div>
    </>
  );
}
