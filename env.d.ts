import type { D1Database, RateLimit, R2Bucket } from "@cloudflare/workers-types";

/**
 * The bindings, declared by hand.
 *
 * `wrangler types` can generate this, but it emits half a megabyte of runtime
 * declarations alongside it, and those clash with the DOM lib this app already
 * needs for its client components. Seven lines maintained by hand is a better
 * trade than a generated file nobody reads, and it fails the typecheck the
 * moment wrangler.jsonc and the code disagree about what exists.
 *
 * Keep in step with wrangler.jsonc.
 */
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    MEDIA: R2Bucket;
    /** Bounds the open record importer. See lib/rate-limit.ts. */
    IMPORT_LOOKUPS: RateLimit;
    /** Signs the promoter's login cookie. Set with `wrangler secret put`. */
    SESSION_SECRET: string;
  }
}

export {};
