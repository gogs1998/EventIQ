import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;

// Gives `next dev` the same D1 and R2 bindings the Worker gets, backed by the
// local Miniflare state under .wrangler. Without this the dev server has no
// database at all and every page falls over on its first query.
//
// remoteBindings is off because Workers AI has no local emulation: the moment an
// `ai` binding is in wrangler.jsonc, the dev server tries to open a remote proxy
// session, and without a CLOUDFLARE_API_TOKEN in the environment that fails —
// taking D1 and R2 down with it, so every page that reads the database answers
// 500. Local development is meant to work offline and with no Cloudflare
// credentials at all. The cost is that the AI binding is simply absent here,
// which is the case app/f/[token]/portrait-actions.ts already answers with "not
// available here". Set a token and turn this back on to exercise it for real.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev({ remoteBindings: false });
