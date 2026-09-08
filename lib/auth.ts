/**
 * Promoter sessions, fighter invite tokens, and the renderer's key.
 *
 * There is no third-party auth here on purpose. The whole product has exactly
 * three kinds of caller — one promoter who owns a show, a fighter who was sent
 * a link, and the mp4 renderer, which is a machine holding a shared key — and
 * none of them justifies an identity provider, a redirect dance or a dependency
 * that has to be kept current. Web Crypto is in the Workers runtime and in
 * Node, so the same code runs in tests, in `next dev` and on the edge.
 *
 * The promoter's session is a signed cookie rather than a row in the database:
 * a signature can be checked without a read, and there is no session state worth
 * storing. Logging out clears the cookie; there is deliberately no server-side
 * revocation, because with one operator it would be ceremony rather than
 * security. Sessions expire, and the expiry is inside the signed payload so it
 * cannot be edited by the holder.
 */

const encoder = new TextEncoder();

/** Long enough that a promoter is not logged out mid-show, short enough to matter. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/**
 * The session cookie's name, which is not the same string everywhere.
 *
 * `__Host-` is not decoration: a browser refuses to store a cookie under that
 * prefix unless it is `Secure`, has `Path=/` and names no `Domain`, and it
 * refuses to let any other host — including a subdomain, and including plain
 * http on our own — set one. That closes the one attack the signature cannot,
 * which is somebody who gets to write a cookie for `*.eventiq.win` planting a
 * session of their own choosing in the promoter's browser. The attributes we
 * already set satisfy the prefix exactly, so it costs nothing.
 *
 * It cannot be used in development, because there is no https on localhost to
 * attach `Secure` to and the browser would silently drop the cookie. So the name
 * follows the same condition the `secure` attribute does, and both names are
 * cleared on sign-out so a cookie left over from the other one cannot linger.
 */
const SESSION_COOKIE_PLAIN = "eventiq_session";

export function sessionCookieName(secure: boolean): string {
  return secure ? `__Host-${SESSION_COOKIE_PLAIN}` : SESSION_COOKIE_PLAIN;
}

/**
 * The attributes the cookie is written with — and therefore the attributes it
 * has to be cleared with.
 *
 * Expiring a cookie is setting it again with a dead expiry, and a browser only
 * matches that against the cookie it is holding if the attributes agree. Under a
 * `__Host-` name it is stricter still: the prefix's conditions are checked on the
 * way in, so a Set-Cookie under that name arriving without `Secure` and `Path=/`
 * is not a removal that misses — it is a header the browser discards whole, and
 * the session outlives its own sign-out. That is bug 44, and it is why these live
 * beside the name rather than being written out at each call site: two copies of
 * a rule the browser enforces exactly are two copies that can drift.
 */
export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
};

export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    // httpOnly and lax rather than strict: the note at the top of lib/session.ts
    // says why.
    httpOnly: true,
    sameSite: "lax",
    // Secure and a root path are two of the three things `__Host-` requires. The
    // third is that no Domain is named, which is what leaving it out means.
    secure,
    path: "/",
  };
}

/**
 * Both cookies, each carrying the attributes its own name demands — the prefixed
 * one is `Secure` whatever environment is doing the clearing, because the name is
 * what the browser checks against. Signing out clears both, so a cookie left over
 * from a deploy on the other side of the https line cannot sit there shadowing
 * the one in use.
 */
export const SESSION_COOKIES = [true, false].map((secure) => ({
  name: sessionCookieName(secure),
  ...sessionCookieOptions(secure),
}));

/** Just the names, for the caching rule and the proxy's "is there a cookie at all". */
export const SESSION_COOKIE_NAMES = SESSION_COOKIES.map((cookie) => cookie.name);

