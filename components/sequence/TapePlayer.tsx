"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bout } from "@/lib/types";
import { TaleOfTheTape } from "./TaleOfTheTape";
import { Stage } from "./Stage";
import { SEQ } from "./timeline";

type Status = "idle" | "playing" | "paused" | "ended";

/**
 * Plays a bout's tale of the tape.
 *
 * Where a bout has been rendered to an mp4 we play that: it is hardware
 * decoded, so it is smooth on any phone, which the live composition is not.
 * Painting a 1080x1920 canvas of masked and shadowed layers thirty times a
 * second is real work, and the picture is identical either way because the file
 * was rendered from this same component.
 *
 * Without a file we fall back to driving the composition directly, which is also
 * what the questionnaire preview uses, since that has to update as you type.
 */
export function TapePlayer({ bout, mp4 }: { bout: Bout; mp4?: string }) {
  if (mp4) return <VideoTape bout={bout} mp4={mp4} />;
  return <LiveTape bout={bout} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="border-hairline relative border">{children}</div>;
}

function PlayOverlay({
  onPlay,
  label,
}: {
  onPlay: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px] transition-colors hover:bg-black/25"
    >
      <span className="border-chalk/70 group-hover:bg-chalk group-hover:text-ink flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors">
        <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-current">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="display text-xl">{label}</span>
      <span className="label">{SEQ.duration / SEQ.fps} seconds</span>
    </button>
  );
}

function DownloadLink({ mp4 }: { mp4: string }) {
  return (
    <a
      href={mp4}
      download
      className="border-hairline hover:border-chalk/40 label flex items-center justify-center gap-2 border py-2.5 transition-colors"
    >
      Download for Instagram
    </a>
  );
}

function VideoTape({ bout, mp4 }: { bout: Bout; mp4: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  return (
    <div className="grid gap-3">
      <Frame>
        <video
          ref={video}
          // The fragment nudges browsers into showing a real frame rather than
          // a black rectangle before playback.
          src={`${mp4}#t=0.1`}
          preload="metadata"
          playsInline
          controls={started}
          className="block w-full"
          style={{ aspectRatio: `${SEQ.width} / ${SEQ.height}` }}
          onEnded={() => setStarted(false)}
          aria-label={`Tale of the tape, bout ${bout.number}`}
        />
        {started ? null : (
          <PlayOverlay
            label="Play the tape"
            onPlay={() => {
              setStarted(true);
              void video.current?.play();
            }}
          />
        )}
      </Frame>
      <DownloadLink mp4={mp4} />
    </div>
  );
}

function LiveTape({ bout }: { bout: Bout }) {
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
      let current = from ?? (status === "ended" ? 0 : frame);
      let last = performance.now();
      const frameMs = 1000 / SEQ.fps;
      setStatus("playing");

      const step = (now: number) => {
        // Catch-up is capped, so a device that cannot keep up plays the sequence
        // slowly rather than skipping most of it and landing on the last frame.
        const behind = Math.floor((now - last) / frameMs);
        if (behind > 0) {
          const advance = Math.min(behind, 3);
          last += behind * frameMs;
          current += advance;

          if (current >= SEQ.duration) {
            setFrame(SEQ.duration - 1);
            setStatus("ended");
            raf.current = null;
            return;
          }
          setFrame(current);
        }
        raf.current = requestAnimationFrame(step);
      };

      raf.current = requestAnimationFrame(step);
    },
    [frame, status, stop],
  );

  useEffect(() => stop, [stop]);

  const seconds = (frame / SEQ.fps).toFixed(1);
  const total = (SEQ.duration / SEQ.fps).toFixed(1);

  return (
    <div className="grid gap-3">
      <Frame>
        <Stage>
          <TaleOfTheTape bout={bout} frame={Math.round(frame)} />
        </Stage>
        {status === "idle" || status === "ended" ? (
          <PlayOverlay
            label={status === "ended" ? "Watch again" : "Play the tape"}
            onPlay={() => play(0)}
          />
        ) : null}
      </Frame>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (status === "playing") {
              stop();
              setStatus("paused");
            } else {
              play();
            }
          }}
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
          onChange={(e) => {
            stop();
            setStatus("paused");
            setFrame(Number(e.target.value));
          }}
          className="accent-red-corner h-1 flex-1 cursor-pointer"
          aria-label="Scrub the tape"
        />

        <span className="tnum text-ash shrink-0 font-mono text-[0.6rem] tracking-widest">
          {seconds}/{total}s
        </span>
      </div>
    </div>
  );
}
