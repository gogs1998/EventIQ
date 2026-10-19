import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { changePassword } from "@/app/promoter/account/actions";
import { setPasswordFromReset } from "@/app/promoter/reset/[token]/actions";
import { digestToken, hashPassword } from "@/lib/auth";
import { ACCOUNT_COPY, RESET_COPY } from "@/lib/copy";
import { LOCKOUT_ATTEMPTS } from "@/lib/lockout";
import { attemptLogin } from "@/lib/session";
import { plantPromoters } from "./fixtures";
import { signInAs, testDatabase } from "./harness";

/**
 * The lockout against a real database, because the thing that was wrong with it
 * was a race between requests, and only a database can lose one.
 */

const platform = testDatabase();
const PASSWORD = "correct horse battery staple";

async function promoter() {
  const db = platform().db;
  await plantPromoters(db, [{ id: "pr_cage", name: "Cage County" }]);
  await db
    .update(schema.promoters)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(schema.promoters.id, "pr_cage"));
  return db;
}

async function failures() {
  const [row] = await platform()
    .db.select({ failedLogins: schema.promoters.failedLogins })
    .from(schema.promoters)
    .where(eq(schema.promoters.id, "pr_cage"));
  return row.failedLogins;
}

describe("attemptLogin", () => {
  it("lets the right password in and leaves nothing counted against the account", async () => {
    const db = await promoter();
    expect((await attemptLogin(db, "pr_cage", "wrong")).ok).toBe(false);
    expect(await failures()).toBe(1);
    expect((await attemptLogin(db, "pr_cage", PASSWORD)).ok).toBe(true);
    expect(await failures()).toBe(0);
  });

  it("checks no more passwords than the lockout allows, however many arrive at once", async () => {
    const db = await promoter();
    const results = await Promise.all(
      Array.from({ length: LOCKOUT_ATTEMPTS + 6 }, () => attemptLogin(db, "pr_cage", "wrong")),
    );
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(await failures()).toBe(LOCKOUT_ATTEMPTS);
    // Locked: the right password is refused too, until the window closes.
    expect((await attemptLogin(db, "pr_cage", PASSWORD)).ok).toBe(false);
    expect(await failures()).toBe(LOCKOUT_ATTEMPTS);
  });

  it("opens again once the window has closed", async () => {
    const db = await promoter();
    await db
      .update(schema.promoters)
      .set({ failedLogins: LOCKOUT_ATTEMPTS, firstFailedLoginAt: Date.now() - 16 * 60 * 1000 })
      .where(eq(schema.promoters.id, "pr_cage"));
    expect((await attemptLogin(db, "pr_cage", PASSWORD)).ok).toBe(true);
  });
});

describe("changePassword", () => {
  const change = (current: string) => {
    const data = new FormData();
    data.set("current", current);
    data.set("next", "a much longer new password");
    data.set("confirm", "a much longer new password");
    return changePassword(null, data);
  };

  it("counts a wrong current password against the account, like the login form", async () => {
    await promoter();
    await signInAs("pr_cage");
    expect(await change("wrong")).toEqual({
      ok: false,
      error: ACCOUNT_COPY.currentNotRecognised,
    });
    expect(await failures()).toBe(1);
  });

  it("takes no current password at all once the account is locked", async () => {
    const db = await promoter();
    await db
      .update(schema.promoters)
      .set({ failedLogins: LOCKOUT_ATTEMPTS, firstFailedLoginAt: Date.now() })
      .where(eq(schema.promoters.id, "pr_cage"));
    await signInAs("pr_cage");
    expect(await change(PASSWORD)).toEqual({
      ok: false,
      error: ACCOUNT_COPY.currentNotRecognised,
    });
  });

  it("still changes it for the right current password, and clears the count", async () => {
    await promoter();
    await signInAs("pr_cage");
    expect((await change(PASSWORD)).ok).toBe(true);
    expect(await failures()).toBe(0);
  });
});

describe("setPasswordFromReset", () => {
  it("sets one password from a link opened twice at once, not two", async () => {
    const db = await promoter();
    const token = "reset-token-0123456789abcdef0123456789";
    const now = Date.now();
    await db.insert(schema.passwordResets).values({
      id: "rs_1",
      promoterId: "pr_cage",
      tokenDigest: await digestToken(token),
      expiresAt: now + 30 * 60 * 1000,
      createdAt: now,
    });

    const reset = (password: string) => {
      const data = new FormData();
      data.set("token", token);
      data.set("next", password);
      data.set("confirm", password);
      return setPasswordFromReset(null, data);
    };
    const results = await Promise.all([reset("first new password 1"), reset("second new password 2")]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: RESET_COPY.deadBody },
    ]);
  });
});
