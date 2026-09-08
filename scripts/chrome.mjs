/**
 * Where Chrome is, on whatever machine this is.
 *
 * Four scripts drive a browser — the renderer, the end-to-end walk, the gallery
 * screenshots and the sales recording — and three of them used to carry their
 * own answer. Two of those answers were the single hardcoded path
 * "/usr/local/bin/google-chrome", so every machine that was not one particular
 * Linux box needed CHROME_PATH exported before anything would run, and nothing
 * said so: puppeteer failed to launch and the message was about a spawn rather
 * than about a browser being somewhere else. The renderer's version of this is
 * the one that had already been fixed, so it is the one that moved here.
 *
 * The list per platform is candidates, not a preference between browsers: any
 * of them drives the same protocol. CHROME_PATH wins over all of it, because a
 * machine with two browsers on it gets to choose which one.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export function chromeCandidates(platform = process.platform, env = process.env) {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  if (platform === "win32") {
    return [
      env["PROGRAMFILES"] ?? "C:\\Program Files",
      env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
      env["LOCALAPPDATA"] ?? "",
    ]
      .filter(Boolean)
      .flatMap((root) => [
        path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ]);
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
}

/** CHROME_PATH first, because a machine with two browsers on it gets to choose. */
export function resolveChrome(env = process.env, exists = existsSync) {
  if (env.CHROME_PATH) return { path: env.CHROME_PATH, fromEnv: true };
  const found = chromeCandidates(process.platform, env).find((candidate) => exists(candidate));
  return { path: found ?? null, fromEnv: false };
}

/**
 * The path, or a refusal that says what to set and where it looked. `why` is
 * the caller's own first line, since "no Chrome" means something different to
 * the renderer than it does to the screenshots.
 */
export function chromeOrThrow(why) {
  const chrome = resolveChrome();
  if (!chrome.path || !existsSync(chrome.path)) {
    throw new Error(
      chrome.fromEnv
        ? `CHROME_PATH is set to "${chrome.path}" and there is nothing there.`
        : `${why}\n` +
          "  Set CHROME_PATH to the browser to use. Looked in:\n" +
          chromeCandidates()
            .map((candidate) => `    ${candidate}`)
            .join("\n"),
    );
  }
  return chrome.path;
}
