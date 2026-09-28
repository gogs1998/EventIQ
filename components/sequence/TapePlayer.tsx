"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VideoShare } from "@/components/VideoShare";
import { track } from "@/lib/analytics";
import { promoTitle, type Card } from "@/lib/card";
import { VIDEO_SHARE } from "@/lib/copy";
import type { BoutRenders } from "@/lib/renders";
import type { Bout } from "@/lib/types";
import { FACEOFF_FRAMES } from "./FaceOff";
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
export function TapePlayer({
  card,
  bout,
  renders,
}: {
  card: Card;
  bout: Bout;
  renders?: BoutRenders;
}) {
  // Counted once per bout per visit, on the press rather than on render, so the
  // number a sponsor is shown is people who chose to watch.
  const played = () => track({ slug: card.event.slug, kind: "tape_play", boutNumber: bout.number });
  const mp4 = renders?.tape;
  return (
    <div className="grid gap-5">
      {mp4 ? (
        <VideoTape card={card} bout={bout} mp4={mp4} onPlay={played} />
      ) : (
        <LiveTape card={card} bout={bout} onPlay={played} />
      )}
      {renders?.faceoff ? (
        <PromoPlayer
          slug={card.event.slug}
          boutNumber={bout.number}
          mp4={renders.faceoff}
          title={promoTitle(card, bout)}
        />
      ) : null}
    </div>
  );
}

/**
 * The promo, offered rather than played first.
 *
 * The tale of the tape is what somebody who has opened the programme came for,
 * so it stays at the top and keeps the page it had. This sits under it as a
 * second thing to take away: shorter, made for posting, and the one a fighter is
 * actually going to want. Same player, same counting, smaller frame — it is an
 * offer, not a second headline.
 *
 * Exported because a fighter's own page draws it too, with nothing else around
 * it, and two players of the same file would eventually count differently.
 */
export function PromoPlayer({
  slug,
  boutNumber,
  mp4,
  title,
  fighterId,
}: {
  slug: string;
  boutNumber: number;
  mp4: string;
  title: string;
  /** Set on a fighter's own page, so a share says whose page it left from. */
  fighterId?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="label">{VIDEO_SHARE.promo}</div>
      <Frame>
        <video
          ref={video}
          src={`${mp4}#t=0.1`}
          preload="metadata"
          playsInline
          controls={started}
          className="block w-full"
          style={{ aspectRatio: `${SEQ.width} / ${SEQ.height}` }}
          onEnded={() => setStarted(false)}
          aria-label={`${VIDEO_SHARE.promo}, ${title}`}
        />
        {started ? null : (
          <PlayOverlay
            label={VIDEO_SHARE.promo}
            seconds={FACEOFF_FRAMES / SEQ.fps}
            onPlay={() => {
              setStarted(true);
              track({ slug, kind: "tape_play", boutNumber });
              void video.current?.play();
            }}
          />
        )}
      </Frame>
      <p className="text-ash-dim text-xs leading-relaxed">{VIDEO_SHARE.promoNote}</p>
      <VideoShare
        slug={slug}
        mp4={mp4}
        boutNumber={boutNumber}
        fighterId={fighterId}
        title={title}
      />
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="border-hairline relative border">{children}</div>;
}

function PlayOverlay({
  onPlay,
  label,
  seconds = SEQ.duration / SEQ.fps,
}: {
  onPlay: () => void;
  label: string;
  seconds?: number;
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
      <span className="label">{seconds} seconds</span>
    </button>
  );
}

function VideoTape({
  card,
  bout,
  mp4,
  onPlay,
}: {
  card: Card;
  bout: Bout;
  mp4: string;
  onPlay: () => void;
}) {
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
              onPlay();
              void video.current?.play();
            }}
          />
        )}
      </Frame>
      <VideoShare
        slug={card.event.slug}
        mp4={mp4}
        boutNumber={bout.number}
        title={promoTitle(card, bout)}
      />
    </div>
  );
}

function LiveTape({ card, bout, onPlay }: { card: Card; bout: Bout; onPlay: () => void }) {
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
          <TaleOfTheTape card={card} bout={bout} frame={Math.round(frame)} />
        </Stage>
        {status === "idle" || status === "ended" ? (
          <PlayOverlay
            label={status === "ended" ? "Watch again" : "Play the tape"}
            onPlay={() => {
              onPlay();
              play(0);
            }}
          />
        ) : null}
      </Frame>

      {/* Named as a set, because on a card of fifteen bouts a control called
          "Play" does not say which tape it plays. */}
      <div
        role="group"
        aria-label={`Tale of the tape, bout ${bout.number}`}
        className="flex items-center gap-3"
      >
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
