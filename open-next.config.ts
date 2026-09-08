import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incremental cache override is configured.
 *
 * The R2 incremental cache is the usual choice, but every page here is either
 * per-request (the promoter dashboard, a questionnaire behind a token) or cheap
 * enough that a cache would mostly serve to make a fighter's edit take a minute
 * to appear on the programme. Worth revisiting when a show is being read by a
 * room of six hundred people at once, which is the only point at which the
 * programme page becomes hot.
 */
export default defineCloudflareConfig();
