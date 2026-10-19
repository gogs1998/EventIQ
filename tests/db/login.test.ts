import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { LOCKOUT_ATTEMPTS } from "@/lib/lockout";
import { attemptLogin } from "@/lib/session";
import { plantPromoters } from "./fixtures";
import { testDatabase } from "./harness";

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
