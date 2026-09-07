import { describe, expect, it } from "vitest";
import { isLinkPreviewBot } from "@/lib/bots";

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
