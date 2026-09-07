import { logError, type LogContext } from "@/lib/log";

/**
 * What a server action answers with.
 *
 * Actions used to throw for everything a caller could reasonably hit — not
 * signed in, not your show, a name with nothing in it, D1 unavailable — and
 * every caller `void`ed the promise. So a promoter pressing "publish" on an
 * expired session saw the button go grey, come back, and nothing change, with
 * the reason sitting in a log nobody was reading.
 *
 * The distinction this draws is between an expected refusal and a fault. A
 * refusal is a sentence for the promoter and never a stack trace; a fault is
 * logged with its stack and shown as a plain apology. Both come back as a value,
 * because a value can be rendered and a throw cannot.
 *
 * `redirect()` still throws, and deliberately: it is control flow rather than a
 * failure, and Next.js needs it to reach the framework. Keep it outside
 * `attempt` — see the note there.
 */

export type ActionFailure = { ok: false; error: string };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

/** The answer where there is nothing to hand back but success. */
export const DONE: ActionResult = { ok: true };

export function done<T extends object>(value: T): ActionResult<T> {
  return { ok: true, ...value };
}

export function refuse(error: string): ActionFailure {
  return { ok: false, error };
}

/**
 * Next.js signals `redirect()` and `notFound()` by throwing, and both are
 * ordinary control flow rather than failures. Catching one and turning it into
 * "that did not save" would break navigation in a way that looks like a bug in
 * the form. The digest prefix is how the framework marks its own.
 */
function isFrameworkControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  );
}

/**
 * Runs an action's body, turning anything unforeseen into a logged fault and a
 * sentence.
 *
 * The message is the same whatever broke, because a promoter can do nothing with
 * "D1_ERROR: database is locked" and a stack trace on a dashboard is alarming
 * out of proportion to the problem. The detail goes to the log, where the
 * context says which promoter and which show it was.
 */
export async function attempt<T extends object>(
  context: LogContext,
  fallback: string,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (isFrameworkControlFlow(error)) throw error;
    logError(context, error);
    return refuse(fallback);
  }
}
