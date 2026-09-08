/**
 * Where a bout's rendered video lives, and what makes one out of date.
 *
 * Rendering happens outside Workers — see scripts/render-tape.mjs and section 4
 * of the handover — so nothing here produces a video. It only reports what the
 * renderer has already finished, which is what the render_jobs table records.
 *
 * The previous version asked the filesystem whether a file existed. That worked
 * while this was a static export and cannot work on Workers, where there is no
 * filesystem to ask.
 *
 * Everything in this file is pure and imports nothing at runtime, because
 * scripts/render-tape.mjs imports it too — Node strips the types on the way in.
 * That is deliberate: the renderer's `--stale` and the dashboard's "needs
 * rendering again" are the same question, and two implementations of it would
 * eventually give two answers.
 */

/**
 * Renders made before there was a bucket are committed under public/ and are
 * still served as static assets, so a key beginning with a slash is a path and
 * anything else is an object in the media bucket.
 */
export function renderUrl(key: string): string {
  return key.startsWith("/") ? key : `/media/${key}`;
}

export type Renders = Record<number, string>;

export function mp4For(renders: Renders, boutNumber: number): string | undefined {
  return renders[boutNumber];
}

// --------------------------------------------------------------- fingerprint

/**
 * Everything about a bout that ends up on screen.
 *
 * Named columns rather than a timestamp on the show. A promoter who corrects a
 * venue's spelling changes the picture; one who moves the doors time does not,
 * and re-rendering fifteen bouts for it is a quarter of an hour of a laptop's
 * evening. Fighters are still carried by `updatedAt` alongside their photograph
 * and cutout by name, because a cutout appears during the renderer's own run,
 * minutes after the row was last touched.
 *
 * `sponsors` is every sponsor lockup TaleOfTheTape draws: the bout's own in the
 * closing card, and each corner's in their reveal. The show's sponsor strip is
 * deliberately not in it. The composition never reads `showSponsorIds` — the
 * strip belongs to the programme page — so naming it here would make every bout
 * on the card stale the moment a sponsor was added to something that appears in
 * no video.
 */
export const RENDER_INPUT_FIELDS = [
  "eventName",
  "eventDate",
  "eventVenue",
  "eventCity",
  "eventBackdrop",
  "promoterName",
  "promoterMark",
  "number",
  "discipline",
  "weightKg",
  "classLabel",
  "titleLabel",
  "billing",
  "womens",
  "rounds",
  "roundMinutes",
  "redId",
  "redUpdatedAt",
  "redPhoto",
  "redCutout",
  "blueId",
  "blueUpdatedAt",
  "bluePhoto",
  "blueCutout",
  "sponsors",
] as const;

export type RenderInputField = (typeof RENDER_INPUT_FIELDS)[number];

/** Built from a SQL row in the renderer and from Drizzle in the app. */
export type RenderInputs = Partial<Record<RenderInputField, unknown>>;

/**
 * The emblem a sponsor lockup actually draws, or nothing.
 *
 * A mark the promoter uploaded wins over the curated artwork under
 * public/sponsors, because assets-src/ is not in the repository: for any sponsor
 * a promoter added themselves, the upload is the only artwork there is. It lives
 * here rather than in the row mapper because the fingerprint below has to agree
 * with the picture — the tape draws the resolved mark, so hashing the raw columns
 * would leave a bout's video showing the emblem it was made with and nothing
 * saying so.
 */
export function sponsorMark(sponsor: {
  mark?: string | null;
  markKey?: string | null;
}): string | undefined {
  if (sponsor.markKey) return `/media/${sponsor.markKey}`;
  return sponsor.mark ?? undefined;
}

/** One sponsor lockup, flattened to the four things SponsorRow draws. */
export function sponsorFingerprint(sponsor: {
  id: string;
  name: string;
  qualifier?: string | null;
  mark?: string | null;
  markKey?: string | null;
}): string {
  return [sponsor.id, sponsor.name, sponsor.qualifier ?? "", sponsorMark(sponsor) ?? ""].join("|");
}

/**
 * A short digest of everything above.
 *
 * The field list is walked in its declared order rather than the object being
 * stringified as it comes, so two callers that build the same bout in different
 * orders cannot get different answers. A missing or unknown field throws,
 * because the failure this guards against is one side quietly hashing less than
 * the other and every video reading as current forever.
 *
 * WebCrypto rather than node:crypto: this has to run inside a Worker as well.
 */
