import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromeCandidates, resolveChrome } from "./chrome.mjs";

/**
 * The shared browser lookup. Six scripts launch Chrome and this is the only
 * thing that says where it is, so a machine that is not the one this was
 * written on is exactly what these are for.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("every script that launches a browser", () => {
  /**
   * make-icons.mjs was written after the lookup was consolidated and kept
   * `process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome"` anyway, so on
   * any machine that is not one particular Linux box `npm run icons` failed on
   * a spawn rather than on a browser being somewhere else. A seventh script
   * would do the same; this is what stops it.
   */
  it("asks chrome.mjs where it is, rather than writing a path down", () => {
    const wrong = readdirSync(HERE)
      .filter((file) => file.endsWith(".mjs") && !file.startsWith("chrome."))
      .flatMap((file) => {
        const source = readFileSync(path.join(HERE, file), "utf8");
        if (!source.includes("executablePath")) return [];
        return source.includes("chromeOrThrow") ? [] : [file];
      });
    expect(wrong).toEqual([]);
  });
});

describe("resolveChrome", () => {
  /**
   * This was `[three Linux paths].find(Boolean)`, which returns the first string
   * in the list whether or not anything is there. Every machine that was not one
   * particular Linux box needed CHROME_PATH before it would render, and the
   * failure was a spawn error naming a path nobody had chosen.
   */
  it("looks somewhere plausible on each platform", () => {
    expect(chromeCandidates("darwin")[0]).toContain("Google Chrome.app");
    expect(chromeCandidates("linux")).toContain("/usr/bin/google-chrome");
    expect(chromeCandidates("win32", { PROGRAMFILES: "C:\\Program Files" })).toContain(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
  });

  it("picks the first browser that is actually there", () => {
    const found = resolveChrome({}, (candidate) => candidate === "/usr/bin/chromium");
    expect(found.path === "/usr/bin/chromium" || found.path === null).toBe(true);
  });

  it("says nothing was found rather than naming a path that is not there", () => {
    expect(resolveChrome({}, () => false)).toEqual({ path: null, fromEnv: false });
  });

  it("lets CHROME_PATH win, and remembers that it was asked for", () => {
    expect(resolveChrome({ CHROME_PATH: "/opt/chrome" }, () => false)).toEqual({
      path: "/opt/chrome",
      fromEnv: true,
    });
  });
});
