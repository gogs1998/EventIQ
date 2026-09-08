import { describe, expect, it } from "vitest";
import { isAutomatedAgent, isLinkPreviewBot } from "@/lib/bots";

/**
 * An invite is pasted into a group chat and unfurled before anybody has read the
 * message. Counting that as the fighter opening their link would put the warmest
 * name on the chase list there by accident, which is bug 9 in different clothes:
 * a signal that is inferred rather than observed.
 */
describe("isLinkPreviewBot", () => {
  it("knows the fetchers that unfurl a link in a chat", () => {
    for (const agent of [
      "WhatsApp/2.24.9.78 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Twitterbot/1.0",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "TelegramBot (like TwitterBot)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "SkypeUriPreview Preview/0.5",
    ]) {
      expect(isLinkPreviewBot(agent), agent).toBe(true);
    }
  });

  it("leaves a fighter on a phone alone", () => {
    for (const agent of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ]) {
      expect(isLinkPreviewBot(agent), agent).toBe(false);
    }
  });

  /**
   * The guess falls towards recording. An unrecognised fetcher leaves a false
   * open, which is what happened before any of this; refusing everything
   * unfamiliar would quietly lose real ones, and nobody would know.
   */
  it("treats an agent it cannot read as a person", () => {
    expect(isLinkPreviewBot(null)).toBe(false);
    expect(isLinkPreviewBot(undefined)).toBe(false);
    expect(isLinkPreviewBot("")).toBe(false);
  });
});

/**
 * The same guess, made the other way. A count is evidence a promoter hands a
 * sponsor, so anything that is not a person reading a programme is dropped —
 * including the walkthrough's own browser, which is why this list is separate
 * from the one above rather than added to it.
 */
describe("isAutomatedAgent", () => {
  it("holds everything the unfurler list holds", () => {
    expect(isAutomatedAgent("WhatsApp/2.24.9.78 A")).toBe(true);
    expect(isAutomatedAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
  });

  it("knows the model crawlers, which arrive at a public programme in numbers", () => {
    for (const agent of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
      "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
      "CCBot/2.0 (https://commoncrawl.org/faq/)",
      "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/amazonbot)",
    ]) {
      expect(isAutomatedAgent(agent), agent).toBe(true);
    }
  });

  it("knows a headless browser and a scripted client", () => {
    for (const agent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Chrome-Lighthouse",
      "curl/8.7.1",
      "Wget/1.21.4",
      "python-requests/2.32.3",
      "Go-http-client/2.0",
      "okhttp/4.12.0",
      "PostmanRuntime/7.39.0",
      "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
    ]) {
      expect(isAutomatedAgent(agent), agent).toBe(true);
    }
  });

  it("leaves a spectator on a phone alone", () => {
    for (const agent of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ]) {
      expect(isAutomatedAgent(agent), agent).toBe(false);
    }
  });

  /**
   * Marking an invite as opened and counting a spectator are different
   * decisions, and the walkthrough is where they come apart: it is real Chrome
   * filling a real form, so it opens links and it is not an audience.
   */
  it("parts company with the unfurler list over the walkthrough's browser", () => {
    const headless =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36";
    expect(isLinkPreviewBot(headless)).toBe(false);
    expect(isAutomatedAgent(headless)).toBe(true);
  });
});
