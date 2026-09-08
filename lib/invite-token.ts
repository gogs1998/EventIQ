import { newToken } from "@/lib/auth";
import type { SentChannel } from "@/lib/types";

/**
 * What is kept about an invite token, and what is not.
 *
 * The token in a fighter's link is the entire credential for editing their
 * profile, and until now the database held it in the clear. A copy of the
 * database — a backup, an export, a `wrangler d1 execute` in the wrong terminal
 * — was therefore a copy of every fighter's way in.
 *
 * Hashing is the usual answer and it is not available here. The dashboard has to
 * be able to show a promoter the link on demand: that is the chase workflow, and
 * a promoter who cannot re-send a link is a promoter who cannot use the product.
 * So the row keeps two derivations instead, and each does one job:
 *
 * - **a digest**, HMAC-SHA256 of the token, unique and indexed. Every lookup
 *   matches on this, so the value the caller presented is never itself compared
 *   against a stored copy of itself.
 * - **a ciphertext**, AES-GCM of the token. Only the dashboard reads it, and
 *   only to put the link back on screen.
 *
 * Both keys are derived from one secret with HKDF, under different info strings,
 * so the digest key cannot be used to decrypt and neither is the secret itself.
 * PBKDF2 is deliberately not used: it is the wrong tool for a high-entropy input
 * and the deployed runtime caps it anyway (see lib/auth.ts).
 *
 * The secret is `INVITE_KEY`. In development it falls back to a derivation from
 * `SESSION_SECRET` so a fresh checkout runs with the .dev.vars it already has;
 * in production a missing one is fatal, because the alternative is a deployment
 * that silently encrypts every fighter's link under a value anybody could guess
 * and looks exactly like a working one.
 */

const encoder = new TextEncoder();

/** Ninety days. Long enough to cover a card entered months out, short enough to lapse. */
export const INVITE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** The action takes this off a control in the browser, so it is checked, not trusted. */
export function isSentChannel(value: unknown): value is SentChannel {
  return value === "whatsapp" || value === "sms" || value === "copied";
}

/**
 * Same encoding as the session cookie's, and written out again here rather than
 * exported from lib/auth.ts, which another change is in the middle of.
 */
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
 * Which secret the keys come from.
 *
 * The rule, with no environment around it. Reading the bindings is lib/db's job
 * and `inviteSecret()` there is what every caller in a request uses; keeping the
 * two apart is what lets this whole module stay pure, so the seed builder, the
 * chase list and the backfill script can all import it without dragging the
 * Cloudflare adapter in behind them.
 *
 * Development may borrow `SESSION_SECRET`; production may borrow nothing. A
 * default here would be a deployment whose every fighter's link is encrypted
 * under a value that is in this file, and it would look exactly like a working
 * deployment.
 */
export function inviteSecretFrom(
  env: { INVITE_KEY?: string; SESSION_SECRET?: string },
  development: boolean,
): string {
  if (env.INVITE_KEY) return env.INVITE_KEY;
  if (development && env.SESSION_SECRET) return env.SESSION_SECRET;
  throw new Error("INVITE_KEY is not set. See DEPLOY.md.");
}

type InviteKeys = { digest: CryptoKey; cipher: CryptoKey };

/**
 * Derived once per secret per isolate. Every invite lookup needs the digest key,
 * so deriving it per request would put an HKDF on the path of a fighter's page
 * load for nothing — the inputs never change within a deployment.
 */
const derived = new Map<string, Promise<InviteKeys>>();

/**
 * A fixed salt rather than a random one. HKDF's salt is not a secret and there
 * is nowhere per-row to keep one; separating the two keys is the `info` string's
 * job, and it does it.
 */
const SALT = encoder.encode("eventiq.invite.v1");

async function keysFor(secret: string): Promise<InviteKeys> {
  const cached = derived.get(secret);
  if (cached) return cached;

  const pending = (async (): Promise<InviteKeys> => {
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
      "deriveKey",
    ]);
    const from = (info: string) => ({
      name: "HKDF",
      hash: "SHA-256",
      salt: SALT as BufferSource,
      info: encoder.encode(info) as BufferSource,
    });
    const [digest, cipher] = await Promise.all([
      crypto.subtle.deriveKey(from("digest"), material, { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
      ]),
      crypto.subtle.deriveKey(from("cipher"), material, { name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ]),
    ]);
    return { digest, cipher };
  })();

  derived.set(secret, pending);
  return pending;
}

/**
 * The value a lookup matches on. Deterministic, so the token in the address bar
 * finds exactly one row, and one-way, so the column is no use to anybody holding
 * the table without the secret.
 */
export async function digestToken(secret: string, token: string): Promise<string> {
  const { digest } = await keysFor(secret);
  const signature = await crypto.subtle.sign("HMAC", digest, encoder.encode(token));
  return toBase64Url(new Uint8Array(signature));
}

/** The nonce goes in front of the ciphertext; AES-GCM needs a fresh one each time. */
export async function sealToken(secret: string, token: string): Promise<string> {
  const { cipher } = await keysFor(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cipher,
    encoder.encode(token),
  );
  const payload = new Uint8Array(iv.length + sealed.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(sealed), iv.length);
  return `v1.${toBase64Url(payload)}`;
}

/**
 * The token back, or null where it cannot be had — a rotated secret, a value
 * from a shape we no longer write, a truncated column. Null rather than a throw,
 * because the one caller is a dashboard that has fifteen other rows to draw and
 * a promoter is better served by one link missing than by no page.
 */
export async function openToken(secret: string, sealed: string): Promise<string | null> {
  if (!sealed.startsWith("v1.")) return null;
  try {
    const { cipher } = await keysFor(secret);
    const payload = fromBase64Url(sealed.slice(3));
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.slice(0, 12) as BufferSource },
      cipher,
      payload.slice(12) as BufferSource,
    );
    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}

/** What goes on a row for a token, so nowhere has to remember both halves. */
export async function sealedColumns(
  secret: string,
  token: string,
): Promise<{ tokenDigest: string; tokenCipher: string }> {
  const [tokenDigest, tokenCipher] = await Promise.all([
    digestToken(secret, token),
    sealToken(secret, token),
  ]);
  return { tokenDigest, tokenCipher };
}

/**
 * A fresh token and the columns that carry it, including the expiry it starts
 * with. Every place that issues an invite goes through here, so a new one cannot
 * be written in the clear by omission.
 */
export async function newInviteToken(
  now: number,
  secret: string,
): Promise<{
  token: string;
  columns: { token: null; tokenDigest: string; tokenCipher: string; expiresAt: number; revokedAt: null };
}> {
  const token = newToken();
  const sealed = await sealedColumns(secret, token);
  return {
    token,
    columns: { token: null, ...sealed, expiresAt: now + INVITE_TTL_MS, revokedAt: null },
  };
}

/**
 * Whether a link still opens anything. Pure, and the single statement of the
 * rule, so the questionnaire, the media gate and the dashboard cannot disagree
 * about what a dead link is.
 *
 * A row with no expiry is live. That is a row written before the column existed
 * and not yet migrated, and reading absence as expiry would take every invite on
 * the card down the moment the migration landed — absence is not evidence here
 * either.
 */
export function inviteLive(
  invite: { expiresAt?: number | null; revokedAt?: number | null },
  now = Date.now(),
): boolean {
  if (invite.revokedAt) return false;
  return !invite.expiresAt || invite.expiresAt > now;
}
