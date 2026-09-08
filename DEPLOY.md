# Deploying to eventiq.win

EventIQ is a Next.js application running on **Cloudflare Workers** via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with **D1** for
data and **R2** for photographs and rendered video. It is no longer a folder of
files, so deploying it means creating two pieces of infrastructure and putting a
secret in place before anything is uploaded.

> **Status: live at https://eventiq.win.** The D1 permission arrived, so the
> database was created, migrated and seeded, and the Worker is deployed with the
> custom domain attached. Every step below has been run against the real
> account except where it says otherwise, and the whole product has been walked
> end to end in production with
> `npm run e2e -- --base https://eventiq.win` (25 steps, all passing).
>
> **Before a real promoter's card goes on here, work through
> [Before the first real show](#before-the-first-real-show).** It is the list of
> things that live in a dashboard or a password manager and that no script in
> this repository can do for you.
>
> One of them is outstanding and is not something code can fix: **"Always
> Use HTTPS" is off for the zone**, so static files are reachable over plain
> http. See [HTTPS at the edge](#https-at-the-edge). Before changing anything in
> `lib/auth.ts`, read [the PBKDF2 ceiling](#the-pbkdf2-ceiling-and-why-local-tests-cannot-see-it)
> — the runtime enforces a limit that no local test can observe.
>
> **There are now three secrets, not one.** `RENDER_KEY` joined
> `SESSION_SECRET` when the capture page the video renderer screenshots stopped
> being reachable by anybody who could guess a slug. A fresh deployment without
> it renders no videos, and **no copy of the deployed value is kept anywhere**,
> so whoever wants to render mints their own — two commands, no other
> consequences. See [section 4](#4-set-the-secrets). That secret is on its way
> out: render keys are rows in the database now, scoped to a promoter, and
> `RENDER_KEY` is what a deployment runs on until the runner has one of its own.
>
> **And one variable.** `SHOWCASE_SLUG` in `wrangler.jsonc` names the published
> show EventIQ's own front page runs on. See [section 4a](#4a-set-the-variables).
>
> `INVITE_KEY` joined the secrets when invite tokens stopped being stored in the
> clear; unlike the render key it **has to be kept**, because rotating it stops
> every link already sent out. See [section 4](#4-set-the-secrets).

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

There are three, and the Worker needs all of them. None has a fallback and none
has a default.

```bash
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
openssl rand -base64 36 | npx wrangler secret put RENDER_KEY
openssl rand -base64 48 | npx wrangler secret put INVITE_KEY
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

**`INVITE_KEY`** is what an invite token is sealed under. The token in a
fighter's link is their whole credential, so the row no longer holds it: it
holds an HMAC digest, which is what a lookup matches, and an AES-GCM ciphertext,
which is what the dashboard decrypts to put the link back on the promoter's
screen. Both keys are derived from this one value. Locally it may be left out
and `SESSION_SECRET` stands in; **a deployed Worker without it refuses to serve
an invite at all**, rather than sealing every fighter's link under a value that
is in this repository.

**This one has to be kept, and it is the only one of the three that does.**
Rotating `RENDER_KEY` costs nothing and rotating `SESSION_SECRET` signs the
promoter out; rotating `INVITE_KEY` stops every link already sent out and leaves
the dashboard unable to show what the old ones were, so every fighter on every
live card needs a new link. Put it in the password manager the day it is set.

Turning it on over a database that already holds plaintext tokens is
[the invite backfill](#the-invite-backfill), below.

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

**An exported `RENDER_KEY` beats `.dev.vars`, in every tool that reads it.** That
is the right way round — the shell is how you point the renderer at production —
but it means a key exported for a production render is then the wrong key for a
local one, and the way that arrives is a 404 from a route that is working
perfectly. Start a local run in a shell without it, or with `env -u RENDER_KEY`.

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

Secrets survive a deploy. They were confirmed present after `npm run deploy`,
which is worth knowing because `wrangler.jsonc` declares none of them.

### The invite backfill

Migration `0007` adds the digest, the ciphertext, the expiry and the revocation
columns, and it cannot fill the first two in: sealing a token needs `INVITE_KEY`
and SQLite has neither HMAC nor AES. So there is a one-off script, and the order
of the four steps is what makes it safe to run against a live show.

```bash
npx wrangler secret put INVITE_KEY < the-value        # 1. the Worker can read it
npm run db:migrate:remote                             # 2. the columns exist
npm run deploy                                        # 3. the code that uses them
INVITE_KEY='...' npm run db:migrate-invites -- --remote   # 4. seal what is there
```

Between 2 and 4 the table is half migrated, and that is a supported state rather
than a window to hurry through: every lookup matches the digest **or** the
plaintext column, so a link sent out last week goes on working throughout. Each
one that comes in on the old column writes a `plaintextInvite` warning to the
logs, which is the only thing that would ever tell you step 4 had not been run.

The script only touches rows that still hold a plaintext token, so running it
twice is a no-op, and `--dry-run` counts them without writing. **No token
changes**, only what is kept of it — nobody has to be sent a new link.

Rows carried over are given ninety days from the migration rather than ninety
from when they were created, so upgrading a database cannot expire a link that
is already in somebody's messages.

### Render keys are rows now, and the secret is the migration path

A key that opens the capture page is a row in `render_keys`, minted with
[scripts/render-key.mjs](scripts/render-key.mjs) and scoped to a promoter or to
none. `RENDER_KEY` above is still accepted, so that a deployment, a workflow and
whoever renders by hand do not all have to change in the same breath — and it is
the thing to remove once every runner holds a minted key, because it is one
credential that reads every promoter's cards, published or not.
[HANDOVER section 6c](HANDOVER.md#6c-the-render-key-and-why-the-renderer-could-not-use-the-publish-check).

```bash
# The runner's key. Unscoped, because the hourly job renders whatever is queued
# and cannot know in advance whose show that will be. Printed once.
npm run render-key -- mint --label "GitHub Actions" --remote

# Anything held by a person, or by a machine doing one promoter's shows.
npm run render-key -- mint --promoter cage-county --label "a laptop" --days 90 --remote

npm run render-key -- list --remote
npm run render-key -- revoke --id rk_... --remote
```

**Whatever is minted goes into `RENDER_KEY` wherever the renderer runs** — the
repository secret for the workflow, the shell or `.dev.vars` for a run by hand.
The renderer itself is unchanged: it presents that value in the
`x-eventiq-render-key` header on the capture page's own request, and it neither
knows nor cares whether the far side matched a row or the Worker's secret.

Finish the migration in this order: mint the runner's key, put it in the
`RENDER_KEY` repository secret, run the workflow once to prove it renders, then
`npx wrangler secret delete RENDER_KEY`. Deleting first stops every render until
the new key is in place.

## 4a. Set the variables

There is one, and unlike the secrets it lives in `vars` in
[wrangler.jsonc](wrangler.jsonc) and is set by a deploy.

```jsonc
"vars": {
  "SHOWCASE_SLUG": "cage-county-12"
}
```

`SHOWCASE_SLUG` names the one published show EventIQ's own shop window runs on:
the pitch page, the sitemap, `/f/demo` and the bare `/qr` redirect. A var rather
than a secret because it names something public, and because changing which show
is on display should be a deploy with a diff on it rather than a
`wrangler secret put` nobody can read back.

It replaces "whichever published show has the furthest-out date", which was a
rule that would put a second promoter's card on EventIQ's front page and into its
sitemap the moment their date was the later one, with nobody having done
anything. **Unset, or naming a show that is not published, means no showcase**:
the pitch page makes its whole argument without a live card, `/qr` answers 404
and the sitemap lists `/` alone. Nothing else is affected — a promoter's own
programme is at `/e/<slug>` either way.
[HANDOVER section 6e](HANDOVER.md#6e-the-shop-window-runs-on-a-named-show).

## 5. Seed the first promoter

The database is empty. Seeding it puts the Cage County 12 demo card in, along
with a promoter account you can sign in as:

```bash
SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote -- --i-understand-this-rewrites-production
```

Three things have to be true before it will touch the live database, and each
guards a different way of getting this wrong.

**A password, rather than the development default.** A known password on a
reachable promoter account is the same as no password at all.

**That flag, typed out.** The seed is a *rewrite*: it deletes the promoter,
their sponsors, the show and its fighters and builds the demo card again, and it
reissues every invite token, so every link already sent out stops working. The
local command and the remote one otherwise differ by one word, and the flag is
the moment you notice which terminal you are in.

**A pre-check that the database still holds nobody but the seeded promoter.**
The flag cannot help somebody who does mean to re-seed on an instance that has
since acquired a real account. There is no self-service signup, so the demo
instance holds exactly one promoter and it is `cage-county`; anything else was
created deliberately and this script would delete their sponsors on the way
past. So it asks — `SELECT slug FROM promoters` over
`wrangler d1 execute --remote --json` — and refuses by name if the answer
surprises it. It also refuses if it cannot read the table at all, because "I
could not tell" and "it is safe" are different answers.

Take an export first if there is any doubt: `npm run db:backup`.

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
that case you still need a promoter row to sign in as, and the next section is
how to make one without the demo card coming with it.

## 5a. Onboarding a promoter

There is no signup form, and that is a decision rather than a gap: a fight
promoter is somebody who has already been spoken to, and an open form on a
product with one operator collects support burden rather than customers. So
accounts are made with one command.

```bash
npm run promoter -- list
npm run promoter -- create --slug budo --name "BUDO Fight Series" --generate --remote
npm run promoter -- set-password --slug budo --password '…' --remote
npm run promoter -- reset-link --slug budo --remote
```

Without `--remote` every one of them works on the local Miniflare D1 instead,
which is where to try them first. **Not while a dev server is running** — two
writers on one Miniflare file and the second one loses, silently, which is the
same trap as `wrangler d1 execute --local`.

[scripts/promoter.mjs](scripts/promoter.mjs) hashes through
[lib/auth.ts](lib/auth.ts) rather than through a copy of the algorithm, so the
verifier it writes is the one the login reads, at the count the edge will
actually run. That is [the PBKDF2 problem](#the-pbkdf2-ceiling-and-why-local-tests-cannot-see-it)
avoided by construction rather than by somebody remembering.

Four things worth knowing about it.

- **`--generate` prints the password once and stores it nowhere.** There is no
  way to ask for it again: `set-password` or a reset link is what replaces one
  that has been lost. A password passed in with `--password` is held to the same
  twelve-character floor the promoter's own form enforces.
- **A slug that already exists is refused**, before any password is generated,
  and it says what to run instead. The slug is the promoter's username and the
  sign-in form lowercases what is typed into it, so a slug with a capital in it
  would be an account nobody could reach; that is refused too.
- **`set-password` and `reset-link` both sign that account out everywhere.**
  Setting a password bumps `session_version` on the promoter row, and every
  cookie already issued names the generation before it.
- **A reset link is a bearer credential with no email behind it.** It lasts half
  an hour, works once, and only its digest is stored, because it travels through
  whatever channel you already use to talk to that promoter. Minting a second one
  kills the first. They open `/promoter/reset/<token>`, set a password, and sign
  in with it.

A promoter who is already signed in changes their own password at
`/promoter/account`, which asks for the current one and signs out every other
device. That is the route for the ordinary case; these commands are for the one
where nobody can get in at all.

A new account has no shows on it. The promoter creates the first one themselves
at `/promoter`, so nothing here has to seed a card for them.

## 6. Deploy

```bash
npm run deploy
```

[scripts/deploy.mjs](scripts/deploy.mjs) checks the permissions, builds with
`NEXT_PUBLIC_SITE_URL=https://eventiq.win`, **applies any pending D1 migrations**,
and then runs `opennextjs-cloudflare deploy`. The first deploy prints a
`*.workers.dev` URL, which is a working link before DNS is sorted.

That ordering is the point and it used to be two commands typed in the right
order by somebody who remembered. The Worker being uploaded expects the schema
that ships with it, so uploading first means every request in between hits the
old tables. Migrating happens *after* the build, so a build that was going to
fail fails without having touched the live database, and migrations here are
additive with no down path — which is what makes the few seconds of old Worker
against a wider schema safe. **A migration failure stops the deploy.** Half a
schema change with a new Worker on top of it is the state nobody can reason
about on a show night.

Because `wrangler d1 migrations apply` reports success on a no-op as readily as
on real work, the script then reads the list back and refuses if anything is
still unapplied. Worth saying plainly: the individual commands have all been run
against this account, but **the reordered deploy has not been through a real
run** — it was written and checked against the migrations list output rather than
by deploying. `npm run deploy -- --dry-run` is the cheap way to see what it will
do before it does it.

Variations:

```bash
npm run deploy -- --check            # permissions only, changes nothing
npm run deploy -- --dry-run          # that, plus the pending migrations and the plan
npm run deploy -- --skip-build       # redeploy the existing .open-next/
npm run deploy -- --attach-domain    # also point eventiq.win at the Worker
```

`--dry-run` is all reads: it probes the token, lists what the remote database is
waiting for, and prints the steps a real run would take. Worth a few seconds
before a deploy you have not done in a while.

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
SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote -- --i-understand-this-rewrites-production
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
that has both. Most of the time that machine is now a GitHub runner —
[.github/workflows/render.yml](.github/workflows/render.yml) — and this section
is what you need when it is not.

```bash
npm run render -- --slug cage-county-12 --list             # what needs doing
npm run render -- --slug cage-county-12 --stale --publish --remote
```

`--publish` puts the mp4 in R2 and records the key in `render_jobs`, which is
where the programme reads it from. `--stale` takes the bouts that are queued,
out of date, or worth another attempt; a fifteen-bout card is about a quarter of
an hour of compute, and one bout took **63 seconds end to end** on a warm laptop
against a local dev server — 52 of them capturing 480 frames, the rest cutouts,
the claim, the upload and the row.

The mp4 is 1080x1920, 30fps, 16.000 seconds, about 1.8MB, tagged BT.709 for all
three of primaries, transfer and matrix. Both spellings of those tags are
passed, because ffmpeg's own `-color_primaries`/`-color_trc` reached the
bitstream as the matrix and nothing else in the build this was checked against;
the `-x264-params` are what actually write all three. `ffprobe` says which.

### Two runners cannot render the same bout

Each bout is claimed with one statement that writes a fifteen-minute lease, so
the hourly workflow and somebody running the script by hand cannot collide, and
a runner killed by a timeout releases its bouts by lapsing rather than by
cleaning up. A bout gets two attempts before it stops being picked up on its
own; the promoter's "Render again" button, or another `enqueueRender`, resets
that.

Nothing a render does can take a working video off a live card. `current_r2_key`
is written only by a successful publish, and the programme reads that column and
never `status`.

### The key changes when the video does

Renders publish to `renders/<slug>/bout-<n>-<hash8>.mp4`, where the hash covers
everything on screen. `/media` serves a year of immutable caching, so a fixed
key would have left phones that had already played a bout holding the old video
indefinitely. The superseded object is deleted after the new one is in.

### Rendering from CI

`.github/workflows/render.yml` runs `--stale --publish --remote` against
`https://eventiq.win` every hour for every published show dated within the last
two days or later, and takes a `workflow_dispatch` (a slug, optionally some bout
numbers) or a `repository_dispatch` of type `render`. It needs three repository
secrets:

| Secret | Same value as |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the deploy token, scopes as above |
| `CLOUDFLARE_ACCOUNT_ID` | the account id from step 2 |
| `RENDER_KEY` | an unscoped key from `npm run render-key -- mint --remote` |

The workflow finds Chrome on the runner and exports `CHROME_PATH`, and installs
ffmpeg if the image does not already carry it. Neither is promised by anything
we control, and a render that gets 480 frames in before finding out is an
expensive way to be told.

**This is where the render key now lives.** It used to be held by whoever
rendered, on their own laptop, and open question 5 in the handover was where it
should live instead. It lives in repository secrets, which means anyone who can
read those, or push a workflow that echoes them, holds it. That is the trade for
the videos being made without a person; it is worth knowing rather than
discovering.

What that secret should hold is **a key minted for the runner and nothing else**:
`npm run render-key -- mint --label "GitHub Actions" --remote`, unscoped, because
the hourly job renders whatever is queued and cannot know whose show that will
be. Unscoped means it still reads every promoter's cards, published or not, so it
is narrow in who holds it rather than in what it opens — and it can be revoked
and replaced in two commands without touching the Worker or signing anybody out.
Anything held by a person wants `--promoter <slug>` and probably `--days`, which
makes it a credential for one promoter's shows and nobody else's.

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

The key goes out as an `x-eventiq-render-key` header on the capture page's own
request and on nothing else. It used to be set with `page.setExtraHTTPHeaders`,
which put it on every request the page made — the photographs, the fonts, the
chunks, and anything hosted somewhere that is not ours. Against a local
`next dev` or `wrangler dev` the script reads the key out of `.dev.vars`, the
same file the server reads, so nothing needs exporting locally.

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

## Backups

**D1's time travel is a recovery mechanism, not a backup.** It goes back thirty
days, it lives in the same account as the database, it cannot be inspected
without restoring it, and it tells you nothing about a database that has been
quietly wrong for a fortnight. Once a real promoter's card is on here, the
difference matters.

```bash
npm run db:backup                       # export, then put it in R2 as backups/<date>.sql
npm run db:backup -- --out backups      # and keep a copy on this machine
npm run db:backup -- --dry-run          # export and check it, upload nothing
```

[scripts/backup.mjs](scripts/backup.mjs) runs `wrangler d1 export eventiq
--remote`, checks the file is not empty and does look like a schema — an empty
file and a file full of an error message both exit zero somewhere in a
pipeline — and then `wrangler r2 object put` under `backups/<date>.sql`. The date
is UTC, so a backup taken either side of midnight in two timezones does not land
on yesterday's key.

Two honest limits.

**R2 is in the same Cloudflare account as D1.** This protects against a bad
migration, a wrong `DELETE` and a re-seed nobody meant; it does not protect
against losing the account. `--out <dir>` keeps a copy wherever it is run, which
is the other half and belongs on a machine somebody controls. Note that an
export carries every live invite token, every fighter's details and the
promoter's password verifier — it is the most sensitive file this project
produces. `/backups/` is gitignored for that reason.

**Nothing prunes.** See [the R2 lifecycle rule](#the-r2-lifecycle-rule) below.

### Rehearsing the restore

A backup nobody has restored is a hope.

```bash
npm run db:restore-rehearsal -- --date 2026-09-07     # fetch it from R2 first
npm run db:restore-rehearsal -- --file backups/2026-09-07.sql
```

[scripts/restore-rehearsal.mjs](scripts/restore-rehearsal.mjs) loads the backup
into a **scratch Miniflare database in a temporary directory** — never the local
development one, which the export's `CREATE TABLE` statements would collide with
— and then counts the rows. It fails if `promoters`, `events`, `bouts`,
`fighters` or `invites` come back empty, which is the failure worth catching: an
export carrying the schema and none of the data restores without an error and
hands you a database with no show in it.

**A D1 export cannot be fed straight back in**, and that was worth finding out
before the night it mattered. `wrangler d1 export` writes one table at a time in
alphabetical order, so `bouts` rows arrive before the `sponsors` table they point
at exists. The file opens with `PRAGMA defer_foreign_keys=TRUE` for exactly this,
and `wrangler d1 execute --file` runs each statement in its own transaction, so
the pragma is spent by the second one; `PRAGMA foreign_keys=OFF` is ignored
outright. The rehearsal therefore reorders the statements — every `CREATE`
first, then the inserts parents-first, with the order worked out from the
`REFERENCES` clauses in the file rather than from a list somebody has to
remember to update. **A real restore has to do the same thing**, so use the
script's reordering rather than piping the raw export at a database.

### Scheduling it

There is deliberately no workflow for this. The job needs a token with D1 and R2
edit rights, and this repository holds no credentials otherwise; a nightly cron
on any machine that already has the token is the smaller thing to secure.

```cron
# 03:15 UTC nightly. Runs as whoever owns the token.
15 3 * * *  cd /path/to/EventIQ && CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run db:backup >> /var/log/eventiq-backup.log 2>&1
```

On Windows the equivalent is a Task Scheduler entry running the same command.
Either way, **check the log the first week and then check the bucket monthly** —
a backup job nobody looks at is the classic way to find out on the one day it
matters that it stopped working in March.

### The R2 lifecycle rule

Nothing in the backup script deletes anything, on purpose: a script that prunes
is a script that can prune the wrong thing. R2 does it instead, and it only
needs saying once:

```bash
npx wrangler r2 bucket lifecycle add eventiq-media eventiq-backups backups/ --expire-days 90
npx wrangler r2 bucket lifecycle list eventiq-media
```

The prefix matters. Without `backups/` the rule would expire fighter
photographs and rendered mp4s along with it, which is the whole bucket.
Ninety days is a starting point rather than a considered retention period —
that is a question for the privacy notice and the retention policy, which are
[HANDOVER.md section 19](HANDOVER.md#19-what-to-build-next) item 2, and it wants
answering before real fighters' details are in these files.

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

## Before the first real show

Everything above is a command. This is the other list: the things that live in a
dashboard, a password manager or somebody's calendar, which no script here can
do and which nobody will think of at six o'clock on the night. Work through it
once, before a promoter's card and a room full of spectators depend on it.

- [ ] **Rotate the Cloudflare API token, and drop Cloudflare Pages · Edit while
      you are in there.** The current token was handled in chat during the build,
      so treat it as known. Pages is a different product and nothing in this
      repository calls it; the deploy has been run end to end on a token without
      it. Scopes are in [section 1](#1-create-an-api-token), and
      `node scripts/deploy.mjs --check` will tell you the new one is complete
      before you find out mid-upload.
- [ ] **Turn on "Always Use HTTPS"** — SSL/TLS → Edge Certificates, for
      `eventiq.win`. One toggle. Static files under `public/` and `_next/` are
      answered by the assets binding before the Worker runs, so the redirect in
      `proxy.ts` cannot reach them and `http://eventiq.win/fighters/*.webp`
      answers 200 over plain http today. The deploy token gets 403 on every zone
      setting, so this cannot be scripted from here.
      [The detail](#https-at-the-edge).
- [ ] **Put `SESSION_SECRET` in a password manager.** It cannot be read back out
      of the Worker and there is no copy of it anywhere. Rotating it signs the
      promoter out, which is the whole of the revocation story and is deliberate.
      Render keys no longer belong on this list in the same way: they are rows,
      they are minted per machine, and one that is lost is revoked and replaced
      rather than recovered.
      Signing out one account instead is a password change or
      `npm run promoter -- set-password`, which bumps that promoter's
      `session_version` and leaves everyone else alone.
- [ ] **Mint the runner a key of its own, then delete the `RENDER_KEY` secret.**
      `npm run render-key -- mint --label "GitHub Actions" --remote`, into the
      repository secret, one workflow run to prove it renders, then
      `npx wrangler secret delete RENDER_KEY`. Until that last command runs, the
      old single credential that reads every promoter's cards still exists.
      [Render keys](#render-keys-are-rows-now-and-the-secret-is-the-migration-path).
- [ ] **Put `INVITE_KEY` in the password manager too, and treat it as the one
      that cannot be replaced.** Rotating it stops every link already sent out
      and leaves the dashboard unable to show what the old ones were, so a lost
      one means every fighter on every live card being sent a new link by hand.
- [ ] **Point an external uptime check at `/api/health`.** Anything that will
      send a message to a phone — a free tier is fine. Nothing here phones home,
      so a 500 on show night stays a 500 until somebody happens to log in, and
      that has already happened once: the PBKDF2 failure was live and invisible
      until a person tried to sign in. It has to be *external*; a check running
      on the same thing it is checking answers no useful question. (The route
      itself is being added separately — confirm it answers before relying on
      it.)
- [ ] **Confirm the nightly backup actually ran**, rather than that it is
      scheduled. `npm run db:restore-rehearsal -- --date <yesterday>` is the
      version of that question worth asking, because it also proves the file
      restores. [Backups](#backups). Set the
      [lifecycle rule](#the-r2-lifecycle-rule) at the same time, or the bucket
      keeps every export forever.
- [ ] **Reprint the table card from the live URL.** The QR encodes the origin it
      was served from, so one printed off a laptop is useless at a venue.

The product side of "before a real show" — consent wording, a privacy notice, a
lawful basis and a retention policy — is not on this list because it is not
operational, and it is a blocker rather than a nicety. [HANDOVER.md section
19](HANDOVER.md#19-what-to-build-next) items 1 and 2.

## What is left to do

Nothing is blocking the site. The token now answers 200 on all four account
endpoints the deploy needs, the database is provisioned, migrated and seeded,
and `https://eventiq.win` serves the card out of D1.

This list is operational. The product roadmap — starting with getting a real
show onto the platform, with consent as the gate — lives in
[HANDOVER.md section 19](HANDOVER.md#19-what-to-build-next). Putting the
render pipeline on Cloudflare Containers is a roadmap item there and in
section 11, not something a deploy does.

What remains on the account:

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
   rather than a fix. See [video rendering](#video-rendering). Still a job
   run from a machine that has Chrome and ffmpeg; Containers is the likely
   longer answer, not a thing this deploy grows into.
6. **Set `RENDER_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as
   repository secrets, and keep the render key somewhere a person can read it.**
   The hourly workflow needs all three, and until they are set it fails every
   hour. What goes in `RENDER_KEY` is now a key minted for the runner —
   `npm run render-key -- mint --label "GitHub Actions" --remote` — rather than
   the Worker's secret, and once it is in place `wrangler secret delete
   RENDER_KEY` retires the one credential that could read every promoter's cards
   without a row behind it. A password manager entry as well as the repository
   secret, not a file in the repository, and it is worth knowing that anyone who
   can push a workflow can read a repository secret. The tenancy half of this is
   decided — HANDOVER section 19 item 11 — and what is left is the chore.

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
