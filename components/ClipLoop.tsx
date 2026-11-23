"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A muted vertical loop on the product pages.
 *
 * Like HeroVideo it is served with `preload="none"` and started from here, so
 * the first paint is the poster and a reader who has asked for less motion only
 * ever sees the poster. Unlike the hero there are several on a page, so each one
 * plays only while it is on screen, and each has a button to stop it: moving
 * content that runs longer than five seconds has to be pausable (WCAG 2.2.2).
 */
export function ClipLoop({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStill(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (still || stopped) {
      video.pause();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          video.muted = true;
          video.preload = "auto";
          // A refusal (low-power mode, a data saver) leaves the poster up.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [still, stopped]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        aria-label={label}
        className={className}
      />
      {still ? null : (
        <button
          type="button"
          onClick={() => setStopped((s) => !s)}
          aria-label={stopped ? `Play: ${label}` : `Pause: ${label}`}
          className="label border-chalk/30 hover:border-chalk/70 bg-ink/70 text-chalk absolute right-2 top-2 border px-2 py-1 backdrop-blur-sm transition-colors"
        >
          {stopped ? "Play" : "Pause"}
        </button>
      )}
    </div>
  );
}
