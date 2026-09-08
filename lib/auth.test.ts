import { describe, expect, it } from "vitest";
import {
  ABSENT_PROMOTER_HASH,
  PASSWORD_MIN_LENGTH,
  RENDER_KEY_HEADER,
  SESSION_COOKIE_NAMES,
  digestToken,
  hashPassword,
  newToken,
  passwordLongEnough,
  readSession,
  secretMatches,
  sessionCookieName,
  sessionIsCurrent,
  signSession,
  verifyPassword,
  type Session,
} from "@/lib/auth";

const SECRET = "test-secret-not-the-real-one";

describe("invite tokens", () => {
  it("is the only thing protecting a fighter's form, so it is long and random", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(tokens.size).toBe(200);
    // 32 bytes base64url, unpadded.
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});

describe("passwords", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(false);
  });

  it("salts, so two promoters with the same password do not look alike", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("treats a malformed stored value as a failure rather than a pass", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  /**
   * These tests run under Node, which derives at any iteration count it is
   * given, and so does the local `wrangler dev`. Only the deployed runtime
   * refuses above 100,000, so a hash minted over the cap passes everything here
   * and throws NotSupportedError on the first real sign-in. Asserting the number
   * is the only way this file can see a ceiling it cannot reach.
   */
  it("stays inside the iteration count the deployed runtime will run", async () => {
    const [minted] = (await hashPassword("anything")).split(":");
    expect(Number(minted)).toBeLessThanOrEqual(100_000);

    // The unknown-promoter path derives against this rather than a stored hash,
    // so it needs the same ceiling or it becomes a 500 of its own.
    const [decoy] = ABSENT_PROMOTER_HASH.split(":");
    expect(Number(decoy)).toBeLessThanOrEqual(100_000);
  });

  it("spends real work on an unknown promoter rather than failing fast", async () => {
    // A decoy that parses is what makes the timing match; one that does not
    // would return early and time the absence of a promoter for the caller.
    expect(await verifyPassword("anything", ABSENT_PROMOTER_HASH)).toBe(false);
    expect(ABSENT_PROMOTER_HASH.split(":")).toHaveLength(3);
  });
});

describe("secretMatches", () => {
  it("accepts the right value and refuses a wrong one", async () => {
    expect(await secretMatches("the-render-key", "the-render-key")).toBe(true);
    expect(await secretMatches("the-render-Key", "the-render-key")).toBe(false);
    expect(await secretMatches("the-render-key-", "the-render-key")).toBe(false);
  });

  /**
   * The one that matters. A deployment that has not had `wrangler secret put`
   * run on it must refuse everybody, not accept anybody — and the caller must
   * not be able to satisfy the check by presenting the same nothing back.
   */
  it("refuses everything when there is no secret to match", async () => {
    expect(await secretMatches("anything", undefined)).toBe(false);
    expect(await secretMatches("anything", null)).toBe(false);
    expect(await secretMatches("anything", "")).toBe(false);
    expect(await secretMatches(undefined, undefined)).toBe(false);
    expect(await secretMatches("", "")).toBe(false);
  });

  it("treats an absent presented value as a refusal", async () => {
    expect(await secretMatches(undefined, "the-render-key")).toBe(false);
    expect(await secretMatches(null, "the-render-key")).toBe(false);
    expect(await secretMatches("", "the-render-key")).toBe(false);
  });

  it("names the header in lower case, because that is how headers arrive", () => {
    expect(RENDER_KEY_HEADER).toBe(RENDER_KEY_HEADER.toLowerCase());
  });
});

