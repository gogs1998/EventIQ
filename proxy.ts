import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Turns away requests to the promoter area that carry no session cookie at all.
 *
 * This is a redirect, not the authorisation check. It runs before the database
 * is reachable, and verifying a signature here would still leave every page
 * needing to know which promoter is signed in — so the real check is
 * `currentPromoter()` inside each page and `requirePromoter()` inside each
 * action, and a forged cookie gets past this and fails there. What this buys is
 * that a signed-out visitor lands on the login form rather than on an error,
 * which is the difference between a product and a prototype.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/promoter/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/promoter", "/promoter/e/:path*"],
};
