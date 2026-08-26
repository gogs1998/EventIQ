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
>
> **There are now two secrets, not one.** `RENDER_KEY` joined
> `SESSION_SECRET` when the capture page the video renderer screenshots stopped
> being reachable by anybody who could guess a slug. A fresh deployment without
> it renders no videos, and **no copy of the deployed value is kept anywhere**,
> so whoever wants to render mints their own — two commands, no other
> consequences. See [section 4](#4-set-the-secrets).

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

## 4. Set the secrets

There are two, and the Worker needs both. Neither has a fallback and neither has
a default.

```bash
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
openssl rand -base64 36 | npx wrangler secret put RENDER_KEY
```

**`SESSION_SECRET`** signs the promoter's login cookie. A Worker without it
refuses to serve the promoter area rather than accepting sessions signed with
something guessable. Rotating it signs everybody out, which is the whole of the
revocation story and is deliberate — see section 6a of
[HANDOVER.md](HANDOVER.md).

**`RENDER_KEY`** is what the mp4 renderer presents to reach
`/render/[slug]/[bout]`, the page headless Chrome screenshots. That page cannot
go behind the publish check, because rendering a card before it is published is
the point of rendering it, so it takes a key of its own instead. **Without this
secret the render route refuses everybody who is not the signed-in promoter who
owns the show, and `npm run render` stops working** with the error saying so.
Keep the same value in the environment of whatever machine runs the renderer —
see [video rendering](#video-rendering).

### The operator mints their own render key

**There is no copy of `RENDER_KEY` anywhere and there is not meant to be.** It
cannot be read back out of the Worker, it is in no file in this repository, and
nobody has it written down. If you have arrived at this project and want to
render a video, that is not a problem to solve — **mint a new one.** It is two
commands and it costs nothing else: nothing but the renderer reads this secret,
so replacing it signs nobody out, invalidates no session and touches no data.

```bash
# 1. Generate it, put it on the Worker, and keep the value where you can see it.
openssl rand -base64 36 | tee /dev/tty | npx wrangler secret put RENDER_KEY

# 2. Export the same value wherever the renderer runs.
export RENDER_KEY='<the value from step 1>'
```

`tee /dev/tty` is there because `wrangler secret put` reads stdin and prints
nothing back, so a plain pipe puts the key somewhere you cannot see it and the
renderer then has no way to match it. Locally the same value goes in `.dev.vars`
instead, which is the file both the dev server and the renderer read.

Rotating it is the same two commands. Do it if the renderer ever runs somewhere
less trusted than the operator's own machine, and note what it is: anybody
holding it can read any card on the instance, published or not.

An unset `RENDER_KEY` denies rather than allows, which is the right way round
but does mean it fails quietly from the outside: the route simply carries on
answering 404. If rendering has stopped working and nothing else has, check
`npx wrangler secret list` first.

Check what is set at any time:

```bash
npx wrangler secret list
```

Secrets survive a deploy. Both of these were confirmed present after
`npm run deploy`, which is worth knowing because `wrangler.jsonc` declares
neither.

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

Apply any migrations first, because the Worker that goes up expects the schema
that comes with it:

```bash
npx wrangler d1 migrations apply eventiq --remote
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
8. `/render/cage-county-12/15` signed out — **404**, and 200 with the render key
   in an `x-eventiq-render-key` header or with the owning promoter's session.
   That route reads a card whether or not it is published, so it is the one
   worth checking by hand after any deploy.

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

The suite also reads a real Sherdog page, which leaves a row in `import_cache`.
That one is harmless and the point of it — one row per fighter, a week's life —
but the seed does not clear the table, because it is not scoped to a promoter.
It only matters if the importer's hourly ceiling has been exercised: with 120
rows fetched inside the hour the Sherdog step is refused, which reads as a broken
parser rather than as a limit working. Clear it and run again:

```bash
npx wrangler d1 execute eventiq --remote --command "DELETE FROM import_cache;"
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

### Cutouts happen here too

Before it renders anything, the renderer cuts out any fighter who has sent a
photograph and has no cutout of it yet — [scripts/cutouts.mjs](scripts/cutouts.mjs).
That is deliberately not in the upload: background removal is an ONNX model and
about three and a half seconds of CPU per image, so in the request path it would
either hold a fighter's form open or fail on their phone, and a Worker cannot run
the model at all. It reads the photograph out of R2, or out of `public/fighters/`
for the seeded card, and writes a transparent WebP to `cutouts/` in the bucket
and the key onto the fighter.

It is also a command of its own, because it is the slow half and the half that
fails for its own reasons:

```bash
npm run cutouts -- --slug cage-county-12 --remote                     # the missing ones
npm run cutouts -- --slug cage-county-12 --remote --refresh-cutouts   # all of them again
npm run cutouts -- --slug cage-county-12 --remote --only nadia-farrukh
```

Both accept the same flags: `--refresh-cutouts` to remake ones that exist,
`--only <id>[,<id>]` to name fighters, `--cutout-timeout <ms>` for the ceiling on
one removal. `npm run render` also takes `--no-cutouts`, which skips the step
entirely.

**A failure here is not a failure of the render.** A photograph the model cannot
handle, or one it hands back empty or untouched, is logged, leaves the cutout
null, and the video shows the photograph — soft-masked and moved less, so it
reads as a deliberate treatment rather than a rectangle sliding about. Only a
fighter who has sent nothing at all gets the initialled plate. `npm run render
-- --slug <slug> --list` says which bouts have a photograph still waiting for a
cutout.

The machine running it needs three things: the same `CLOUDFLARE_API_TOKEN`, a
`--base` pointing at somewhere the card can be rendered from — either the
deployed site or a local dev server against the same data — and **`RENDER_KEY`,
matching the Worker secret of the same name.**

```bash
export RENDER_KEY='...'                # the value from `wrangler secret put`
npm run render -- --slug cage-county-12 --bout 15 --base https://eventiq.win --remote
```

The key goes out as an `x-eventiq-render-key` header, set with
`page.setExtraHTTPHeaders` so every request the capture page makes carries it.
Against a local `next dev` or `wrangler dev` the script reads it out of
`.dev.vars` instead, the same file the server reads, so nothing needs exporting
locally.

Two failures and what they look like:

- **`RENDER_KEY is not set, so the capture page will refuse this render.`** The
  script checks before launching Chrome. Set it, or add it to `.dev.vars`.
- **`… answered 404.`** The show and bout are fine and the key is wrong. The
  render route answers 404 rather than 401 or 403, on purpose, so that it will
  not confirm which slugs exist — which means a wrong key and a wrong slug look
  identical from outside. The script says so in the message rather than leaving
  you to guess.

Verified against production after the key went in: bout 15 of `cage-county-12`
renders in 58 seconds to 1080x1920, 480 frames at 30fps, 16.000 seconds exactly,
1.6MB.

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

**The same redirect used to take the local dev server down with it.** The check
read `x-forwarded-proto`, on the reasoning that the header only exists when
something is in front of the Worker. `next dev` sets it to `http` on everything
it serves, so a plain `npm run dev` answered 308 to `https://localhost:3000`,
which nothing is listening on — every page, and the capture page the renderer
screenshots. It is keyed on the hostname now, which is the thing actually being
protected and is never `localhost`.

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
6. **Decide whether `RENDER_KEY` should live somewhere shared.** Today nobody
   holds it: it is set on the Worker, cannot be read back, and whoever wants to
   render mints a fresh one — see
   [the operator mints their own render key](#the-operator-mints-their-own-render-key).
   That is fine while one person renders on their own machine and is the wrong
   shape the moment two people or a cron job need to. A password manager entry
   is the answer, not a file in the repository.

Done since this list was last written: the `eventiq-photos` bucket has been
deleted (it held one orphaned photograph from an end-to-end run against a
deployment that briefly bound it; `eventiq-media` is the only bucket now), the
promoter password and `SESSION_SECRET` have been rotated, the PBKDF2 iteration
count has been brought down to something the runtime will run, and `RENDER_KEY`
has been generated and set so the capture page stopped serving unpublished shows
to anybody who could guess a slug.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

Rolling back the Worker does not roll back the database. Migrations are additive
and there is no down-migration path, which is a deliberate limit rather than an
oversight at this size: reverting a schema change means writing the SQL to
reverse it.
