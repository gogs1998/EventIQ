/**
 * Finds objects in the media bucket that no row points at.
 *
 *   npm run r2:orphans                        # local bucket, dry run
 *   npm run r2:orphans -- --apply             # local, delete them
 *   npm run r2:orphans -- --remote            # the deployed bucket, dry run
 *   npm run r2:orphans -- --remote --apply
 *
 * Every object under the five prefixes this app writes is reachable through
 * exactly one column, and `/media` refuses one that is not — an object nothing
 * points at is already invisible (lib/visibility.ts). So this does not fix a
 * leak; it stops the bucket accumulating things nobody can see and nobody is
 * ever going to find. A fighter who tries three photographs, a cutout the
 * renderer superseded, a stylised portrait nobody approved: all of them are
 * bytes being paid for for ever.
 *
 * **What counts as referenced**, and it is the whole of the safety here:
 *
 * - `fighters.photo`, `fighters.cutout`, `fighters.stylised` — stored as
 *   `/media/<key>`, so the key comes back through `mediaKeyOf`, the same rule
 *   /media parses one with.
 * - `sponsors.mark_key` — an emblem, stored as the bare key.
 * - `render_jobs.current_r2_key` — **the video a published programme is
 *   playing.** Never deleted, whatever else is true of it: a render is the one
 *   object here that a spectator is reading at the moment somebody runs a
 *   tidy-up, and a bout that loses its video loses it in public.
 *
 * **Nothing recent is taken.** An object is written a moment before the row that
 * points at it — `uploadPhoto` puts it and then writes the path — and a stylised
 * portrait sits in the bucket unreferenced *on purpose* while the fighter
 * decides whether to approve it. So anything uploaded inside `MIN_AGE_HOURS` is
 * left alone, which turns both of those races into a wait.
 *
 * **Dry run by default.** It lists what it would take and deletes nothing until
 * `--apply`, the same default scripts/retention.mjs has and for the same reason.
 *
 * **Listing objects is the awkward part.** Wrangler has no command for it, so
 * each side is done the way that side can be:
 *
 * - `--local` reads Miniflare's own object index out of `.wrangler/state`. That
 *   is somebody else's internal file and it can change under us; it is read-only
 *   and it fails loudly rather than guessing.
 * - `--remote` lists over R2's S3 API, which is how R2 objects are listed, and
 *   wants an R2 API token: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
 *   `CLOUDFLARE_ACCOUNT_ID`. The delete still goes through wrangler, so the
 *   token only ever needs to read.
 *
 * Do not run this against `--local` while `npm run dev` is up: reading D1 through
 * wrangler is a second connection to the same Miniflare database.
 */
import { createHash, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { mediaKeyOf } from "@/lib/portrait";
import { localBin } from "./local-bin.mjs";

const DATABASE = "eventiq";
const BUCKET = "eventiq-media";

/** Where Miniflare keeps the local bucket's object index. */
const LOCAL_R2_STATE = path.join(".wrangler", "state", "v3", "r2", "miniflare-R2BucketObject");

/**
 * The prefixes this app writes, and the only ones it will ever delete under.
 * An object outside them was put there by somebody for a reason nothing here
 * knows — a backup, an export, something a person uploaded by hand — and a
 * sweep that took it would be the accident this script is meant to prevent.
 */
export const MANAGED_PREFIXES = ["fighters/", "cutouts/", "portraits/", "sponsors/", "renders/"];

/**
 * How long an object is left alone whatever the rows say.
 *
 * A day, because two ordinary things put an object in the bucket before anything
 * points at it: the moment between `uploadPhoto` storing bytes and writing the
 * path, and a stylised portrait waiting for the fighter to press approve. Both
 * are minutes; a day is a wide margin around a script that deletes.
 */
export const MIN_AGE_HOURS = 24;

// --------------------------------------------------------------- pure parts

/** Every object key the database is pointing at, from the five columns that can. */
export function referencedKeys(rows) {
  const keys = new Set();
  for (const row of rows) {
    // Three columns hold a /media/... path, two hold the bare key. mediaKeyOf
    // answers null for anything that is not ours — a committed asset under
    // public/, an absolute URL — which is exactly the right answer: those are
    // not objects in this bucket and cannot be orphans in it.
    for (const value of [row.photo, row.cutout, row.stylised]) {
      const key = mediaKeyOf(value);
      if (key) keys.add(key);
    }
    for (const value of [row.mark_key, row.current_r2_key]) {
      if (typeof value === "string" && value && !value.startsWith("/")) keys.add(value);
      // A render key beginning with a slash is a committed asset from before
      // there was a bucket, so there is no object to keep or take.
    }
  }
  return keys;
}

export function underManagedPrefix(key) {
  return MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * The objects that may be deleted: under one of our prefixes, pointed at by
 * nothing, and old enough that nothing is in the middle of pointing at it.
 */
export function orphansOf(objects, referenced, now, minAgeHours = MIN_AGE_HOURS) {
  const floor = now - minAgeHours * 3_600_000;
  return objects
    .filter((object) => underManagedPrefix(object.key))
    .filter((object) => !referenced.has(object.key))
    .filter((object) => object.uploaded < floor)
    .sort((a, b) => a.key.localeCompare(b.key));
}

// --------------------------------------------------------------- plumbing

function run(command, args) {
  // "npx" is a batch file on Windows and cannot be spawned directly; see local-bin.mjs.
  if (command === "npx") [command, args] = localBin(args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`wrangler exited ${code}: ${(err + out).trim() || "no output"}`)),
    );
  });
}

