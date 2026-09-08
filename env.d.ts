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
    /** Bounds guessing at the promoter's password, per caller. */
    LOGIN_ATTEMPTS: RateLimit;
    /** Bounds the counter every spectator's programme posts to. */
    TRACK_WRITES: RateLimit;
    /** Signs the promoter's login cookie. Set with `wrangler secret put`. */
    SESSION_SECRET: string;
    /**
     * The one shared key the mp4 renderer used to present instead of a session,
     * to reach the capture page for a card that is not published yet. Keys are
     * rows in `render_keys` now, one per machine and scoped to a promoter; this
     * is the migration path and is still accepted. Optional in the type because
     * an unset one has to mean deny: the route refuses everybody without a
     * promoter session rather than falling open. See lib/visibility.ts.
     */
    RENDER_KEY?: string;
    /**
     * The one published show the shop window runs on — the pitch page, the
     * sitemap, /f/demo and /qr. Optional because an unset one has to mean no
     * showcase: the pitch page makes its argument without a live card rather
     * than falling back to whatever is published, which on an instance with two
     * promoters on it is somebody else's show. A `var` in wrangler.jsonc rather
     * than a secret, because it names something public.
     */
    SHOWCASE_SLUG?: string;
  }
}

export {};
