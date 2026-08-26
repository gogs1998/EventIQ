# Deploying to eventiq.win

EventIQ is a Next.js application running on **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with **D1** for
data and **R2** for photographs and rendered video. It is no longer a folder of
files, so deploying it means creating two pieces of infrastructure and putting a
secret in place before anything is uploaded.

> **Status: live at https://eventiq.win.** The D1 permission arrived, so the
> database was created, migrated and seeded, and the Worker is deployed with the
> custom domain attached. Every step below has been run against the real
> account, and the whole product has been walked end to end in production with
> `npm run e2e -- --base https://eventiq.win` (22 checks, all passing).
>
> One thing is still outstanding and it is not something code can fix: **"Always
> Use HTTPS" is off for the zone**, so static files are reachable over plain
> http. See [HTTPS at the edge](#https-at-the-edge). Before changing anything in
> `lib/auth.ts`, read [the PBKDF2 ceiling](#the-pbkdf2-ceiling-and-why-local-tests-cannot-see-it)
> — the runtime enforces a limit that no local test can observe.

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
used by anything: nothing in this repository calls a Pages endpoint, and the
deploy has been run end to end on a token without it. Pages is a separate
product from Workers and this app is not on it — `@cloudflare/next-on-pages` is
deprecated, and a Next.js app with server actions and a database wants the
Workers runtime. **Remove it when the token is next rotated.**

Worth knowing before you narrow anything else: the token in use during this
build could *read* the `eventiq.win` zone and had no zone-level write permission
at all. `zones/<id>/settings`, `/pagerules`, `/rulesets`, `/dns_records` and
`/workers/routes` all answered 403. That is why "Always Use HTTPS" below is a
manual step rather than something a script does.

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

The seeded show is dated a fortnight after the seed runs, snapped to the nearest
Saturday, rather than taking the fixture's date. The dashboard is only worth
looking at when the show is close, and a demo card announcing eighty days to go
argues against the product. It follows that **the demo ages**: seed it and leave
it long enough and it drifts past its own date. Re-seeding is the fix, and it is
the same command that refreshes the invite timestamps beside it. Real events keep
their own dates and the real clock — nothing fakes the clock any more.

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

**Re-seed afterwards, and clear what it left in R2.** The suite finishes with
Chloe Baines submitted and photographed, and the demo card is only persuasive
while it is uneven — she is meant to be the fighter who opened the link, had a
look and did nothing, because that is the one the chase list exists to catch.
`npm run db:seed:remote` puts the rows back but does not touch the bucket, so
the uploaded photograph has to go separately:

```bash
SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote
npx wrangler r2 object delete eventiq-media/fighters/chloe-baines-<hash>.jpg --remote
```

The bout the suite adds and removes leaves its two fighters behind as well.
Removing a bout removes the bout, and the seed only deletes fighters that are on
the card — so `Test Redcorner` and `Test Bluecorner` end up attached to nothing
and survive a re-seed. They are invisible in the app, since everything is derived
from the running order, but they are still rows in a live database:

```bash
npx wrangler d1 execute eventiq --remote --command \
  "DELETE FROM invites WHERE fighter_id IN ('test-redcorner','test-bluecorner');
   DELETE FROM fighter_sponsors WHERE fighter_id IN ('test-redcorner','test-bluecorner');
   DELETE FROM fighters WHERE id IN ('test-redcorner','test-bluecorner');"
```

The check that catches all three is that `fighters` and `invites` should both be
30 with no fighter absent from every bout:

```bash
npx wrangler d1 execute eventiq --remote --command \
  "SELECT (SELECT count(*) FROM fighters) fighters, (SELECT count(*) FROM invites) invites,
          (SELECT count(*) FROM fighters WHERE id NOT IN
             (SELECT red_id FROM bouts UNION SELECT blue_id FROM bouts)) orphans;"
```

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

## The PBKDF2 ceiling, and why local tests cannot see it

**The deployed Workers runtime refuses PBKDF2 above 100,000 iterations.** Ask
for more and `crypto.subtle.deriveBits` throws:

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000).
```

`PBKDF2_ITERATIONS` in [lib/auth.ts](lib/auth.ts) is therefore a ceiling
imposed from outside rather than a number anybody chose. OWASP's floor for
PBKDF2-SHA256 is six times higher and simply cannot be reached here. Do not
raise it back.

What makes this worth a section of its own is that **nothing you can run
locally will tell you.** Measured, not assumed:

| Where | 100,000 | 100,001 | 600,000 |
| --- | --- | --- | --- |
| Node — `vitest`, `next dev` | fine | fine | fine |
| `npx wrangler dev` (local workerd) | fine | fine | fine |
| `npx wrangler dev --remote` (real edge) | fine | **throws** | **throws** |
| Deployed Worker | fine | **throws** | **throws** |

The open-source workerd build that `wrangler dev` runs does not enforce the cap.
Only the deployed runtime does, and it does so exactly at 100,000. So a hash
minted above the cap passes every local check and then locks the promoter out
of the live site on their first sign-in.

Two things follow, both of which have already bitten this project once:

- **Verification reads the iteration count out of the stored hash**, not out of
  the constant. So an existing hash written below the cap keeps working even if
  the constant is wrong, which is exactly how the repository and production came
  to disagree without anybody noticing: the constant said 600,000 while the
  stored hash said 100,000, sign-in worked, and the next re-seed would have
  minted an unverifiable hash and locked the account out.
- **The unknown-promoter path derives against a decoy hash**, so it fails
  independently of anything stored. That one *was* live: signing in with a
  promoter name that does not exist returned a 500 in production while the real
  login worked fine. The decoy is now built from the same constant so the two
  cannot drift again.

`lib/auth.test.ts` asserts the number outright, because asserting the number is
the only way a suite running under Node can see a limit that Node does not have.
To check the runtime itself rather than trusting this document, put a
`crypto.subtle.deriveBits` call in a throwaway Worker and run it under
`wrangler dev --remote` — the local `wrangler dev` will tell you it is fine.

## HTTPS at the edge

**Someone with dashboard access needs to turn on SSL/TLS → Edge Certificates →
"Always Use HTTPS" for `eventiq.win`.** It is one toggle and it is the correct
fix. The API call, for a token that has Zone Settings · Edit:

```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/<zone-id>/settings/always_use_https" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" --data '{"value":"on"}'
```

The deploy token cannot do this — it gets 403 on every zone setting — so
[proxy.ts](proxy.ts) redirects plain http to https itself, keyed on
`x-forwarded-proto`. That covers pages and **does not cover static files**:

```
http://eventiq.win/                             308 → https://eventiq.win/
http://eventiq.win/promoter/login               308 → https://eventiq.win/promoter/login
http://eventiq.win/fighters/callum-reeves.webp  200          (still plain http)
http://eventiq.win/_next/static/chunks/....js   200          (still plain http)
```

Anything under `public/` or `_next/` is answered by the Workers assets binding
*before the Worker runs at all*, so no middleware can reach it. Forcing the
Worker to run first would close the gap at the cost of an invocation on every
image on the site, to do a job the zone setting already does properly and for
free. Hence the toggle.

## The site URL

`NEXT_PUBLIC_SITE_URL` sets the canonical address at build time and defaults to
`https://eventiq.win` ([lib/site.ts](lib/site.ts)). It feeds `metadataBase`, the
Open Graph tags and the WhatsApp chase messages. It deliberately does **not**
feed the QR code, which reads the origin it is being served from, so the printed
card still works off a laptop screen in a meeting.

## What is left to do

Nothing is blocking the site. The token now answers 200 on all four account
endpoints the deploy needs, the database is provisioned, migrated and seeded,
and `https://eventiq.win` serves the card out of D1.

What remains is operational rather than technical:

1. **Turn on "Always Use HTTPS" for the zone.** Static files are still served
   over plain http and no application code can fix that. See
   [HTTPS at the edge](#https-at-the-edge). This is the only outstanding item
   that affects what a visitor gets.
2. **Rotate the API token.** It was handled in chat during this build, so treat
   it as known. The promoter password and `SESSION_SECRET` have both been
   rotated since; the token has not.
3. **Narrow the token.** Drop **Cloudflare Pages · Edit**, which nothing uses.
4. **Reprint the table card from the live URL.** The QR encodes the origin it
   was served from, so one printed from a laptop is useless at a venue.
5. **Render the tapes into R2.** The programme falls back to playing the
   sequence live in the browser where no mp4 exists, so this is a quality step
   rather than a fix. See [video rendering](#video-rendering).

Done since this list was last written: the `eventiq-photos` bucket has been
deleted (it held one orphaned photograph from an end-to-end run against a
deployment that briefly bound it; `eventiq-media` is the only bucket now), the
promoter password and `SESSION_SECRET` have been rotated, and the PBKDF2
iteration count has been brought down to something the runtime will run.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

Rolling back the Worker does not roll back the database. Migrations are additive
and there is no down-migration path, which is a deliberate limit rather than an
oversight at this size: reverting a schema change means writing the SQL to
reverse it.
