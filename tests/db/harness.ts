import { afterAll, beforeAll, beforeEach } from "vitest";
import { signIn } from "@/lib/session";
import { clearEnv, setEnv } from "./bindings";
import { clearRevalidated } from "./next-cache";
import { emptyTables, setPlatform, startPlatform, type Platform } from "./platform";
import { clearRequest } from "./request";

/**
 * One database for a test file, emptied between tests.
 *
 * Starting the platform is the expensive part — a workerd, once, about a second
 * — and emptying thirteen tables costs about nine milliseconds, so a file's
 * worth of tests share the one database without sharing any rows.
 */
export function testDatabase(): () => Platform {
  let platform: Platform;

  beforeAll(async () => {
    platform = await startPlatform();
    setPlatform(platform);
  }, 60_000);

  afterAll(async () => {
    setPlatform(null);
    await platform.dispose();
  });

  beforeEach(async () => {
    await emptyTables(platform.d1);
    clearRequest();
    clearRevalidated();
    clearEnv();
    // Set on every test rather than once, so a test that clears one of these to
    // check what an unset secret does cannot leave it cleared for the next.
    setEnv("SESSION_SECRET", TEST_SESSION_SECRET);
    setEnv("INVITE_KEY", TEST_INVITE_KEY);
  });

  return () => platform;
}

/** Neither is a real secret and neither has to be; both only have to be stable. */
export const TEST_SESSION_SECRET = "test-session-secret-0123456789abcdef";
export const TEST_INVITE_KEY = "test-invite-key-0123456789abcdef";

/**
 * Signs a promoter in the way the login form does.
 *
 * Through `signIn` rather than by stubbing `currentPromoter`, so what the
 * ownership tests below prove is that the real session code and the real gate
 * agree — the two halves that have to, since the gate is the only thing standing
 * between one promoter and another's draft.
 */
export async function signInAs(promoterId: string, sessionVersion = 0): Promise<void> {
  await signIn(promoterId, sessionVersion);
}
