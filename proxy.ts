import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Two things that have to happen before a request reaches a page.
 *
 * The first is the scheme. Cloudflare answers a proxied hostname on http as
 * readily as on https, and the setting that stops it — "Always Use HTTPS" under
 * SSL/TLS → Edge Certificates — is the zone's rather than the application's.
 * Until somebody turns it on, this is the next best thing: it reads the header
 * the proxy sets and sends plain http back to https itself. A missing header
 * means nothing is in front of us, which is local development, and there the
 * request is left alone.
 *
 * This is a partial cover and worth being honest about. Static files under
 * public/ are served straight off the Workers assets binding without the Worker
 * being invoked at all, so no middleware can reach them — `http://eventiq.win`
 * on a fighter photograph stays a 200 over plain http until the zone setting is
 * on. Forcing the Worker to run first would close that, at the cost of an
 * invocation on every image on the site, to do a job one toggle already does
 * properly.
 *
 * The second is the promoter area. This is a redirect, not the authorisation
 * check. It runs before the database is reachable, and verifying a signature
 * here would still leave every page needing to know which promoter is signed in
 * — so the real check is `currentPromoter()` inside each page and
 * `requirePromoter()` inside each action, and a forged cookie gets past this and
 * fails there. What this buys is that a signed-out visitor lands on the login
 * form rather than on an error, which is the difference between a product and a
 * prototype.
 *
 * The gate used to be the matcher. Now that the matcher has to be wide enough
 * for the scheme check, the gate is this pattern instead, and it covers what the
 * matcher used to: /promoter itself and a show underneath it, but not
 * /promoter/login, which a signed-out visitor is entitled to reach.
 */

const PROMOTER_AREA = /^\/promoter(\/e(\/|$)|$)/;

/**
 * Where there is no https to send anybody to.
 *
 * The scheme check reads `x-forwarded-proto`, on the reasoning that the header
 * is only there when something is in front of us. That turned out to be wrong:
 * `next dev` sets it to `http` on every request it serves, so a plain
 * `npm run dev` answered 308 to `https://localhost:3000`, which nothing is
 * listening on. Every page, the questionnaire, the capture page the mp4 renderer
 * screenshots — all of it, redirected to a port with no certificate on it.
 *
 * The host is the honest signal, because the thing being protected is a public
 * hostname served by Cloudflare and that is never one of these.
 */
const NO_HTTPS_HERE = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/;

export function proxy(request: NextRequest) {
  if (
    request.headers.get("x-forwarded-proto") === "http" &&
    !NO_HTTPS_HERE.test(request.nextUrl.hostname)
  ) {
    const secure = new URL(request.url);
    secure.protocol = "https:";
    return NextResponse.redirect(secure, 308);
  }

  if (!PROMOTER_AREA.test(request.nextUrl.pathname)) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/promoter/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the build output, which the assets binding serves without
  // invoking the Worker anyway, so matching it would only cost a check that
  // never runs.
  matcher: ["/((?!_next/).*)"],
};
