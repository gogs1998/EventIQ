"use client";

import { useEffect, useState } from "react";

/**
 * Generated in the browser from the current origin, so the code always points at
 * wherever this is actually running. That means it can be scanned off a laptop
 * screen in a meeting, or off a printed card at the venue, with nothing to
 * configure either way.
 */
export function QrCode({
  path,
  size = 260,
  className,
  showUrl = false,
}: {
  path: string;
  size?: number;
  className?: string;
  /** Off by default: a printed table card should carry the code, not a URL. */
  showUrl?: boolean;
}) {
  const [code, setCode] = useState<{ svg: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const target = `${window.location.origin}${path}`;
      const QRCode = (await import("qrcode")).default;
      const svg = await QRCode.toString(target, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#000000ff", light: "#00000000" },
      });
      if (!cancelled) setCode({ svg, url: target });
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className={className}>
      <div
        className="bg-chalk mx-auto flex aspect-square w-full items-center justify-center p-3"
        style={{ maxWidth: size }}
      >
        {code ? (
          <div
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: code.svg }}
          />
        ) : (
          <div className="bg-panel h-full w-full animate-pulse" />
        )}
      </div>
      {showUrl && code ? (
        <p className="text-ash-dim mt-2 break-all font-mono text-[0.55rem]">{code.url}</p>
      ) : null}
    </div>
  );
}
