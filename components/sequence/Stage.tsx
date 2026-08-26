"use client";

import { useEffect, useRef, useState } from "react";
import { SEQ } from "./timeline";

/**
 * Renders the fixed 1080x1920 composition scaled to whatever width it is given,
 * so the phone and the mp4 are the same picture at different sizes.
 */
export function Stage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => setScale(node.clientWidth / SEQ.width);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="bg-ink relative w-full overflow-hidden"
      style={{ aspectRatio: `${SEQ.width} / ${SEQ.height}` }}
    >
      {scale > 0 ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: SEQ.width,
            height: SEQ.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
