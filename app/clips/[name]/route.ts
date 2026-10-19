import { getCloudflareContext } from "@opennextjs/cloudflare";
import { CLIPS } from "@/lib/clips";
import { parseRange, rangeHeaders, type ByteRange } from "@/lib/range";

/**
 * The site's own videos, with byte ranges.
 *
 * They live in public/ like any other file, but the Workers assets binding
 * answers `Range` with the whole file and a 200, and an iPhone will not play a
 * video from a server that does that (bug 47). So the pages point here, and this
 * reads the same file out of the assets binding and cuts the slice itself.
 *
 * **It never holds a file in memory.** The binding streams without a length,
 * and this used to read the whole file to find one — twenty megabytes for the
 * sales demo, on every request, in a Worker with 128 MB of memory. The lengths
 * are in lib/clips.ts, held to the files by a test, so the slice is cut from the
 * stream as it passes and the response states a Content-Length either way.
 *
 * Only the names in lib/clips.ts are served.
 */

type Fetcher = { fetch: (input: Request | URL | string) => Promise<Response> };

export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const clip = Object.hasOwn(CLIPS, name) ? CLIPS[name] : undefined;
  if (!clip) return new Response("Not found", { status: 404 });

  const range = parseRange(request.headers.get("range"), clip.size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${clip.size}` } });
  }

  const source = await fetchAsset(new URL(clip.path, request.url));
  if (!source.ok || !source.body) {
    source.body?.cancel().catch(() => {});
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "content-type": "video/mp4",
    "cache-control": "public, max-age=3600",
    "x-content-type-options": "nosniff",
    ...rangeHeaders(range, clip.size),
  });
  const etag = source.headers.get("etag");
  if (etag) headers.set("etag", etag);

  const body = range ? slice(source.body, range) : source.body;
  // The length is in the headers; worker.mjs holds the body to it on Workers.
  return new Response(body, {
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