function d1Query(sql, scope) {
  return run("npx", ["wrangler", "d1", "execute", DATABASE, scope, "--json", "--command", sql]).then(
    (raw) => JSON.parse(raw)[0]?.results ?? [],
  );
}

/**
 * Everything the five columns hold, in one statement.
 *
 * A UNION ALL of five selects rather than five round trips, and every branch
 * names the same four columns so the rows come back one shape.
 */
const REFERENCES_SQL = `
  SELECT photo, NULL AS cutout, NULL AS stylised, NULL AS mark_key, NULL AS current_r2_key
    FROM fighters WHERE photo IS NOT NULL
   UNION ALL
  SELECT NULL, cutout, NULL, NULL, NULL FROM fighters WHERE cutout IS NOT NULL
   UNION ALL
  SELECT NULL, NULL, stylised, NULL, NULL FROM fighters WHERE stylised IS NOT NULL
   UNION ALL
  SELECT NULL, NULL, NULL, mark_key, NULL FROM sponsors WHERE mark_key IS NOT NULL
   UNION ALL
  SELECT NULL, NULL, NULL, NULL, current_r2_key
    FROM render_jobs WHERE current_r2_key IS NOT NULL`;

/**
 * The local bucket's contents, out of Miniflare's own index.
 *
 * Its sqlite file is named by a hash rather than by the bucket, so the file is
 * found by the table it holds instead. More than one match means more than one
 * bucket in this state directory and no way to tell which is ours, and guessing
 * at that would be guessing about what to delete.
 */
function listLocal() {
  let files = [];
  try {
    files = readdirSync(LOCAL_R2_STATE).filter((name) => name.endsWith(".sqlite"));
  } catch {
    throw new Error(`no local bucket state at ${LOCAL_R2_STATE} — has anything been uploaded?`);
  }

  const buckets = [];
  for (const file of files) {
    const db = new DatabaseSync(path.join(LOCAL_R2_STATE, file), { readOnly: true });
    const holdsObjects = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_mf_objects'")
      .get();
    if (holdsObjects) buckets.push(db);
    else db.close();
  }

  if (buckets.length !== 1) {
    for (const db of buckets) db.close();
    throw new Error(
      `expected one bucket in ${LOCAL_R2_STATE}, found ${buckets.length}. ` +
        `Miniflare's layout has moved or there is a second bucket; list it by hand.`,
    );
  }

  const rows = buckets[0].prepare("SELECT key, uploaded FROM _mf_objects").all();
  buckets[0].close();
  return rows.map((row) => ({ key: row.key, uploaded: Number(row.uploaded) }));
}

// ------------------------------------------------- the remote bucket, over S3

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();

/**
 * An AWS SigV4 signature for a GET with no body.
 *
 * R2 speaks S3 for object listing and wrangler has no command for it, so this is
 * the smallest correct way to ask. Nothing else here signs anything: the delete
 * goes through wrangler, so the credential this needs only has to read.
 */
