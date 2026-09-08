import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sql } from "drizzle-orm";
import { getDb, getMedia } from "@/lib/db";
import { logError } from "@/lib/log";

/**
 * Whether the two things the app cannot work without are answering.
 *
 * There was no way to find out that a binding had gone until somebody signed in
 * and hit it — HANDOVER section 20, and bug 16, which was a production 500 that
 * stayed invisible for a fortnight. An uptime checker calls this every minute,
 * so it is deliberately the cheapest pair of calls that prove anything: a
 * `select 1` that reads no table, and a one-object listing of the bucket.
 *
 * It names which one is down and nothing else. A health endpoint is unauthenticated
 * by definition, so it must not become a way of finding out what is in the
 * database, what the bindings are called, or that a table is missing — the
 * message goes to the log with the rest of the context, and the caller gets a
 * boolean.
 *
 * The one thing it also says is which environment answered, because the suite
 * that walks this product writes as it goes and the only bad way to run it is
 * against the wrong Worker. That is not a fact about the data; it is the label
 * on the tin, and having it readable before a run is worth more than the nothing
 * it gives away.
 */

// Answers about the state of the bindings right now, so it must never be cached
// or prerendered: a health check that can be served from a cache is a health
// check that reports the last time things were fine.
export const dynamic = "force-dynamic";

async function d1Answers(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.run(sql`select 1`);
    return true;
  } catch (error) {
    logError({ event: "health.d1", route: "/api/health" }, error);
    return false;
  }
}

async function r2Answers(): Promise<boolean> {
  try {
    const media = await getMedia();
    await media.list({ limit: 1 });
    return true;
  } catch (error) {
    logError({ event: "health.r2", route: "/api/health" }, error);
    return false;
  }
}

export async function GET(): Promise<Response> {
  // Both, always, and in parallel: a failing D1 must not stop us finding out
  // about R2 as well, which is the difference between one binding and the whole
  // Worker being wrong.
  const [d1, r2] = await Promise.all([d1Answers(), r2Answers()]);
  const ok = d1 && r2;

  // "development" where nothing has bound a var, which is a dev server and is
  // the honest answer rather than a guess at which of the two it resembles.
  const { env } = await getCloudflareContext({ async: true });
  const environment = env.EVENTIQ_ENV ?? "development";

  return new Response(JSON.stringify({ ok, env: environment, d1, r2 }), {
    status: ok ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}
