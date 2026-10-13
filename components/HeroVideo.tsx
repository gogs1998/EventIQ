"use client";

import { useEffect, useRef } from "react";

/**
 * The fighter loop at the top of the pitch page.
 *
 * It is served without `autoPlay` and with `preload="none"`, so the first paint
 * is the poster and nothing about the video holds it up. Playback is started
 * here once the page has hydrated, and only for a reader who has not asked for
 * less motion: a phone set to reduce motion keeps the poster, which is a frame
 * of the same loop, and the page reads the same.
 *
 * `muted` is set on the element as well as in the markup because React does not
 * reliably write the attribute into server-rendered HTML, and a browser will
 * only autoplay a video it can see is muted.
 */
export function HeroVideo({
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

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (still.matches) {
        video.pause();
        return;
      }
      video.muted = true;
      video.preload = "auto";
      // A refusal (low-power mode, a data saver) leaves the poster up, which is
      // the state the page was designed to read in anyway.
      video.play().catch(() => {});
    };

    apply();
    still.addEventListener("change", apply);
    return () => still.removeEventListener("change", apply);
  }, []);

  return (
    <video
      ref={ref}
      data-hero
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
  );
}
