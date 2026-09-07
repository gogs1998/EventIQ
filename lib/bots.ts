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
  "googlebot",
  "google-inspectiontool",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "applebot",
  "petalbot",
  "ahrefsbot",
  "semrushbot",
  "embedly",
  "quora link preview",
  "ia_archiver",
  "bot",
  "crawler",
  "spider",
  "preview",
];

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const agent = userAgent.toLowerCase();
  return FETCHERS.some((name) => agent.includes(name));
}
