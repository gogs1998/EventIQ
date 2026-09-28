import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { brokenImageMessage, sameOrigin } from "./render-show.mjs";
import {
  brokenImageMessage as tapeBrokenImageMessage,
  sameOrigin as tapeSameOrigin,
} from "./render-tape.mjs";

/**
 * The show renderer is a hand-copy of the bout renderer's capture half, and its
 * own header says so: `render-tape.mjs` reads its base, its slug and its
 * environment from `process.argv` at module scope, so importing it to borrow
 * four functions would put one script's command line in charge of the other's
 * state. That reasoning holds and the duplication stays.
 *
 * What does not have to stay is the duplication being unchecked. Only the bout
 * renderer's copies were tested, so the show renderer's same-origin rule — the
 * thing that decides whether a secret that reads any card on the instance goes
 * out with a request — had no test at all. These hold the two copies to each
 * other, so a fix made in one file and not the other fails here rather than in
 * a video somebody watches.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = (file) => readFileSync(path.join(HERE, file), "utf8");

describe("the same-origin rule, in both renderers", () => {
  const base = "https://eventiq.win";

  /**
   * Bug 46: the key was narrowed to the capture page's own document, and the
   * page's own `<img src="/media/...">` is a request to the route that checks
   * it. Origin rather than a prefix match on the base, because eventiq.win is a
   * prefix of eventiq.win.example.com and the same host over http is somewhere
   * a shared secret must not go in the clear.
   */
  const cases = [
    ["https://eventiq.win/render/cage-county-12/15", true],
    ["https://eventiq.win/media/cutouts/a-b.webp", true],
    ["http://eventiq.win/media/cutouts/a-b.webp", false],
    ["https://eventiq.win.example.com/media/a.webp", false],
    ["https://cdn.example.com/marks/sponsor.svg", false],
    ["not a url at all", false],
    ["", false],
  ];

  for (const [url, expected] of cases) {
    it(`answers ${expected} for ${url || "an empty string"}, in both`, () => {
      expect(sameOrigin(url, base)).toBe(expected);
      expect(tapeSameOrigin(url, base)).toBe(expected);
    });
  }
});

describe("what a broken image says, in both renderers", () => {
  /**
   * The wording differs — one says "this video" and the other "this bout" —
   * because they are rendering different things. What has to be the same is
   * that the first broken source is named, because the operator's next move is
   * to curl it, and that it is clear nothing was captured.
   */
  it("names the first source and says nothing was captured", () => {
    for (const message of [
      brokenImageMessage(["/media/cutouts/a.webp", "/media/cutouts/b.webp"]),
      tapeBrokenImageMessage(["/media/cutouts/a.webp", "/media/cutouts/b.webp"]),
    ]) {
      expect(message).toContain("/media/cutouts/a.webp");
      expect(message).toContain("1 other image");
      expect(message).toMatch(/nothing was captured/i);
    }
  });

  it("does not count others where there are none", () => {
    for (const message of [
      brokenImageMessage(["/media/cutouts/a.webp"]),
      tapeBrokenImageMessage(["/media/cutouts/a.webp"]),
    ]) {
      expect(message).not.toMatch(/other image/);
    }
  });
});

/**
 * The encode itself, which is the copy with the longest reach: two videos of
 * the same show that disagree about colour or about faststart are two videos a
 * promoter posts side by side. Read out of the source because the argv is built
 * inside a function that spawns ffmpeg, and comparing the flags is the whole of
 * what matters — the frame rate and the output path are each script's own.
 */
function ffmpegFlags(file) {
  const text = source(file);
  const at = text.indexOf('spawn("ffmpeg", [');
  expect(at, `${file} spawns ffmpeg`).toBeGreaterThan(-1);
  const block = text
    .slice(at, text.indexOf("]);", at))
    // The comments around these flags quote words, and a quoted word in prose
    // is not an argument to ffmpeg.
    .replace(/^\s*\/\/.*$/gm, "");
  return (block.match(/"[^"]*"/g) ?? []).filter((flag) => flag !== '"ffmpeg"');
}

describe("the encode settings, in both renderers", () => {
  it("are the same flags in the same order", () => {
    expect(ffmpegFlags("render-show.mjs")).toEqual(ffmpegFlags("render-tape.mjs"));
  });

  /** The two that were argued for at length and are easiest to drop by accident. */
  it("still tag the colour and still put the index first", () => {
    for (const file of ["render-show.mjs", "render-tape.mjs"]) {
      const flags = ffmpegFlags(file);
      expect(flags).toContain('"-x264-params"');
      expect(flags).toContain('"+faststart"');
    }
  });
});
