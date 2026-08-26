# Deploying to eventiq.win

EventIQ is a Next.js application running on **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with **D1** for
data and **R2** for photographs and rendered video. It is no longer a folder of
files, so deploying it means creating two pieces of infrastructure and putting a
secret in place before anything is uploaded.

> **Status: blocked on one token permission.** Everything below has been run
> against local bindings and the Worker bundle has been built and validated with
> `wrangler deploy --dry-run`. The R2 bucket exists. The D1 database does not,
> because the current API token cannot see D1 at all. See
> [what is left to do](#what-is-left-to-do).

---

## 1. Create an API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** →
**Create Custom Token**.

| Permission | Scope | Why |
| --- | --- | --- |
| Account · **Workers Scripts** · Edit | the account owning `eventiq.win` | uploading the Worker and its static assets |
| Account · **D1** · Edit | same account | creating the database, running migrations, seeding |
| Account · **Workers R2 Storage** · Edit | same account | the bucket holding photographs and mp4s |
| Account · **Account Settings** · Read | same account | wrangler resolves the account before doing anything |
| Zone · **Workers Routes** · Edit | **`eventiq.win` only** | attaching the custom domain |
| Zone · **DNS** · Edit | **`eventiq.win` only** | Cloudflare writes the record for the custom domain |

The two zone permissions are only needed for `--attach-domain`. Without them the
site still deploys and is reachable at `eventiq.<subdomain>.workers.dev`.

The old token had **Cloudflare Pages · Edit** and that permission is no longer
used by anything. Pages is a separate product from Workers and this app is not
on it: `@cloudflare/next-on-pages` is deprecated, and a Next.js app with server
actions and a database wants the Workers runtime.

Check what a token can actually do before using it:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...

node scripts/deploy.mjs --check
```

It probes each permission and names the missing ones rather than leaving you to
decode a 401 halfway through an upload.

## 2. Find the account ID

Right-hand column of any domain's **Overview** page in the dashboard, or
`npx wrangler whoami`.

## 3. Provision the database and the bucket

```bash
node scripts/deploy.mjs --provision
```

That creates the `eventiq` D1 database and the `eventiq-media` R2 bucket if they
are not already there, writes the database id into
[wrangler.jsonc](wrangler.jsonc), and applies the migrations in `db/migrations`
to the remote database.

**Commit the wrangler.jsonc change.** The database id has to be in the committed
config for a deploy to bind anything. It is not a secret; it names a database
that only this account's tokens can reach.

By hand, the same thing is:

```bash
npx wrangler d1 create eventiq            # paste the id into wrangler.jsonc
npx wrangler r2 bucket create eventiq-media
npx wrangler d1 migrations apply eventiq --remote
```

## 4. Set the session secret

```bash
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
```

This signs the promoter's login cookie. There is no fallback and no default: a
Worker without it refuses to serve the promoter area rather than accepting
sessions signed with something guessable.

Rotating it signs everybody out, which is the whole of the revocation story and
is deliberate — see section 6 of [HANDOVER.md](HANDOVER.md).

## 5. Seed the first promoter

The database is empty. Seeding it puts the Cage County 12 demo card in, along
with a promoter account you can sign in as:

```bash
SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote
```

It refuses to run remotely without a password rather than falling back to a
development default, because a known password on a reachable promoter account is
the same as no password at all.

It prints the invite links once. They are not recoverable afterwards — they are
generated fresh each time and nothing stores the plaintext anywhere else — but
the promoter dashboard shows every one of them once you are signed in.

Skip this if the first show is going to be created through the UI instead. In
that case you still need a promoter row to sign in as, which today only the seed
creates. Adding a second promoter is a `wrangler d1 execute` away and there is
no self-service signup; with one operator that is the right amount of ceremony.

## 6. Deploy

```bash
npm run deploy
```

[scripts/deploy.mjs](scripts/deploy.mjs) checks the permissions, builds with
`NEXT_PUBLIC_SITE_URL=https://eventiq.win`, and runs `opennextjs-cloudflare
deploy`. The first deploy prints a `*.workers.dev` URL, which is a working link
before DNS is sorted.

Variations:

```bash
npm run deploy -- --check            # permissions only, changes nothing
npm run deploy -- --skip-build       # redeploy the existing .open-next/
npm run deploy -- --attach-domain    # also point eventiq.win at the Worker
```

## 7. Attach eventiq.win

The zone is already in Cloudflare and active, so:

```bash
npm run deploy -- --attach-domain
```

Cloudflare creates the DNS record and issues the certificate itself. Repeat for
`www.eventiq.win` if that should work, then add a redirect rule to the apex so
there is only one address in circulation.

## 8. Check it

```bash
curl -sI https://eventiq.win | head -3
curl -s https://eventiq.win/sitemap.xml | head -5
```

Then, in this order, because these are the things that only break once there is
a real database behind them:

1. `/promoter/login` — sign in. Getting the password wrong says so; getting it
   right lands on the dashboard.
2. The dashboard — the chase list has real invite links. Copy one.
3. Open that link on a phone. Type something. It saves without a save button.
   Reload; it is still there.
4. Upload a photograph. It should appear on the preview card and be served from
   `/media/...`.
5. `/e/cage-county-12` — what the fighter typed is on the card.
6. Back on the dashboard, "This show so far" has counted your visit.
7. `/e/cage-county-12/qr` — scan the code with another phone. The QR is built
   from the origin it is served from, so on the live site it points at the live
   site. **Reprint the table card once the site is live**; one printed from a
   laptop is useless at a venue.

The same walk is automated:

```bash
npm run e2e -- --base https://eventiq.win --password '...'
```

Be careful with that against a live show: it adds a bout, removes it again, and
writes to a fighter's profile.

---

## Video rendering

Rendering is **not** part of the deploy and cannot be. It needs headless Chrome
and ffmpeg, neither of which runs on Workers, so it is a job run from a machine
that has both:

```bash
npm run render -- --slug cage-county-12 --list             # what needs doing
npm run render -- --slug cage-county-12 --stale --publish --remote
```

`--publish` puts the mp4 in R2 and records the key in `render_jobs`, which is
where the programme reads it from. `--stale` renders only the bouts whose
fighters have changed since the last render; a fifteen-bout card is about a
quarter of an hour of compute.

The machine running it needs the same `CLOUDFLARE_API_TOKEN` and a `--base`
pointing at somewhere the card can be rendered from — either the deployed site
or a local dev server against the same data.

## The site URL

`NEXT_PUBLIC_SITE_URL` sets the canonical address at build time and defaults to
`https://eventiq.win` ([lib/site.ts](lib/site.ts)). It feeds `metadataBase`, the
Open Graph tags and the WhatsApp chase messages. It deliberately does **not**
feed the QR code, which reads the origin it is being served from, so the printed
card still works off a laptop screen in a meeting.

## What is left to do

1. **Add `Account · D1 · Edit` to the API token.** This is the only thing
   blocking a live site. Verified against the current token:

   | Endpoint | Result |
   | --- | --- |
   | `accounts/:id/workers/scripts` | 200 |
   | `accounts/:id/r2/buckets` | 200 |
   | `accounts/:id` | 200 |
   | `accounts/:id/d1/database` | **401** |

2. `node scripts/deploy.mjs --provision`, then commit the `wrangler.jsonc`
   change.
3. `npx wrangler secret put SESSION_SECRET`.
4. `SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote`.
5. `npm run deploy` and then `npm run deploy -- --attach-domain`.
6. Reprint the table card from the live URL.

Also worth tidying: an empty R2 bucket named `eventiq-photos` exists in the
account from an earlier attempt. Nothing references it and it can be deleted.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

Rolling back the Worker does not roll back the database. Migrations are additive
and there is no down-migration path, which is a deliberate limit rather than an
oversight at this size: reverting a schema change means writing the SQL to
reverse it.
