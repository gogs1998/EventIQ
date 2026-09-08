/**
 * What an uploaded file actually is, as opposed to what it says it is.
 *
 * A fighter's photograph is stored in R2 and served back from our own origin by
 * /media/[...key], under the content type it was stored with. That makes the
 * declared type of an upload a security decision, and a declared type is only a
 * claim by whoever made the request: the questionnaire's re-encode to JPEG in
 * the browser is there to keep the upload small on a phone, not to control what
 * arrives, because a server action can be called directly with anything.
 *
 * image/svg+xml is the case that matters. An SVG is a document that can carry
 * script, so one served from our own origin runs there — a stored cross-site
 * scripting hole reachable by anybody holding an invite link. Sniffing the first
 * few bytes costs nothing and cannot be talked out of.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

/** So the key an object is stored under matches the bytes inside it. */
export const IMAGE_EXTENSION: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function matches(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * The type these bytes really are, or null for anything we will not serve.
 *
 * Three formats, because those are the three every phone camera and every
 * screenshot produces and the three the programme needs to display. Everything
 * else — SVG, HTML wearing a .jpg name, a PDF, a video — is refused rather than
 * stored and handed back later.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  // Start of image, then the first marker. Every JPEG begins this way whatever
  // wrote it, and JFIF or Exif differ only from the fourth byte on.
  if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // RIFF, four bytes of length, then WEBP. The length is skipped rather than
  // checked: it varies per file and is not what identifies the format.
  if (matches(bytes, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  return null;
}

/**
 * Content types the media route will hand back as-is.
 *
 * Photographs plus the rendered mp4s, which go through the same bucket. Anything
 * stored under some other type — including anything written before the bytes
 * were checked — is served as a download rather than as something the browser
 * will try to interpret.
 */
export const SERVABLE_TYPES: readonly string[] = [...IMAGE_TYPES, "video/mp4"];
