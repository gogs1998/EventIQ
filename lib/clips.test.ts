import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIPS, demoRenderPath } from "@/lib/clips";

const PUBLIC = path.join(import.meta.dirname, "..", "public");

describe("CLIPS", () => {
  /**
   * The route serves these lengths without reading the file to find out. A
   * length that is not the file's is a video that stops early or a response
   * the browser throws away, so every entry is held to the file on disk.
   */
  it("knows the true length of every file it serves", () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      expect(statSync(path.join(PUBLIC, clip.path)).size, name).toBe(clip.size);
    }
  });

  it("serves every demo render the seed points a row at", () => {
    for (const bout of [11, 12, 13, 14, 15]) {
      const name = demoRenderPath(bout).replace("/clips/", "");
      expect(CLIPS[name], name).toBeDefined();
    }
  });
});
