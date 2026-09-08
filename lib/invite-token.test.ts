import { describe, expect, it } from "vitest";
import { newToken } from "@/lib/auth";
import {
  INVITE_TTL_MS,
  digestToken,
  inviteLive,
  inviteSecretFrom,
  isSentChannel,
  newInviteToken,
  openToken,
  sealToken,
} from "@/lib/invite-token";

const SECRET = "a-secret-of-the-sort-openssl-rand-would-give-you";
const OTHER = "a-different-secret-entirely";

describe("the digest a lookup matches on", () => {
  it("is the same every time, so the address bar finds the row", async () => {
    const token = newToken();
    expect(await digestToken(SECRET, token)).toBe(await digestToken(SECRET, token));
  });

  it("tells two tokens apart", async () => {
    expect(await digestToken(SECRET, newToken())).not.toBe(await digestToken(SECRET, newToken()));
  });

  it("is not the token, and is not reachable without the secret", async () => {
    const token = newToken();
    const digest = await digestToken(SECRET, token);
    expect(digest).not.toContain(token);
    expect(await digestToken(OTHER, token)).not.toBe(digest);
  });
});

describe("the ciphertext the dashboard reads back", () => {
  it("gives the token back", async () => {
    const token = newToken();
    expect(await openToken(SECRET, await sealToken(SECRET, token))).toBe(token);
  });

  it("is different every time, so two identical tokens do not look alike", async () => {
    const token = newToken();
    expect(await sealToken(SECRET, token)).not.toBe(await sealToken(SECRET, token));
  });

  /**
   * The one way a stored link becomes unreadable is a rotated key, and the
   * dashboard has fourteen other rows to draw. Null rather than a throw.
   */
  it("answers null rather than throwing on anything it cannot open", async () => {
    const sealed = await sealToken(SECRET, newToken());
    expect(await openToken(OTHER, sealed)).toBeNull();
    expect(await openToken(SECRET, "not-a-sealed-value")).toBeNull();
    expect(await openToken(SECRET, "v1.$$$")).toBeNull();
    expect(await openToken(SECRET, "")).toBeNull();
  });

  it("does not carry the token in the clear", async () => {
    const token = newToken();
    expect(await sealToken(SECRET, token)).not.toContain(token);
  });
});

describe("a newly issued invite", () => {
  it("stores nothing in the clear and lapses in ninety days", async () => {
    const now = 1_700_000_000_000;
    const { token, columns } = await newInviteToken(now, SECRET);

    expect(columns.token).toBeNull();
    expect(columns.tokenDigest).toBe(await digestToken(SECRET, token));
    expect(await openToken(SECRET, columns.tokenCipher)).toBe(token);
    expect(columns.expiresAt).toBe(now + INVITE_TTL_MS);
    expect(columns.revokedAt).toBeNull();
  });

  it("is not guessable from the fighter or the show", async () => {
    const a = await newInviteToken(0, SECRET);
    const b = await newInviteToken(0, SECRET);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThan(40);
  });
});

describe("inviteSecretFrom", () => {
  it("uses INVITE_KEY wherever there is one", () => {
    expect(inviteSecretFrom({ INVITE_KEY: "k", SESSION_SECRET: "s" }, false)).toBe("k");
    expect(inviteSecretFrom({ INVITE_KEY: "k" }, true)).toBe("k");
  });

  it("borrows the session secret in development, so a fresh checkout runs", () => {
    expect(inviteSecretFrom({ SESSION_SECRET: "s" }, true)).toBe("s");
  });

  /**
   * A default here would be a deployment whose every fighter's link is encrypted
   * under a value that is in this repository, and it would look exactly like a
   * working deployment. Same argument as the render key: absence denies.
   */
  it("refuses to invent one in production", () => {
    expect(() => inviteSecretFrom({ SESSION_SECRET: "s" }, false)).toThrow(/INVITE_KEY/);
    expect(() => inviteSecretFrom({}, true)).toThrow(/INVITE_KEY/);
  });
});

describe("inviteLive", () => {
  const now = 1_700_000_000_000;

  it("is live until its expiry", () => {
    expect(inviteLive({ expiresAt: now + 1 }, now)).toBe(true);
    expect(inviteLive({ expiresAt: now }, now)).toBe(false);
    expect(inviteLive({ expiresAt: now - 1 }, now)).toBe(false);
  });

  it("is dead once it has been revoked, whatever the expiry says", () => {
    expect(inviteLive({ expiresAt: now + INVITE_TTL_MS, revokedAt: now - 1 }, now)).toBe(false);
  });

  /**
   * A row written before the column existed. Reading absence as expiry would
   * have taken every invite on every card down the moment 0007 landed — absence
   * is not evidence here either.
   */
  it("treats a row with no expiry as live rather than as lapsed", () => {
    expect(inviteLive({}, now)).toBe(true);
    expect(inviteLive({ expiresAt: null, revokedAt: null }, now)).toBe(true);
  });
});

describe("isSentChannel", () => {
  it("accepts only what the controls can actually record", () => {
    expect(isSentChannel("whatsapp")).toBe(true);
    expect(isSentChannel("sms")).toBe(true);
    expect(isSentChannel("copied")).toBe(true);
    expect(isSentChannel("carrier pigeon")).toBe(false);
    expect(isSentChannel(undefined)).toBe(false);
    expect(isSentChannel(null)).toBe(false);
  });
});
