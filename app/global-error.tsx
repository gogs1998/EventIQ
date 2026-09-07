"use client";

import { useEffect } from "react";
import { APP_ERROR } from "@/lib/copy";
import { logError } from "@/lib/log";

/**
 * The last boundary. It replaces the root layout, which means it replaces the
 * `<html>` and `<body>` the fonts and the stylesheet are attached to.
 *
 * So this one does not use the design tokens, and that is deliberate rather than
 * lazy: `globals.css`, the Anton and Oswald variables and the masthead all come
 * from the layout that has just failed, and a fallback that depends on the thing
 * it is a fallback for is not a fallback. The palette is written out here in the
 * same values `app/globals.css` holds, with system faces behind them, so the
 * page still reads as ours on a runtime where nothing else loaded.
 *
 * There is no masthead for the same reason there is no stylesheet: this can be
 * reached from a programme page, and EventIQ's name does not go over the top of
 * a promoter's show even in a failure.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError({ event: "render", route: "global", digest: error.digest }, error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07080a",
          color: "#f4f5f7",
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: "34rem", padding: "2rem 1.25rem", textAlign: "left" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2rem",
              lineHeight: 0.95,
              textTransform: "uppercase",
              fontFamily: "'Arial Narrow', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
          >
            {APP_ERROR.heading}
          </h1>
          <p style={{ marginTop: "1rem", fontSize: "0.9rem", lineHeight: 1.6, color: "#9aa1ad" }}>
            {APP_ERROR.body}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              padding: "0.75rem 1.5rem",
              border: 0,
              cursor: "pointer",
              background: "#f4f5f7",
              color: "#07080a",
              fontSize: "1rem",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              fontFamily: "'Arial Narrow', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
          >
            {APP_ERROR.retry}
          </button>
          {error.digest ? (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.6rem",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#5d646f",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
