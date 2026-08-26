import { getMedia } from "@/lib/db";

/**
 * Serves an object out of the media bucket.
 *
 * Fighter photographs go to R2 rather than into public/, because a fighter
 * uploading a photo cannot trigger a rebuild and a promoter should not have to
 * wait for one. The route sits at /media rather than /api/media so the URLs that
 * end up stored on a fighter row read like paths to a file, which is what they
 * are.
 *
 * A missing object is a 404 rather than an error: a fighter can delete their
 * photo, and pages that reference one already cope with it being absent.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key } = await context.params;
  const media = await getMedia();

  const object = await media.get(key.join("/"));
  if (!object) return new Response("Not found", { status: 404 });

  // Built by hand rather than with writeHttpMetadata, whose Headers type comes
  // from the Workers runtime and does not line up with the DOM one this app also
  // needs. Only the content type is worth carrying across anyway.
  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("etag", object.httpEtag);
  // Photos are written under a key that changes when the photo does, so this can
  // be cached hard. That matters on a phone in a hall with poor signal.
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body as unknown as ReadableStream, { headers });
}
