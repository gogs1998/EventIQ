/**
 * A video response whose body is held to the Content-Length it states.
 *
 * A Response whose body is an ordinary ReadableStream goes out chunked on
 * Workers, whatever Content-Length its headers say: the runtime does not send a
 * length it cannot check against the bytes. Safari probing an mp4 with
 * `Range: bytes=0-1` wants a 206 that says how long it is (bug 47).
 * `FixedLengthStream` is the Workers way to promise one — the runtime sends the
 * header from it and errors the response if the promise is broken.
 *
 * It is applied in worker.mjs, after OpenNext has finished with the response,
 * rather than in the routes: OpenNext copies a route's body into a stream of
 * its own, so a FixedLengthStream returned from a route handler is lost on the
 * way out. The routes state the length; this keeps the promise.
 *
 * The routes state it twice. Since Next.js 16.4 a route handler's
 * Content-Length is deleted before the response leaves Next.js, so it never
 * reaches worker.mjs (bug 55); STATED_LENGTH carries the same number past that,
 * and is taken off again here so it never goes out.
 *
 * Only a 200 or a 206 with a stated length is touched, and only where the
 * runtime has FixedLengthStream. Under Node the response is returned as it is.
 */
type FixedLengthStreamConstructor = new (length: number) => TransformStream<Uint8Array, Uint8Array>;

/** The length a video route states, in a header Next.js leaves alone. */
export const STATED_LENGTH = "x-eventiq-length";

export function withStatedLength(response: Response): Response {
  const Fixed = (globalThis as { FixedLengthStream?: FixedLengthStreamConstructor })
    .FixedLengthStream;
  const stated = Number(
    response.headers.get("content-length") ?? response.headers.get(STATED_LENGTH),
  );
  if (
    !Fixed ||
    !response.body ||
    (response.status !== 200 && response.status !== 206) ||
    !Number.isSafeInteger(stated) ||
    stated <= 0
  ) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete(STATED_LENGTH);
  return new Response(response.body.pipeThrough(new Fixed(stated)), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** The two routes that serve video, and the only ones withStatedLength is for. */
export const VIDEO_ROUTES = /^\/(clips|media)\//;
