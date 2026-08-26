"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bout } from "@/lib/types";
import { TaleOfTheTape } from "./TaleOfTheTape";
import { Stage } from "./Stage";
import { SEQ } from "./timeline";

type Status = "idle" | "playing" | "paused" | "ended";

/**
 * Drives the composition from real elapsed time rather than counting ticks, so
 * a dropped frame costs smoothness instead of desynchronising the sequence.
 */
export function TapePlayer({ bout, mp4 }: { bout: Bout; mp4?: string }) {
  const [frame, setFrame] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const raf = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  const play = useCallback(
    (from?: number) => {
      stop();
      const begunAtFrame = from ?? (status === "ended" ? 0 : frame);
      const begunAt = performance.now();
      setStatus("playing");

      const step = () => {
        const elapsed = (performance.now() - begunAt) / 1000;
        const next = begunAtFrame + elapsed * SEQ.fps;

        if (next >= SEQ.duration) {
          setFrame(SEQ.duration - 1);
          setStatus("ended");
          raf.current = null;
          return;
        }

        setFrame(next);
        raf.current = requestAnimationFrame(step);
      };

      raf.current = requestAnimationFrame(step);
    },
    [frame, status, stop],
  );

  const pause = useCallback(() => {
    stop();
    setStatus("paused");
  }, [stop]);

  useEffect(() => stop, [stop]);

  const scrub = (value: number) => {
    stop();
    setStatus("paused");
    setFrame(value);
  };

  const seconds = (frame / SEQ.fps).toFixed(1);
  const total = (SEQ.duration / SEQ.fps).toFixed(1);

  return (
    <div className="grid gap-3">
      <div className="border-hairline relative border">
        <Stage>
          <TaleOfTheTape bout={bout} frame={Math.round(frame)} />
        </Stage>

        {status === "idle" || status === "ended" ? (
          <button
            type="button"
            onClick={() => play(0)}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px] transition-colors hover:bg-black/30"
          >
            <span className="border-chalk/70 group-hover:bg-chalk group-hover:text-ink flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors">
              <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="display text-xl">
              {status === "ended" ? "Watch again" : "Play the tape"}
            </span>
            <span className="label">16 seconds</span>
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (status === "playing" ? pause() : play())}
          className="border-hairline hover:border-chalk/40 flex h-9 w-9 shrink-0 items-center justify-center border transition-colors"
          aria-label={status === "playing" ? "Pause" : "Play"}
        >
          {status === "playing" ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <input
          type="range"
          min={0}
          max={SEQ.duration - 1}
          value={Math.round(frame)}
          onChange={(e) => scrub(Number(e.target.value))}
          className="accent-red-corner h-1 flex-1 cursor-pointer"
          aria-label="Scrub the tape"
        />

        <span className="tnum text-ash shrink-0 font-mono text-[0.6rem] tracking-widest">
          {seconds}/{total}s
        </span>
      </div>

      {mp4 ? (
        <a
          href={mp4}
          download
          className="border-hairline hover:border-chalk/40 label flex items-center justify-center gap-2 border py-2.5 transition-colors"
        >
          Download for Instagram
        </a>
      ) : null}
    </div>
  );
}