export async function renderFingerprint(inputs: RenderInputs): Promise<string> {
  const known: readonly string[] = RENDER_INPUT_FIELDS;
  const extra = Object.keys(inputs).filter((key) => !known.includes(key));
  if (extra.length) throw new Error(`render fingerprint given unknown fields: ${extra.join(", ")}`);

  const ordered = RENDER_INPUT_FIELDS.map((field) => {
    if (!(field in inputs)) throw new Error(`render fingerprint is missing "${field}"`);
    return inputs[field] ?? null;
  });

  const bytes = new TextEncoder().encode(JSON.stringify(ordered));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * The object key a finished render is published under.
 *
 * Fingerprinted, for the same reason an uploaded photograph is: /media answers
 * with a year of immutable caching, so a re-render written over the old key
 * would leave every phone that had already played the bout holding last week's
 * video with no way of finding out. A new key is a new URL and cannot be stale.
 */
export function renderKeyFor(slug: string, boutNumber: number, hash: string): string {
  return `renders/${slug}/bout-${boutNumber}-${hash.slice(0, 8)}.mp4`;
}

// ----------------------------------------------------------------- the queue

export type RenderStatus = "queued" | "running" | "done" | "failed";

export type RenderJobState = {
  /** One of RenderStatus. Left as a string because the column is one. */
  status: string;
  attempts: number;
  /** While a runner holds the bout, when its claim lapses. */
  leaseUntil: number | null;
  /** The key the programme plays. It survives a failure of the next render. */
  currentR2Key: string | null;
  /** The fingerprint currentR2Key was made from. */
  currentHash: string | null;
  error: string | null;
};

/**
 * How long a runner holds a bout before another one may take it.
 *
 * A bout is about a minute of capture on a warm laptop and rather more on a cold
 * CI runner, so the lease is long enough that a slow render is never taken off a
 * runner that is still working, and short enough that a runner killed by a
 * timeout does not park the bout until somebody notices.
 */
export const RENDER_LEASE_MS = 15 * 60 * 1000;

/**
 * Attempts before a bout stops being picked up on its own.
 *
 * Two, because the failures worth retrying are the transient ones — a dev server
 * still coming up, a photograph that did not fetch — and a bout that fails twice
 * is failing for a reason a third attempt will not fix. It then sits on the
 * dashboard with what went wrong rather than being retried every hour forever.
 * Asking for it again resets the count, which is what the button is for.
 */
export const MAX_RENDER_ATTEMPTS = 2;

/**
 * Whether a runner may take this bout now.
 *
 * The renderer asks the same question in SQL, as one UPDATE, so two runners
 * asking at the same moment cannot both win. This is the readable half: it is
 * what says why a bout was skipped, and what the tests hold the SQL to.
 *
 * `liveHash` is the bout's fingerprint as it stands, and it is what makes a
 * finished row claimable again. A `done` row whose published fingerprint is not
 * the current one is out of date, and a `--stale` run exists to take exactly
 * those: the queue row is the only thing that says a bout has been rendered at
 * all, so refusing it because it says `done` left every video made before the
 * pipeline existed — five of them, with no `current_hash` — unrenderable by
 * anything but an operator typing a bout number. The lease still comes first,
 * so a row another runner holds is left alone whatever its hash says.
 */
export function claimable(
  job: RenderJobState | null | undefined,
  liveHash: string,
  now: number,
  { force = false }: { force?: boolean } = {},
): boolean {
  // Never rendered, so there is nothing to collide with.
  if (!job) return true;
  // Somebody else is on it and has not run out of time.
  if (job.leaseUntil !== null && job.leaseUntil > now) return false;
  // An operator naming a bout means it, including one that is already current.
  if (force) return true;
  if (job.status === "queued") return true;
  // A lapsed lease on a running job is a runner that died holding it.
  if (job.status === "failed" || job.status === "running") {
    return job.attempts < MAX_RENDER_ATTEMPTS;
  }
  // A finished render of a bout that has since moved on, or one published before
  // there were fingerprints and so carrying none. Both read as "stale" on the
  // dashboard, and both are what an unattended run is for.
  if (job.status === "done") return job.currentHash !== liveHash;
  return false;
}

/** What the dashboard says about one bout. */
export type RenderState = "current" | "stale" | "queued" | "running" | "failed" | "missing";

/**
 * The state of a bout's video, given its job and the bout's fingerprint as it
 * stands now.
 *
 * A job in flight is reported as in flight whatever is published, because that
 * is the thing about to change. Everything else is settled by comparing the
 * published fingerprint against the current one, which is the only question that
 * decides whether the video on the programme is of this bout as it is today.
 */
export function renderState(
  job: RenderJobState | null | undefined,
  liveHash: string,
  now: number = Date.now(),
): RenderState {
  if (!job) return "missing";
  if (job.status === "running") {
    if (job.leaseUntil !== null && job.leaseUntil > now) return "running";
    // The runner died. The bout is queued again in everything but name, and
    // saying "running" about a render that stopped hours ago would be a lie the
    // promoter would sit and wait on.
    return job.attempts < MAX_RENDER_ATTEMPTS ? "queued" : "failed";
  }
  if (job.status === "queued") return "queued";
  if (job.status === "failed") return "failed";
  if (!job.currentR2Key) return "missing";
  return job.currentHash === liveHash ? "current" : "stale";
}