function signedHeaders({ accountId, accessKey, secretKey, query, now }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = stamp.slice(0, 8);
  const payload = sha256("");

  const canonical = [
    "GET",
    `/${BUCKET}`,
    query,
    `host:${host}\nx-amz-content-sha256:${payload}\nx-amz-date:${stamp}\n`,
    "host;x-amz-content-sha256;x-amz-date",
    payload,
  ].join("\n");

  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n");

  let signing = hmac(`AWS4${secretKey}`, date);
  for (const part of ["auto", "s3", "aws4_request"]) signing = hmac(signing, part);
  const signature = createHmac("sha256", signing).update(toSign).digest("hex");

  return {
    host,
    headers: {
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
        `SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
      "x-amz-content-sha256": payload,
      "x-amz-date": stamp,
    },
  };
}

/** Keys and upload times out of a ListObjectsV2 response. */
export function parseListing(xml) {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => ({
    key: match[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? "",
    uploaded: Date.parse(match[1].match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? ""),
  }));
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml);
  const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null;
  return { objects, next: truncated ? next : null };
}

async function listRemote() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const missing = [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKey],
    ["R2_SECRET_ACCESS_KEY", secretKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} not set. Listing a remote bucket needs an R2 API token — ` +
        `read is enough, the delete goes through wrangler. See DEPLOY.md.`,
    );
  }

  const objects = [];
  let token = null;
  do {
    // Sorted, because SigV4 signs the canonical query rather than the one sent.
    const query = [
      token ? `continuation-token=${encodeURIComponent(token)}` : null,
      "list-type=2",
      "max-keys=1000",
    ]
      .filter(Boolean)
      .sort()
      .join("&");

    const { host, headers } = signedHeaders({
      accountId,
      accessKey,
      secretKey,
      query,
      now: new Date(),
    });
    const response = await fetch(`https://${host}/${BUCKET}?${query}`, { headers });
    const body = await response.text();
    if (!response.ok) throw new Error(`listing ${BUCKET} answered ${response.status}: ${body}`);

    const page = parseListing(body);
    objects.push(...page.objects);
    token = page.next;
  } while (token);

  return objects;
}

// ------------------------------------------------------------------- main

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

async function main() {
  const remote = Boolean(arg("remote"));
  const scope = remote ? "--remote" : "--local";
  const apply = Boolean(arg("apply"));
  // For a bucket somebody has just made a mess in and wants tidy now. The
  // default is the one that cannot race an upload, so this is a decision an
  // operator makes out loud rather than a value anything defaults to.
  const ageArg = arg("min-age-hours");
  const minAge = ageArg !== undefined && ageArg !== true ? Number(ageArg) : MIN_AGE_HOURS;
  if (!Number.isFinite(minAge) || minAge < 0) {
    throw new Error("--min-age-hours wants a number of hours");
  }

  const [rows, objects] = await Promise.all([
    d1Query(REFERENCES_SQL, scope),
    remote ? listRemote() : Promise.resolve(listLocal()),
  ]);

  const referenced = referencedKeys(rows);
  const managed = objects.filter((object) => underManagedPrefix(object.key));
  const orphans = orphansOf(objects, referenced, Date.now(), minAge);

  console.log(
    `${objects.length} objects, ${managed.length} under the prefixes this app writes, ` +
      `${referenced.size} referenced by a row, ${orphans.length} orphaned and ` +
      `over ${minAge}h old`,
  );

  for (const object of orphans) {
    const age = Math.floor((Date.now() - object.uploaded) / 86_400_000);
    console.log(`  ${apply ? "deleting" : "would delete"} ${object.key} (${age}d)`);
  }

  if (!orphans.length) return;

  if (!apply) {
    console.log("\nDry run. Nothing has been deleted. Pass --apply to take these.");
    return;
  }

  let deleted = 0;
  let missed = 0;
  for (const object of orphans) {
    try {
      await run("npx", ["wrangler", "r2", "object", "delete", `${BUCKET}/${object.key}`, scope]);
      deleted += 1;
    } catch (error) {
      missed += 1;
      console.log(`  could not delete ${object.key}: ${error.message.split("\n")[0]}`);
    }
  }

  console.log(`\n${deleted} deleted${missed ? `, ${missed} left in the bucket` : ""}`);
}

// Only when run directly, so the pure parts above can be imported by a test.
// Through pathToFileURL because a Windows path is not a file URL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
