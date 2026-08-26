import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Which bouts have a pre-rendered mp4 sitting in public/renders.
 *
 * Server-only: this reads the filesystem while the static export is being
 * built, so pages can offer a download without shipping a broken link.
 */
export function mp4For(boutNumber: number): string | undefined {
  const rel = `/renders/bout-${boutNumber}.mp4`;
  return existsSync(path.join(process.cwd(), "public", rel)) ? rel : undefined;
}
