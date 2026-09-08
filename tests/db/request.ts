/**
 * The one request the code under test thinks it is inside.
 *
 * Next.js reads the cookie and the headers out of an async context that only
 * exists inside a request, so the suite aliases `next/headers` to a module
 * reading this one instead. It is deliberately a real cookie jar rather than a
 * stubbed `currentPromoter`: signing in during a test goes through
 * `signIn()` in lib/session.ts and signing the cookie, so the ownership tests
 * exercise the session code as written rather than a stand-in for it.
 */

const jar = new Map<string, string>();
let requestHeaders = new Headers();

/**
 * What a Set-Cookie would carry. Only the attributes this project sets, because
 * the point of keeping them is that a test can say what the browser is being
 * told rather than only what the jar ends up holding — the sign-out bug (44) was
 * a header a browser threw away for its attributes, and a jar that records a
 * name and forgets the rest cannot see that happen.
 */
export type CookieAttributes = {
  httpOnly?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
  path?: string;
  maxAge?: number;
  domain?: string;
};

type WrittenCookie = CookieAttributes & { name: string };

const written: WrittenCookie[] = [];
const cleared: WrittenCookie[] = [];

export const cookieJar = {
  get(name: string) {
    const value = jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string, options: CookieAttributes = {}) {
    jar.set(name, value);
    written.push({ name, ...options });
  },
  // Both shapes the real jar takes, because the object form is the one that
  // carries the attributes and is therefore the one worth being able to read.
  delete(cookie: string | WrittenCookie) {
    const { name, ...options } = typeof cookie === "string" ? { name: cookie } : cookie;
    jar.delete(name);
    cleared.push({ name, ...options });
  },
};

/** Every cookie written during this test, in order, with its attributes. */
export function cookiesWritten(): readonly WrittenCookie[] {
  return written;
}

/** Every cookie expired during this test, in order, with its attributes. */
export function cookiesCleared(): readonly WrittenCookie[] {
  return cleared;
}

export function currentHeaders(): Headers {
  return requestHeaders;
}

/** The headers this request carries — the render key, and the referrer. */
export function setRequestHeaders(values: Record<string, string>): void {
  requestHeaders = new Headers(values);
}

/** Back to a caller holding nothing: no session cookie, no headers. */
export function clearRequest(): void {
  jar.clear();
  written.length = 0;
  cleared.length = 0;
  requestHeaders = new Headers();
}
