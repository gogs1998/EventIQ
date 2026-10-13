import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseRange, rangeHeaders, type ByteRange } from "@/lib/range";

/**
 * The pitch page's own videos, with byte ranges.
 *
 * They live in public/ like any other file, but the Workers assets binding
 * answers `Range` with the whole file and a 200, and an iPhone will not play a
 * video from a server that does that (bug 47). So the page points here, and this
 * reads the same file out of the assets binding and cuts the slice itself.
 *
 * Only the names below are served. This is not a way to read public/ with
 * ranges; it is two files, and a third one is added here on purpose.
 */
const CLIPS: Record<string, string> = {
  "hero-faceoff.mp4": "/hero/hero-faceoff.mp4",
  "eventiq-demo.mp4": "/demo/eventiq-demo.mp4",
};

type Fetcher = { fetch: (input: Request | URL | string) => Promise<Response> };

export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const path = CLIPS[name];
  if (!path) return new Response("Not found", { status: 404 });

  const source = await fetchAsset(new URL(path, request.url));
  if (!source.ok || !source.body) return new Response("Not found", { status: 404 });

  // The binding streams without a length, so there is nothing to cut against
  // until the file has been read. Both files are small enough to hold.
  let body: ReadableStream<Uint8Array> | ArrayBuffer = source.body;
  let size = Number(source.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(size) || size <= 0) {
    body = await source.arrayBuffer();
    size = body.byteLength;
  }
  const whole = body;

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    if (whole instanceof ReadableStream) whole.cancel().catch(() => {});
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }

  const headers = new Headers({
    "content-type": "video/mp4",
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
    ...rangeHeaders(range, size),
  });
  const etag = source.headers.get("etag");
  if (etag) headers.set("etag", etag);

  const sliced =
    whole instanceof ArrayBuffer
      ? range
        ? whole.slice(range.offset, range.offset + range.length)
        : whole
      : range
        ? slice(whole, range)
        : whole;

  return new Response(sliced, {
    status: range ? 206 : 200,
    headers,
  });
}

/** The file from the assets binding, or from the dev server's own public/ under `next dev`. */
async function fetchAsset(url: URL): Promise<Response> {
  let assets: Fetcher | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    assets = (env as unknown as { ASSETS?: Fetcher }).ASSETS;
  } catch {
    assets = undefined;
  }
  return assets ? assets.fetch(url) : fetch(url);
}

/** `range.length` bytes of a stream, starting `range.offset` bytes in. */
function slice(body: ReadableStream<Uint8Array>, range: ByteRange): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let skip = range.offset;
  let remaining = range.length;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (remaining > 0) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = value;
        if (skip > 0) {
          if (chunk.byteLength <= skip) {
            skip -= chunk.byteLength;
            continue;
          }
          chunk = chunk.subarray(skip);
          skip = 0;
        }
        if (chunk.byteLength > remaining) chunk = chunk.subarray(0, remaining);
        remaining -= chunk.byteLength;
        controller.enqueue(chunk);
        return;
      }
      controller.close();
      reader.cancel().catch(() => {});
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
