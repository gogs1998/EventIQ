"use client";

import { useEffect, useState } from "react";
import type { Card } from "@/lib/card";
import { captureState } from "@/lib/capture";
import type { QrMatrix } from "@/lib/qr";
import { showTemplate, type ShowTemplateId } from "./show-templates";
import { SEQ } from "./timeline";

/**
 * The capture surface for a show-level video.
 *
 * Exactly the contract RenderStage publishes for a bout — `window.__setFrame`,
 * `window.__ready`, `window.__brokenImages`, `window.__checkImages` and
 * `window.__duration` — because scripts/render-show.mjs drives it the same way
 * scripts/render-tape.mjs drives that one, and a second capture page with a
 * second contract is two things to keep in step for no gain. The globals are
 * declared once, in RenderStage.tsx, and are visible here because they are
 * global; declaring them again would be a second place for them to drift.
 *
 * The template is looked up here rather than handed down from the page, because
 * a template carries a render function and a function does not cross the
 * server-to-client boundary. The page has already refused an id that is not one
 * of these, so the lookup below cannot be how an unknown template is handled.
 *
 * `now` comes from the page for the same reason `card` does. It is the clock the
 * countdown counts against, and a composition that read it itself would draw a
 * different picture on the last frame of a long capture than on the first.
 */
export function ShowRenderStage({
  card,
  templateId,
  now,
  qr,
}: {
  card: Card;
  templateId: ShowTemplateId;
  now: number;
  qr: QrMatrix;
}) {
  const [frame, setFrame] = useState(0);
  const template = showTemplate(templateId);
  const duration = template?.duration ?? SEQ.duration;

  useEffect(() => {
    window.__setFrame = (next: number) => setFrame(next);
    window.__duration = duration;

    const broken: string[] = [];
    window.__brokenImages = broken;
    // Accumulates rather than being replaced: each check sees only what is on
    // screen at the time, and a show is refused for an image that was broken at
    // any point in its run.
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
      // while we are waiting on the ones already in it.
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
      // Still set when something is broken, so the exporter is let in to read
      // what went wrong rather than waiting out its timeout on a flag that is
      // never coming.
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
  }, [duration]);

  if (!template) return <div>Unknown template</div>;

  return (
    <>
      {/* The page-wide grain overlay is viewport-sized, so it would not scale
          with the composition. Keep it out of the captured frame — and with it
          the development overlay, which draws a badge in the bottom corner of
          the viewport, and the viewport is the frame. It has no counterpart in
          production, so hiding it costs nothing and its absence costs a promoter
          a video with a toolbar in it. */}
      <style>{`.grain,nextjs-portal{display:none!important}html,body{margin:0;overflow:hidden;background:#07080a}`}</style>
      <div id="stage" style={{ width: SEQ.width, height: SEQ.height, overflow: "hidden" }}>
        {template.render({ card, frame, now, qr })}
      </div>
    </>
  );
}
