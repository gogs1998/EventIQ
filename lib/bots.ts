/**
 * The fetchers that are not a person opening a link.
 *
 * A fighter's invite is sent by whatever the promoter has to hand, and the
 * moment it lands in a group chat something unfurls it: WhatsApp, Messenger,
 * Slack, Telegram, a search crawler that found the address somewhere it should
 * not have. Every one of those would otherwise be recorded as the fighter
 * opening their link, which is the warmest signal on the chase list and the one
 * thing on the dashboard that is measured rather than inferred. A promoter
 * ringing a fighter about a form they have never seen is exactly the mistake
 * bug 9 already made in different clothes.
 *
 * Matching on the user agent is a guess, so it is made in the direction that
 * costs least: a recognised fetcher is ignored, and anything else is treated as
 * a person. An unrecognised bot leaves a false open, which is what happens today
 * anyway; refusing everything unfamiliar would lose real ones, and a signal that
 * is quietly incomplete is worse than one that is occasionally generous.
 */

/**
 * Names, not patterns. The last few are the generic tokens crawlers put in their
 * agent on purpose, and no phone browser has any of them.
 */
const FETCHERS = [
  "whatsapp",
  "facebookexternalhit",
  "facebookbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "instagram",
  "slackbot",
  "slack-imgproxy",
  "twitterbot",
  "discordbot",
  "telegrambot",
  "linkedinbot",
  "skypeuripreview",
  "viber",
  "redditbot",
  "pinterest",
  "tumblr",
  "flipboard",
  "vkshare",
  "mastodon",
  "googlebot",
  "google-inspectiontool",
  "googleother",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "applebot",
  "petalbot",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "bytespider",
  "amazonbot",
  // The model crawlers. They read a public programme the way a search crawler
  // does, and on a page with a QR code behind it they are a larger share of what
  // arrives than anything a promoter would recognise as a visitor.
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "perplexitybot",
  "ccbot",
  "embedly",
  "quora link preview",
  "ia_archiver",
  "bot",
  "crawler",
  "spider",
  "preview",
];

/**
 * Automation driving a browser, and the plain HTTP clients.
 *
 * A separate list from the one above because the two are read in opposite
 * directions. An unfurler must never mark a fighter's invite as opened, and that
 * is the whole of what `isLinkPreviewBot` decides. This list is only ever asked
 * about a *count*, where the cost of being wrong is the other way round — so the
 * browser walkthrough, which is real Chrome with `HeadlessChrome` in its agent,
 * belongs here and not there. It writes as it goes, and its taps are not
 * spectators.
 */
const AUTOMATED = [
  "headlesschrome",
  "chrome-lighthouse",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",
  "webdriver",
  "cypress",
  "python-requests",
  "python-urllib",
  "aiohttp",
  "scrapy",
  "curl/",
  "wget",
  "okhttp",
  "go-http-client",
  "java/",
  "axios/",
  "node-fetch",
  "undici",
  "libwww-perl",
  "httpie",
  "postmanruntime",
  "insomnia",
  "apachebench",
  "guzzlehttp",
];

function agentHolds(userAgent: string | null | undefined, names: readonly string[]): boolean {
  if (!userAgent) return false;
  const agent = userAgent.toLowerCase();
  return names.some((name) => agent.includes(name));
}

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  return agentHolds(userAgent, FETCHERS);
}

/**
 * Anything that is not a person reading a programme: the fetchers above, plus a
 * headless browser or a scripted client.
 *
 * Absence still answers false here, because "no user agent at all" is a
 * different judgement from "an agent that says what it is" and it belongs beside
 * the other request signals rather than in a list of names — `countableRequest`
 * in lib/track.ts makes it.
 */
export function isAutomatedAgent(userAgent: string | null | undefined): boolean {
  return isLinkPreviewBot(userAgent) || agentHolds(userAgent, AUTOMATED);
}
