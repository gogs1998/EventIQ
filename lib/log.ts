/**
 * The one shape every failure is written in.
 *
 * Nothing phoned home before this: a 500 on show night stayed a 500 until
 * somebody signed in and found it, and the PBKDF2 production 500 (HANDOVER bug
 * 16) stayed invisible for exactly that reason. Workers Logs will keep and index
 * whatever `console.error` is handed, so the cheapest useful thing is to hand it
 * the same object every time and let the dashboard filter on the fields.
 *
 * It is one object rather than a formatted string because Workers Logs indexes
 * the top-level keys of a structured log and cannot search inside a sentence.
 * `event` is the one to filter on; `route`, `promoterId` and `eventId` are what
 * turn "something broke" into "this promoter, on this show".
 *
 * Building the payload is separated from writing it so the shape can be tested,
 * and so this file stays importable from a client component — the error
 * boundaries log through it too, where all the browser is given is a digest.
 */

export type LogContext = {
  /** What was being attempted, in the same words the action is called. */
  event: string;
  route?: string;
  promoterId?: string;
  eventId?: string;
  fighterId?: string;
  /**
   * Next.js replaces a server error's message with a digest before it reaches
   * the browser, so this is the only handle the client-side boundary has on the
   * server log it belongs to. Logging it from both ends is what joins them.
   */
  digest?: string;
};

export type ErrorPayload = LogContext & {
  level: "error";
  message: string;
  stack?: string;
  at: string;
};

/** Never throws, whatever it was handed. A logger that fails is worse than none. */
function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) ?? "Unknown error" };
  } catch {
    return { message: "Unknown error" };
  }
}

/** The record that gets written. Pure, so the shape is a thing a test can hold. */
export function errorPayload(context: LogContext, error: unknown): ErrorPayload {
  const { message, stack } = describe(error);
  return {
    level: "error",
    ...context,
    message,
    ...(stack ? { stack } : {}),
    at: new Date().toISOString(),
  };
}

/**
 * Writes one failure. Deliberately the only way anything in this codebase
 * reports one, so the next place that needs to look at them has one shape to
 * learn and one field to filter on.
 */
export function logError(context: LogContext, error: unknown): void {
  console.error(errorPayload(context, error));
}
