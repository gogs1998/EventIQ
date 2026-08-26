import { getMedia } from "@/lib/db";
import { SERVABLE_TYPES } from "@/lib/image-type";

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
 *
 * The headers below are the second half of the upload check in
 * app/f/[token]/actions.ts and they exist because this is the route that would
 * execute anything that got past it. The stored content type is only handed back
 * when it is one of the handful we serve; anything else, including anything
 * written before the bytes were being checked, is a download rather than
 * something the browser will interpret. Objects here are never documents, so
 * nosniff and a content policy that permits nothing cost nothing and close the
 * gap if one ever is.
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
  const stored = object.httpMetadata?.contentType;
  const servable = stored && SERVABLE_TYPES.includes(stored);

  headers.set("content-type", servable ? stored : "application/octet-stream");
  headers.set(
    "content-disposition",
    `${servable ? "inline" : "attachment"}; filename="${filenameFrom(key)}"`,
  );
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("etag", object.httpEtag);
  // Photos are written under a key that changes when the photo does, so this can
  // be cached hard. That matters on a phone in a hall with poor signal.
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body as unknown as ReadableStream, { headers });
}

/** The last segment of the key, with anything that would break the header out. */
function filenameFrom(key: string[]): string {
  return (key.at(-1) ?? "file").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "file";
}