describe("sessions", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;

  it("round trips a valid session", async () => {
    const cookie = await signSession({ promoterId: "p_1", version: 0, expiresAt: future }, SECRET);
    expect((await readSession(cookie, SECRET))?.promoterId).toBe("p_1");
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signSession({ promoterId: "p_1", version: 0, expiresAt: future }, "other-secret");
    expect(await readSession(cookie, SECRET)).toBeNull();
  });

  it("rejects a payload edited to name a different promoter", async () => {
    const cookie = await signSession({ promoterId: "p_1", version: 0, expiresAt: future }, SECRET);
    const [, signature] = cookie.split(".");
    const forged = btoa(JSON.stringify({ promoterId: "p_2", version: 0, expiresAt: future }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await readSession(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects an expired session even though the signature is good", async () => {
    const cookie = await signSession({ promoterId: "p_1", version: 0, expiresAt: future }, SECRET);
    expect(await readSession(cookie, SECRET, (future + 1) * 1000)).toBeNull();
  });

  it("treats absence and nonsense as logged out rather than throwing", async () => {
    expect(await readSession(undefined, SECRET)).toBeNull();
    expect(await readSession("", SECRET)).toBeNull();
    expect(await readSession("no-dot", SECRET)).toBeNull();
    expect(await readSession("a.b", SECRET)).toBeNull();
  });
});

/**
 * The whole password policy: length, and nothing else. Composition rules make
 * passwords shorter and more predictable, so the only thing worth asserting is
 * that the floor holds and that nothing above it is turned away for its shape.
 */
describe("the password policy", () => {
  it("asks for twelve characters and no more than that", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordLongEnough("a".repeat(11))).toBe(false);
    expect(passwordLongEnough("a".repeat(12))).toBe(true);
    expect(passwordLongEnough("")).toBe(false);
  });

  it("refuses nothing for its shape", () => {
    // All lower case, no digits, no symbols, and a space in it. Every one of
    // these is a better password than "P@ssw0rd1" and a composition rule would
    // have turned them all down.
    expect(passwordLongEnough("correct horse battery staple")).toBe(true);
    expect(passwordLongEnough("marmaladeonto")).toBe(true);
  });

  /**
   * Counted in code points. A promoter who types twelve emoji has typed twelve
   * characters, whatever UTF-16 makes of it, and being told otherwise is a
   * refusal nobody can act on.
   */
  it("counts what the promoter typed rather than what UTF-16 stored", () => {
    expect("🥊".length).toBe(2);
    expect(passwordLongEnough("🥊".repeat(6))).toBe(false);
    expect(passwordLongEnough("🥊".repeat(12))).toBe(true);
  });
});

describe("token digests", () => {
  it("is stable, so a link can be looked up by it", async () => {
    const token = newToken();
    expect(await digestToken(token)).toBe(await digestToken(token));
  });

  it("is not the token, so a copy of the table is not a set of working links", async () => {
    const token = newToken();
    const digest = await digestToken(token);
    expect(digest).not.toBe(token);
    expect(digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await digestToken(newToken())).not.toBe(digest);
  });
});

/**
 * The revocation. Everything else about the session is stateless, so this one
 * number is what turns "changed my password" into "signed out on the laptop I
 * left at the gym".
 */
describe("the session version", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const session = { promoterId: "p_1", version: 3, expiresAt: future };

  it("accepts a cookie of the generation the account is on", () => {
    expect(sessionIsCurrent(session, 3)).toBe(true);
  });

  it("refuses one issued before the last password change", () => {
    expect(sessionIsCurrent(session, 4)).toBe(false);
    expect(sessionIsCurrent({ ...session, version: 0 }, 1)).toBe(false);
  });

  /** Not obtainable honestly, and there is nothing to gain by accepting it. */
  it("refuses one from a generation the account has never reached", () => {
    expect(sessionIsCurrent(session, 2)).toBe(false);
  });

  it("carries the version inside the signature", async () => {
    const cookie = await signSession(session, SECRET);
    expect((await readSession(cookie, SECRET))?.version).toBe(3);
  });

  /**
   * A cookie minted before this field existed. There is one promoter and the
   * cost is that they sign in again once, which is cheaper than a rule that has
   * to guess what an absent version meant.
   */
  it("treats a cookie with no version at all as unreadable", async () => {
    // Signed properly, so the missing field is the only thing that can refuse it.
    const old = { promoterId: "p_1", expiresAt: future } as unknown as Session;
    const cookie = await signSession(old, SECRET);
    expect(await readSession(cookie, SECRET)).toBeNull();
  });
});

/**
 * `__Host-` is enforced by the browser rather than by us, and only where there
 * is https for `Secure` to mean something.
 */
describe("the session cookie name", () => {
  it("takes the __Host- prefix wherever the cookie is secure", () => {
    expect(sessionCookieName(true)).toBe("__Host-eventiq_session");
  });

  it("drops it in development, where the browser would refuse to store it", () => {
    expect(sessionCookieName(false)).toBe("eventiq_session");
  });

  it("knows both, so signing out clears whichever is there", () => {
    expect([...SESSION_COOKIE_NAMES]).toEqual(["__Host-eventiq_session", "eventiq_session"]);
  });
});
