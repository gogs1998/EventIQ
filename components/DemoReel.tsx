"use client";

import { useRef, useState } from "react";

/**
 * The recorded walkthrough of the demo, framed as a phone because that is what
 * it was shot on and because it is where a spectator actually reads this.
 *
 * Controls only appear once it is playing, so the resting state is a poster and
 * one thing to press rather than a browser chrome bar across the bottom of the
 * picture.
 */
export function DemoReel({
  src,
  poster,
  seconds,
  label = "Watch the walkthrough",
}: {
  src: string;
  poster: string;
  seconds: number;
  label?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  return (
    <div className="border-hairline bg-ink-2 relative mx-auto w-full max-w-[340px] border">
      <video
        ref={video}
        src={src}
        poster={poster}
        preload="none"
        playsInline
        controls={started}
        className="block w-full"
        style={{ aspectRatio: "454 / 984" }}
        onEnded={() => setStarted(false)}
        aria-label="Walkthrough of the EventIQ demo"
      />
      {started ? null : (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
            void video.current?.play();
          }}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-[2px] transition-colors hover:bg-black/30"
        >
          <span className="border-chalk/70 group-hover:bg-chalk group-hover:text-ink flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors">
            <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="display text-xl">{label}</span>
          <span className="label">{seconds} seconds, no sound</span>
        </button>
      )}
    </div>
  );
}
