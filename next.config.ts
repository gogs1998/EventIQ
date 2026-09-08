import type { NextConfig } from "next";
// Relative rather than through the "@" alias, because this file is loaded by
// Node before the bundler's aliases exist.
import { SESSION_COOKIE } from "./lib/auth";

/**
 * The headers every page goes out with.
 *
 * The programme is a page a few hundred strangers open from a printed code in a
 * hall, and the promoter's dashboard is a session in the same origin, so the
 * thing worth spending a header on is anything that would let one become the
 * other. The policy below is the one this app actually needs and nothing more:
 * every script, style, font, image and video it loads is its own, because
 * next/font self-hosts the three faces at build time and the mp4s come out of
 * the media bucket at this origin. There is no third-party origin in it at all,
 * which is worth keeping — a CDN in the list is a CDN that can write scripts
 * into a page a sponsor's name is on.
 *
 * Two allowances are not ideal and are honest about why:
 *
 * - `'unsafe-inline'` for scripts, because Next.js inlines the flight payload
 *   that hydrates every server component. The alternative is a nonce, which has
 *   to be minted per request in proxy.ts and makes every page dynamic — it would
 *   turn the one page that has to be cheap under a hall full of phones into a
 *   render each. Worth revisiting if this ever gets a cache in front of it.
 * - `'unsafe-inline'` for styles, because the sequence sets transforms per frame
 *   as inline style, which is how the exporter gets a byte-identical frame.
 *
 * `frame-ancestors 'none'` is the one that closes something real: the QR page
 * and the programme framed inside somebody else's site would be a way to pass
 * off a promoter's card, and the dashboard framed anywhere is clickjacking a
 * session. The development exceptions are the dev server's own eval and its
 * websocket, and they are the only difference between the two policies.
 */
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // blob: is the questionnaire showing a photograph back before it has uploaded.
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "content-security-policy", value: contentSecurityPolicy },
  // The zone's "Always Use HTTPS" is still off and the deploy token cannot turn
  // it on, so this is the part of that job the app can do for itself: after one
  // https response a browser will not try plain http again. Not preloaded —
  // that is a submission to a browser list and a decision for the originator.
  { key: "strict-transport-security", value: "max-age=31536000; includeSubDomains" },
  { key: "x-content-type-options", value: "nosniff" },
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
  // For the browsers that predate frame-ancestors and still read this.
  { key: "x-frame-options", value: "DENY" },
  // Nothing here uses a device. Playing a bout's video is the one capability
  // that is asked for, and only by this origin.
  {
    key: "permissions-policy",
    value: [
      "accelerometer=()",
      "autoplay=(self)",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
];

/**
 * How long a shared cache may keep the programme.
 *
 * The load this exists for is several hundred phones opening one card inside a
 * ninety-minute window, during which the running order does not change. A minute
 * is short enough that a promoter correcting a name before first bell sees it
 * almost at once, and long enough that a hall costs a handful of renders rather
 * than one each; `stale-while-revalidate` is what keeps the first reader after
 * each minute from waiting for the database. The trade is stated rather than
 * hidden: for up to a minute after a show is unpublished, a cache may still be
 * handing out the copy it already had.
 *
 * **Only for a reader with no session cookie**, which is doing more work than it
 * looks. `loadVisibleCard` gives an unpublished show to nobody but the promoter
 * who owns it, and a promoter is signed in by definition — so with no cookie the
 * page is either a published card or a 404. The promoter's own preview never
 * matches this rule at all, and OpenNext puts `no-store` back on any 404
 * whatever these say, so a draft cannot reach a shared cache by either route.
 *
 * **This has to be here rather than on the page or in proxy.ts.** A server
 * component cannot set a response header at all. Middleware can, and on OpenNext
 * for Workers it does not survive: a header set on `NextResponse.next()` is
 * dropped before the response goes out — measured against
 * `wrangler dev`, with a probe header that never arrived. What these rules do
 * survive is Next.js's own `Cache-Control` for a dynamic page, because the
 * adapter merges the config's headers over the handler's. That is the opposite
 * of what the Next.js documentation promises on Vercel, so it is written down in
 * DEPLOY.md rather than left to be rediscovered.
 */
const programmeCache = [
  { key: "cache-control", value: "public, s-maxage=60, stale-while-revalidate=300" },
];

const ANONYMOUS = [{ type: "cookie" as const, key: SESSION_COOKIE }];

const nextConfig: NextConfig = {
  // The dev overlay badge would otherwise be burned into every captured frame
  // by the mp4 exporter, which screenshots the running dev server.
  devIndicators: false,
  images: {
    // Cloudflare's image resizing is bound separately, and every asset this app
    // serves is already optimised by scripts/prepare-assets.mjs.
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Server actions check that the request came from us, and behind
      // Cloudflare the host header is the forwarded one, so the origins it will
      // accept are written out rather than inferred. If a promoter's action
      // starts answering "Invalid Server Actions request", this is the list to
      // look at first.
      allowedOrigins: ["eventiq.win", "www.eventiq.win", "localhost:3000", "localhost:3101"],
    },
  },
  async headers() {
    return [
      {
        // Everything except /media, which sets a far stricter policy of its own
        // on objects a fighter uploaded — this one would replace it.
        source: "/:path((?!media/).*)",
        headers: securityHeaders,
      },
      // The programme and a fighter's page on it, for a reader who is not
      // signed in. Nothing else: not the QR card, not /promoter, /f, /render or
      // /api — three of those are behind a credential and the fourth writes.
      { source: "/e/:slug", missing: ANONYMOUS, headers: programmeCache },
      { source: "/e/:slug/f/:fighter", missing: ANONYMOUS, headers: programmeCache },
    ];
  },
};

export default nextConfig;

// Gives `next dev` the same D1 and R2 bindings the Worker gets, backed by the
// local Miniflare state under .wrangler. Without this the dev server has no
// database at all and every page falls over on its first query.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
