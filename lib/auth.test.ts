import { describe, expect, it } from "vitest";
import {
  ABSENT_PROMOTER_HASH,
  RENDER_KEY_HEADER,
  hashPassword,
  newToken,
  readSession,
  secretMatches,
  signSession,
  verifyPassword,
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
    const cookie = await signSession({ promoterId: "p_1", expiresAt: future }, SECRET);
    expect((await readSession(cookie, SECRET))?.promoterId).toBe("p_1");
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signSession({ promoterId: "p_1", expiresAt: future }, "other-secret");
    expect(await readSession(cookie, SECRET)).toBeNull();
  });

  it("rejects a payload edited to name a different promoter", async () => {
    const cookie = await signSession({ promoterId: "p_1", expiresAt: future }, SECRET);
    const [, signature] = cookie.split(".");
    const forged = btoa(JSON.stringify({ promoterId: "p_2", expiresAt: future }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await readSession(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects an expired session even though the signature is good", async () => {
    const cookie = await signSession({ promoterId: "p_1", expiresAt: future }, SECRET);
    expect(await readSession(cookie, SECRET, (future + 1) * 1000)).toBeNull();
  });

  it("treats absence and nonsense as logged out rather than throwing", async () => {
    expect(await readSession(undefined, SECRET)).toBeNull();
    expect(await readSession("", SECRET)).toBeNull();
    expect(await readSession("no-dot", SECRET)).toBeNull();
    expect(await readSession("a.b", SECRET)).toBeNull();
  });
});
