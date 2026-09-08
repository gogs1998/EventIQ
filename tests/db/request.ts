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

export const cookieJar = {
  get(name: string) {
    const value = jar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string) {
    jar.set(name, value);
  },
  delete(name: string) {
    jar.delete(name);
  },
};

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
  requestHeaders = new Headers();
}