/**
 * The floor on a new password, and the whole of the policy.
 *
 * Twelve characters and no composition rules. Requiring a capital, a digit and a
 * symbol makes passwords shorter, more predictable and more likely to be written
 * on the inside of a laptop lid; length is the only thing that reliably makes
 * one hard to guess, and NCSC has said so for years.
 *
 * Counted in code points rather than UTF-16 units, so a promoter who uses an
 * emoji is not told a twelve-character password is eleven.
 */
export const PASSWORD_MIN_LENGTH = 12;

export function passwordLongEnough(password: string): boolean {
  return [...password].length >= PASSWORD_MIN_LENGTH;
}

/**
 * A ceiling imposed by the runtime, not a number anybody chose. The deployed
 * Workers runtime refuses PBKDF2 above 100,000 iterations outright, so OWASP's
 * floor for PBKDF2-SHA256 — six times higher — simply cannot be reached here.
 *
 * The trap is that this is invisible everywhere it would be caught. Node has no
 * cap, so the tests and `next dev` pass at any count, and so does the local
 * `wrangler dev`, because the open-source workerd build does not enforce it
 * either. Only the real edge does, and it does so exactly at 100,000: a probe
 * run through `wrangler dev --remote` derives at 100,000 and throws
 * `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 * supported` at 100,001. So a hash minted at 600,000 by the seed script looks
 * healthy through every local check and then locks the promoter out of the live
 * site on their first sign-in.
 *
 * Verification reads the count out of the stored hash, so lowering this does not
 * invalidate hashes already written below the cap — but any hash written above
 * it is unverifiable in production and has to be regenerated by re-seeding.
 */
const PBKDF2_ITERATIONS = 100_000;

/**
 * A well-formed hash that no password matches, for the login to spend its time
 * on when the promoter does not exist.
 *
 * Built from the constant above rather than written out, because when it was
 * written out the two drifted: the constant came down to the runtime's cap and
 * this literal stayed at 600,000, so signing in as an unknown promoter kept
 * throwing on the edge long after the real login was fixed.
 */
export const ABSENT_PROMOTER_HASH =
  `${PBKDF2_ITERATIONS}:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` as const;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Constant time within the limits of the runtime. The comparison never returns
 * early, so the time it takes does not depend on how much of a forged signature
 * happened to be right.
 */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * The header the mp4 renderer presents instead of a cookie. Kept out of the
 * `authorization` header on purpose: this is not a user, it is a machine with
 * one key, and a name of our own cannot be confused with a bearer token by
 * anything sitting in front of the Worker.
 *
 * [scripts/render-tape.mjs](../scripts/render-tape.mjs) sends it. That script is
 * plain Node and cannot import this constant, so it carries the same string with
 * a comment pointing here — and it fails on the first non-200 from the render
 * page rather than screenshotting 480 frames of a 404.
 */
export const RENDER_KEY_HEADER = "x-eventiq-render-key";

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/**
 * Whether a presented secret is the expected one.
 *
 * Both sides are digested first and the digests compared, rather than comparing
 * the strings: `equal` returns early when two arrays are different lengths,
 * which is harmless for a signature of known size and is a length oracle for a
 * key somebody is guessing. Every comparison here is over 32 bytes.
 *
 * **A missing expectation matches nothing.** No default, no empty-string
 * shortcut, and the caller cannot pass one in by accident — otherwise the one
 * deployment that forgot to set the secret is the one open to everybody, and it
 * would look exactly like a working deployment until somebody probed it.
 */
export async function secretMatches(
  presented: string | null | undefined,
  expected: string | null | undefined,
): Promise<boolean> {
  if (!presented || !expected) return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  return equal(a, b);
}

/**
 * What a render key is stored as: SHA-256 of it, base64url, and never the key.
 *
 * PBKDF2 is right for a password and wrong here. A render key is 32 bytes out of
 * the CSPRNG, so there is no dictionary it is in and no work factor would add
 * anything to it — and this is asked on the capture page and on every object
 * /media serves, so a hundred thousand iterations per photograph on a page would
 * be the cost of defending against a guess nobody can make. It is also why
 * minting stays in scripts/render-key.mjs, which imports this: a key a person
 * chose is exactly the input the reasoning above does not hold for.
 */
