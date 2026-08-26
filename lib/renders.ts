/**
 * Where a bout's rendered video lives.
 *
 * Rendering happens outside Workers — see scripts/render-tape.mjs and section 4
 * of the handover — so nothing here produces a video. It only reports what the
 * renderer has already finished, which is what the render_jobs table records.
 *
 * The previous version asked the filesystem whether a file existed. That worked
 * while this was a static export and cannot work on Workers, where there is no
 * filesystem to ask.
 */

/**
 * Renders made before there was a bucket are committed under public/ and are
 * still served as static assets, so a key beginning with a slash is a path and
 * anything else is an object in the media bucket.
 */
export function renderUrl(key: string): string {
  return key.startsWith("/") ? key : `/media/${key}`;
}

export type Renders = Record<number, string>;

export function mp4For(renders: Renders, boutNumber: number): string | undefined {
  return renders[boutNumber];
}
