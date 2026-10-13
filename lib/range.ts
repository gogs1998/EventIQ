/**
 * Byte ranges for the routes that serve video.
 *
 * Safari on an iPhone will not play an mp4 from a server that answers a
 * `Range: bytes=0-1` probe with the whole file and a 200: it asks for two bytes,
 * gets twenty megabytes, and shows a struck-through play button. Neither R2
 * through a route nor the Workers assets binding does ranges by itself, so every
 * video on the site was dead on the phone a spectator holds (bug 47).
 *
 * Only a single range is honoured. A multi-range request is answered with the
 * whole object, which RFC 9110 permits and no media player sends.
 */

/** What to read: `offset` and `length` of the object, both in bytes. */
export type ByteRange = { offset: number; length: number };

/**
 * The range a header asks for, given the object's size.
 *
 * `null` means serve the whole thing (no header, or one we do not honour);
 * `"unsatisfiable"` means answer 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (first === "" && last === "") return null;

  if (first === "") {
    // bytes=-500 is the last 500 bytes.
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const start = Number(first);
  if (start >= size) return "unsatisfiable";
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (end < start) return "unsatisfiable";
  return { offset: start, length: end - start + 1 };
}

/** The headers a ranged answer carries on top of the route's own. */
export function rangeHeaders(range: ByteRange | null, size: number): Record<string, string> {
  if (!range) return { "accept-ranges": "bytes", "content-length": String(size) };
  return {
    "accept-ranges": "bytes",
    "content-length": String(range.length),
    "content-range": `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
  };
}