export async function secretDigest(value: string): Promise<string> {
  return toBase64Url(await sha256(value));
}

/**
 * Whether two digests are the same, without returning early.
 *
 * Both sides are digests already, so this leaks neither a length nor a prefix of
 * anything secret. What it keeps is the property `secretMatches` has: a
 * presented key is compared against every stored digest in turn, and the time
 * that takes must not depend on how much of one happened to be right. Anything
 * that will not decode is a no rather than a throw, because a row that cannot be
 * read is a row that grants nothing.
 */
export function digestsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  try {
    return equal(fromBase64Url(a), fromBase64Url(b));
  } catch {
    return false;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ------------------------------------------------------------------ tokens

/**
 * An invite token. 32 bytes of randomness, which is the entire security of a
 * fighter's questionnaire, so it is generated from the CSPRNG and never from
 * anything derived from the fighter — a token built from a name and an event
 * would be guessable by anybody holding the printed card.
 */
export function newToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * The digest of a token, for storing in place of the token.
 *
 * A password reset link is a bearer credential that lives in the database until
 * it is spent, so what is kept is the digest: a copy of the table is then a list
 * of things nobody can present. No salt and no iterations, deliberately — this
 * is 32 bytes from the CSPRNG rather than a password, so there is nothing to
 * guess and stretching it would only make the lookup slower.
 */
export async function digestToken(token: string): Promise<string> {
  return toBase64Url(await sha256(token));
}

/** Ids are opaque and only ever compared, so the same generator serves. */
export function newId(prefix: string): string {
  return `${prefix}_${toBase64Url(crypto.getRandomValues(new Uint8Array(12)))}`;
}

// ---------------------------------------------------------------- password

/**
 * `iterations:salt:hash`, all base64url. Stored rather than the password, so a
 * copy of the database is not a copy of the promoter's login.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}:${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterations, salt, hash] = stored.split(":");
  if (!iterations || !salt || !hash) return false;
  const candidate = await derive(password, fromBase64Url(salt), Number(iterations));
  return equal(candidate, fromBase64Url(hash));
}

// ---------------------------------------------------------------- sessions

export type Session = {
  promoterId: string;
  /**
   * The promoter row's `session_version` when this cookie was issued. Checked
   * against the row on every request, so bumping the column is a revocation:
   * every cookie already out there is a generation behind and stops working.
   *
   * Inside the signature like the expiry, so the holder cannot edit their way
   * back in. A cookie from before this field existed has no version at all and
   * `readSession` treats it as unreadable, which signs the one promoter out once
   * and is the cheapest correct answer.
   */
  version: number;
  /** Unix seconds. Inside the signature, so the holder cannot extend it. */
  expiresAt: number;
};

/**
 * Whether a cookie belongs to the generation the account still accepts.
 *
 * Equality rather than "not behind", because a version ahead of the row cannot
 * be honestly obtained and there is nothing to gain by accepting one.
 */
export function sessionIsCurrent(session: Session, sessionVersion: number): boolean {
  return session.version === sessionVersion;
}

export async function signSession(session: Session, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Returns null for anything that is not a currently valid session, without
 * distinguishing between a forged signature and an expired one. The caller has
 * nothing useful to do with the difference and saying which is which tells an
 * attacker whether they have the secret right.
 */
export async function readSession(
  cookie: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<Session | null> {
  if (!cookie) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;

  let expected: Uint8Array;
  try {
    const key = await hmacKey(secret);
    expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
    if (!equal(expected, fromBase64Url(signature))) return null;
  } catch {
    return null;
  }

  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (typeof session.promoterId !== "string" || typeof session.expiresAt !== "number") return null;
    if (typeof session.version !== "number") return null;
    if (session.expiresAt * 1000 <= now) return null;
    return session;
  } catch {
    return null;
  }
}
