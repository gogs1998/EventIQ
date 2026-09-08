import type { Ai, D1Database, RateLimit, R2Bucket } from "@cloudflare/workers-types";

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
     * What the mp4 renderer presents instead of a session, to reach the capture
     * page for a card that is not published yet. Optional in the type because an
     * unset one has to mean deny: the route refuses everybody without a promoter
     * session rather than falling open. See lib/visibility.ts.
     */
    RENDER_KEY?: string;
    /**
     * Workers AI, for the opt-in stylised portrait only. Optional in the type
     * because `next dev` has no such binding: the action answers "not available
     * here" rather than throwing, so a fighter on a local instance is told the
     * plain truth and keeps their photograph. See app/f/[token]/portrait-actions.ts.
     */
    AI?: Ai;
    /**
     * Whether stylised portraits are offered at all. Off unless this says
     * otherwise — see flagOn in lib/consent.ts. A feature that sends a real
     * fighter's photograph to a model is one somebody has to switch on.
     */
    STYLISED_PORTRAITS?: string;
  }
}

export {};
