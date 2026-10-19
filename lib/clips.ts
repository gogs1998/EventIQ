/**
 * The videos the site serves out of public/, with the length of each.
 *
 * They go through app/clips/[name]/route.ts rather than straight off the assets
 * binding, because the binding answers `Range` with the whole file and a 200,
 * and an iPhone will not play a video from a server that does that (bug 47).
 * The route cuts the slice itself, and it needs the file's length to do that:
 * the binding streams without one, so the route used to read the whole twenty
 * megabytes of the sales demo into memory to find out, on every request, inside
 * a Worker with 128 MB to its name. The lengths are written down here instead,
 * and lib/clips.test.ts holds each one to the file on disk, so a re-cut that
 * forgets to update this fails the suite rather than serving a truncated video.
 *
 * The five demo renders are here as well. They predate the bucket and the seed
 * used to point their rows at `/renders/bout-N.mp4`, which the assets binding
 * served without ranges — so every re-seed put bug 47 back on the five videos
 * the pitch is built on. Migration 0016 moved existing rows onto these names.
 *
 * Only the names below are served. This is not a way to read public/ with
 * ranges; a new entry is a decision.
 */
export const CLIPS: Readonly<Record<string, { path: string; size: number }>> = {
  "hero-faceoff.mp4": { path: "/hero/hero-faceoff.mp4", size: 693181 },
  "eventiq-demo.mp4": { path: "/demo/eventiq-demo.mp4", size: 20497162 },
  "demo-bout-11.mp4": { path: "/renders/bout-11.mp4", size: 1943718 },
  "demo-bout-12.mp4": { path: "/renders/bout-12.mp4", size: 1624215 },
  "demo-bout-13.mp4": { path: "/renders/bout-13.mp4", size: 1600078 },
  "demo-bout-14.mp4": { path: "/renders/bout-14.mp4", size: 1740263 },
  "demo-bout-15.mp4": { path: "/renders/bout-15.mp4", size: 1666069 },
};

/**
 * Where the seed points a demo bout's render row. A path, so lib/renders.ts
 * reads it as a committed asset rather than as a key in the bucket, and so
 * neither the renderer nor the orphan sweep ever tries to delete it.
 */
export function demoRenderPath(boutNumber: number): string {
  return `/clips/demo-bout-${boutNumber}.mp4`;
}
