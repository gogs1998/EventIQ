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
> `npm run e2e -- --base https://eventiq.win` (28 steps, all passing).
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
> **There is a second environment, and it is up.** `eventiq-staging`, with its
> own database, bucket and secrets, is where the browser suite writes and where a
> change goes before eventiq.win sees it. It was provisioned, migrated, deployed
> and seeded on **8 September 2026** and answers at
> `https://eventiq-staging.gordonshepherd1.workers.dev`, with `/api/health`
> reporting `"env":"staging"`. Everything below takes `--env staging`; without the
> flag every command means production, exactly as it always has. See
> [Staging](#staging).
>
> **There are now three secrets, not one.** `RENDER_KEY` joined
> `SESSION_SECRET` when the capture page the video renderer screenshots stopped
> being reachable by anybody who could guess a slug. A fresh deployment without
> it renders no videos, and **no copy of the deployed value is kept anywhere**,
> so whoever wants to render mints their own — two commands, no other
> consequences. See [section 4](#4-set-the-secrets). That secret is on its way
> out and is now the last step of the way out: render keys are rows in the
> database, scoped to a promoter, the runner has one of its own as of
> 8 September 2026, and what is left is
> `npx wrangler secret delete RENDER_KEY` once the render workflow has run
> green once. Until then the old credential that reads every promoter's cards
> still exists.
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

**The token in use since 8 September 2026 has the four account rows and no zone
row at all.** eventiq.win is already attached, so nothing in the ordinary deploy
wants a zone permission — but it does mean two things cannot be done from a
terminal until somebody adds them back: `--attach-domain` for
[staging's optional hostname](#stagingeventiqwin--optional), and every zone
setting, which is why ["Always Use HTTPS"](#https-at-the-edge) and the `/e/*`
cache rule are dashboard jobs rather than scripts. The token it replaced could
*read* the zone and write nothing on it — `zones/<id>/settings`, `/pagerules`,
`/rulesets`, `/dns_records` and `/workers/routes` all answered 403 — so this is
a narrowing rather than a change of posture.

**Cloudflare Pages · Edit is gone, and should stay gone.** The token used
through most of this build had it and nothing in this repository calls a Pages
endpoint. Pages is a separate product from Workers and this app is not on it —
`@cloudflare/next-on-pages` is deprecated, and a Next.js app with server actions
and a database wants the Workers runtime. The 8 September token was created
without it and the deploy has been run end to end twice on that token.

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

**Secrets belong to one environment.** The commands above set them on the
production Worker and on nothing else; staging is a different Worker with a
different secret store, and its lines are in
[Staging](#staging). Setting one and expecting the other to have it is how a
freshly deployed staging Worker refuses every sign-in.

**`SESSION_SECRET`** signs the promoter's login cookie. A Worker without it
refuses to serve the promoter area rather than accepting sessions signed with
something guessable. Rotating it signs everybody out, which is the whole of the
revocation story and is deliberate — see section 6a of
[HANDOVER.md](HANDOVER.md).

**`RENDER_KEY`** is what the mp4 renderer presents to reach
`/render/[slug]/[bout]`, the page headless Chrome screenshots. That page cannot
go behind the publish check, because rendering a card before it is published is
the point of rendering it, so it takes a key of its own instead. **With neither
this secret nor a live row in `render_keys`, the render route refuses everybody
who is not the signed-in promoter who owns the show, and `npm run render` stops
working** with the error saying so. A minted row opens the same page in the same
header, so this secret is no longer the only way in — see
[render keys are rows now](#render-keys-are-rows-now-and-the-secret-is-the-migration-path).
Keep whichever value applies in the environment of whatever machine runs the
renderer — see [video rendering](#video-rendering).

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

Migration `0010` adds the digest, the ciphertext, the expiry and the revocation
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

**Production is between steps 3 and 4 as of 8 September 2026.** `INVITE_KEY` is
on the Worker, `0010` is applied and the code that uses it is deployed; the
backfill has not been run, and a dry run reports **30 invites still in the
clear**. That is the supported half-migrated state described above rather than
an outage — every one of those links still works — but every lookup that comes
in on the old column is writing a `plaintextInvite` warning, and the sealing is
the whole point of the key. The one command left, and the one that ends it:

```bash
INVITE_KEY='...' npm run db:migrate-invites -- --remote --dry-run   # confirm the 30
INVITE_KEY='...' npm run db:migrate-invites -- --remote             # seal them
```

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

**Where that stands: two of the four are done.** On 8 September 2026 an unscoped
key was minted with `npm run render-key -- mint --label "GitHub Actions"
--remote` and put in the `RENDER_KEY` repository secret. The workflow has not
run green yet, because the hourly schedule and `workflow_dispatch` only exist on
the default branch and PR #1 is not merged — see
[rendering from CI](#rendering-from-ci) — so the third step is waiting on that
merge and the fourth is waiting on the third. Until then the Worker's own
`RENDER_KEY` secret is deliberately still there: deleting it now would leave the
site with no way to render at all if the minted key turned out to be wrong.

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
still unapplied. **The reordered deploy has now been through real runs** — twice
against production and twice against staging on 8 September 2026, including the
provisioning run that applied all fourteen migrations to an empty staging
database. `npm run deploy -- --dry-run` is still the cheap way to see what it
will do before it does it.

Variations:

```bash
npm run deploy -- --check            # permissions only, changes nothing
npm run deploy -- --dry-run          # that, plus the pending migrations and the plan
npm run deploy -- --skip-build       # redeploy the existing .open-next/
npm run deploy -- --attach-domain    # also point eventiq.win at the Worker
npm run deploy -- --env staging      # all of the above, against staging
```

`--dry-run` is all reads: it probes the token, lists what the remote database is
waiting for, and prints the steps a real run would take. Worth a few seconds
before a deploy you have not done in a while.

**It refuses to deploy production from a side branch.** Everything here is built
on branches that are merged into `main`, often
several at once in separate worktrees, and a deploy is a thing somebody types
after doing something else. The script reads the branch and stops unless it is
that one:

```
This is branch "wave2/staging", not "main".
```

`--force` overrides it and `--env staging` sidesteps it, which is the point:
staging deploys from anywhere. `DEPLOY_BRANCH=...` changes which branch counts,
for whoever renames it. `--check` and `--dry-run` change nothing and are allowed
from anywhere.

The branch it names is `main` rather than the working branch, and that is a
consequence of GitHub rather than a preference: **a scheduled or dispatched
workflow only runs from the default branch.** `render.yml`'s hourly cron and
`e2e-staging.yml`'s button both sit on a branch nothing has merged yet, so
`gh workflow run render.yml` answers 404 and the hourly render has never fired.
Merging [PR #1](https://github.com/gogs1998/EventIQ/pull/1) into `main` is what
starts them, and it is why the deploy and the automation should be reading the
same branch.

Wrangler now prints a warning on a production deploy saying no target
environment was specified. That is expected: production **is** the top level of
`wrangler.jsonc` and staging is the only named environment, so there is nothing
to pass. The script prints which Worker, database and bucket it is about to
touch as its first line, which is the reassurance the warning is asking for.

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

The same walk is automated — **against staging, not against this**:

```bash
npm run e2e -- --base https://eventiq-staging.gordonshepherd1.workers.dev --password '...'
```

`staging.eventiq.win` is [optional and not attached](#stagingeventiqwin--optional),
so the workers.dev address is the one that exists.

The suite adds a bout, removes it again, fills in a fighter's profile and
uploads a photograph. That used to be run against production because production
was the only environment there was, and the ritual afterwards was a re-seed and
a delete from the bucket, remembered by whoever ran it. [Staging](#staging)
exists so that ritual is not needed: it is the same card in a database nobody is
selling from. `.github/workflows/e2e-staging.yml` runs it there from a button
and puts the demo card back afterwards.

If it does get run against production, the ritual still applies and is still the
same. The suite finishes with Chloe Baines submitted and photographed, and the
demo card is only persuasive while it is uneven — she is meant to be the fighter
who opened the link, had a look and did nothing, because that is the one the
chase list exists to catch. `npm run db:seed:remote` puts the rows back but does
not touch the bucket, so the uploaded photograph has to go separately:

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

### Rollout log — 8 September 2026

The order things were actually done in, against the production account, because
"which of these had happened by the time that broke" is the question a log
answers and a checklist does not.

1. **A new API token**, account-scoped, Workers Scripts / D1 / R2 / Account
   Settings and no zone row, set as the `CLOUDFLARE_API_TOKEN` repository secret
   beside `CLOUDFLARE_ACCOUNT_ID`. The token it replaced is still live in the
   dashboard and still has to be deleted by hand.
2. **A backup before anything else touched the database.** `npm run db:backup`
   wrote `eventiq-media/backups/2026-09-08.sql`, with a copy kept on a machine
   outside this repository.
3. **Migrations `0002` to `0013` applied to production**, after which
   `wrangler d1 migrations list eventiq --remote` reports none pending.
4. **`INVITE_KEY` set on the production Worker.** The backfill is *not* run —
   [the invite backfill](#the-invite-backfill) has the count and the command.
5. **Deployed, twice.** The live version carries `SHOWCASE_SLUG=cage-county-12`,
   `STYLISED_PORTRAITS=off` and `EVENTIQ_ENV=production`. `/api/health`, `/`,
   `/e/cage-county-12`, `/qr`, `/privacy`, `/promoter/login`, `/sitemap.xml` and
   `/robots.txt` all answer 200, and the programme carries
   `cache-control: public, s-maxage=60, stale-while-revalidate=300` along with
   the CSP and HSTS headers.
6. **The runner's render key minted** as an unscoped row and stored as the
   `RENDER_KEY` repository secret. The Worker's legacy `RENDER_KEY` secret is
   still there on purpose, until the workflow has rendered once.
7. **Staging provisioned and stood up** — database, bucket, fourteen migrations,
   three secrets, a deploy and a seed. [Standing it up](#standing-it-up).

Two things went wrong on the way and both are fixed in the repository rather
than in the account. The deploy script's D1 migration calls were missing
`--env`, so the first staging provisioning run tried to migrate production's
database and failed; and `wrangler.jsonc` had picked up a second top-level
`vars` block for the second time, which meant only `EVENTIQ_ENV` deployed and
the showcase slug was absent from the live Worker until a redeploy. JSON keeps
the last of two identical keys and says nothing about it, so
[lib/wrangler-config.test.ts](lib/wrangler-config.test.ts) now fails on a
repeated key at any level — HANDOVER bugs 35 and 43.

---

## Staging

A second Worker — `eventiq-staging` — with its own D1 database
(`eventiq-staging`), its own R2 bucket (`eventiq-media-staging`) and its own
secrets. Nothing it does can be seen from `eventiq.win`.

It exists because the end-to-end suite **writes as it goes**, and until now the
only place to write was the card the whole pitch is built on. That made a
twenty-eight-step check of the product into a thing you had to tidy up after, at
which point it stops being run. It is also where a migration, a deploy or an
idea gets tried before a promoter's show is behind it.

The names live in [scripts/environments.mjs](scripts/environments.mjs) and every
script that touches Cloudflare takes the same flag:

```bash
node scripts/deploy.mjs --env staging --provision   # create the database and bucket
node scripts/deploy.mjs --env staging               # build, migrate, deploy
npm run db:seed:remote -- --env staging --i-understand-this-rewrites-production
npm run db:backup -- --env staging
npm run render -- --slug cage-county-12 --stale --publish --remote --env staging --base <url>
```

Without `--env` they all mean production, because that is what they have always
meant and a flag you have to remember in order to reach production is a flag
somebody will forget in the other direction.

### Standing it up

**Done on 8 September 2026**, and this is the record of what was run rather than
a plan. `eventiq-staging` the database, `eventiq-media-staging` the bucket, all
fourteen migrations, three secrets, a deploy at
`https://eventiq-staging.gordonshepherd1.workers.dev` whose `/api/health`
answers `"env":"staging"`, and the demo card seeded into it. `STAGING_URL` and
`STAGING_PROMOTER_PASSWORD` are set as repository secrets, so
`e2e-staging.yml` has what it needs. The steps below are what to run on the next
account, and what to read when something about this one looks wrong.

The same Cloudflare token as production — it is account-scoped, and staging is
in the same account.

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...

# 1. Database and bucket, migrations applied, and the database id written into
#    wrangler.jsonc. Commit that change: a deploy from a clean checkout binds
#    nothing without it.
node scripts/deploy.mjs --env staging --provision

# 2. Its own secrets — all three of them. These are per Worker: production's are
#    not visible here and setting one here sets nothing there.
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET --env staging
openssl rand -base64 36 | tee /dev/tty | npx wrangler secret put RENDER_KEY --env staging
openssl rand -base64 48 | tee /dev/tty | npx wrangler secret put INVITE_KEY --env staging
npx wrangler secret list --env staging

# 3. Deploy it. This prints an eventiq-staging.<subdomain>.workers.dev URL,
#    which is a working address and is enough for everything below.
node scripts/deploy.mjs --env staging

# 4. The demo card, with a password that is not the development default.
SEED_PROMOTER_PASSWORD='...' INVITE_KEY='<the value from step 2>' \
  NEXT_PUBLIC_SITE_URL='<the URL from step 3>' \
  npm run db:seed:remote -- --env staging --i-understand-this-rewrites-production
```

`tee /dev/tty` on the render key for the same reason as
[production's](#the-operator-mints-their-own-render-key): `wrangler secret put`
reads stdin and prints nothing back, and the renderer needs the same value.

**`INVITE_KEY` is on that list twice and both are load-bearing**, which is the
thing this section used to leave out. The Worker needs it or it refuses to serve
an invite at all, and the *seed* needs it in its own environment, because
seeding writes thirty invite tokens and every one of them is sealed on the way
in. Staging's copy is a different value from production's and there is no reason
for it to be the same one — nothing sent from a staging card is a link anybody
is chasing.

**`NEXT_PUBLIC_SITE_URL` is a build-time value.** It defaults to
`https://staging.eventiq.win`, which is only right once the domain below is
attached. Until then, pass the workers.dev URL when you deploy, or the WhatsApp
chase messages and the Open Graph tags on staging will name a hostname that does
not resolve:

```bash
NEXT_PUBLIC_SITE_URL='https://eventiq-staging.<subdomain>.workers.dev' \
  node scripts/deploy.mjs --env staging
```

### staging.eventiq.win — optional

Not needed for anything. It buys a memorable address and costs a zone
permission the rest of staging does not need.

```bash
node scripts/deploy.mjs --env staging --attach-domain
```

That looks the hostname up in the **`eventiq.win` zone**, so the token needs
Zone · Workers Routes · Edit and Zone · DNS · Edit on that zone, exactly as
production's custom domain did. Cloudflare writes the record and issues the
certificate. Redeploy afterwards with
`NEXT_PUBLIC_SITE_URL=https://staging.eventiq.win`, or leave the workers.dev URL
in place and skip this entirely.

**Put a `noindex` in front of it if it is ever given a public hostname.** There
is no robots rule for a second copy of the site today, and two addresses serving
the same programme is a thing search engines resolve by picking one.

### Which Worker am I talking to

`/api/health` says, and it is the only place that does:

```bash
curl -s https://eventiq.win/api/health          # {"ok":true,"env":"production",...}
curl -s <staging url>/api/health                # {"ok":true,"env":"staging",...}
```

It reads the `EVENTIQ_ENV` var out of `wrangler.jsonc`, so it is a fact about the
Worker rather than about the hostname in front of it. That is what the
end-to-end workflow checks before it opens a browser: a staging hostname pointed
at the production Worker would pass every check made on the URL alone.

### The browser walk, from a button

`.github/workflows/e2e-staging.yml` is `workflow_dispatch` only and runs
`scripts/e2e.mjs` against staging. **It must never be pointed at production, and
there is no input that lets it be** — the address comes from a repository secret,
the job refuses anything under `eventiq.win`, and it asks `/api/health` which
environment answered. It re-seeds staging when it finishes, because the suite
leaves a fighter submitted and photographed.

Two repository secrets on top of the ones the render workflow already needs,
both set on 8 September 2026, and a third that is only wanted if the renderer is
ever pointed at staging:

| Secret | Value |
| --- | --- |
| `STAGING_URL` | the staging Worker's address, no trailing slash |
| `STAGING_PROMOTER_PASSWORD` | the `SEED_PROMOTER_PASSWORD` staging was seeded with |
| `STAGING_RENDER_KEY` | only if you want [Render tapes](#rendering-from-ci) to run against staging |

Anyone who can push a workflow can read a repository secret, which is why none
of these is the production password.

### Caching the programme

`/e/[slug]` and its fighter pages go out with
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300` — but only for a
reader with no session cookie. This is worth writing down because **where that
header is set is not where you would expect, and two of the three obvious places
do not work**:

- **On the page.** A server component cannot set a response header at all. There
  is no API for it.
- **In `proxy.ts`.** A header written onto `NextResponse.next()` is dropped by
  the time the response leaves the Worker. That was where this was written
  first; it was measured against `wrangler dev` with a probe header beside the
  cache one and neither arrived.
- **In `next.config.ts` `headers()`.** This works, and it overrides the
  `private, no-cache, no-store` that Next.js gives a dynamic page. That is the
  opposite of what the Next.js documentation promises, which says
  `Cache-Control` in the config is overwritten for pages — true on Vercel, and
  not true here, because the OpenNext adapter merges the config's headers over
  the handler's rather than under them. Verified with
  `wrangler dev` against a real build.

The "not signed in" half is a `missing: [{ type: "cookie", key: … }]` matcher on
the rule, and it is what keeps a promoter's preview of an unpublished show
private. It leans on a rule that already exists: `loadVisibleCard` gives a draft
to nobody but the promoter who owns it, so a request with no session cookie is
either a published card or a 404 — and OpenNext puts `no-store` back on any 404
regardless. `/promoter`, `/f`, `/render`, `/api` and the QR card match no rule
and are unchanged.

The trade, stated: for up to a minute after a show is unpublished, a shared cache
may still hand out the copy it had.

**Cloudflare does not cache a Worker's own response by default**, so today this
header is read by browsers and by anything else in front of the site. Making the
edge hold it as well is a Cache Rule in the dashboard — Caching → Cache Rules,
`http.request.uri.path matches "^/e/"`, Eligible for cache, respect origin
headers — and it is one of the things worth doing before a hall full of people
opens the same card at once.

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

All three are set, as of 8 September 2026. **The workflow still does not run**,
and that is not a secret that is missing: GitHub only runs a scheduled or
dispatched workflow from the **default branch**, this one lives on
`cursor/eventiq-digital-fight-programme`, and so `gh workflow run render.yml`
answers 404 and the hourly cron has never fired. Merging
[PR #1](https://github.com/gogs1998/EventIQ/pull/1) into `main` is the whole of
the fix, and the first green run is what licenses
`npx wrangler secret delete RENDER_KEY` on the Worker.

It also takes an `environment` input — `production` or `staging`. The hourly run
is always production, which is what a schedule is for; staging is something a
person picks from the dispatch form while trying something out, and it needs
`STAGING_URL` and `STAGING_RENDER_KEY` as well, because the render key belongs
to one Worker and production's opens nothing on the other. The site it captures
from and the database and bucket it writes to are chosen together from that one
input: a renderer reading one environment's capture page and writing the other's
rows would publish a key that site cannot serve.

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
npm run db:backup -- --env staging      # the staging database, into staging's bucket
```

`--env staging` takes the same flag as everything else and puts the file in
`eventiq-media-staging`, not beside production's. Nothing schedules that one and
nothing should: staging holds the demo card and is re-seeded on purpose. It is
there so a restore can be rehearsed somewhere that does not matter —
`npm run db:restore-rehearsal -- --env staging --date <date>`.

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

### Folding the counting, and the sweeps

The same machine, the same token, and the same argument for a cron line rather
than a workflow.

```cron
# 03:40 UTC nightly, after the backup. The order matters: the fold is what keeps
# the numbers, and the sweep only removes counting the fold has already summed.
40 3 * * *  cd /path/to/EventIQ && CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run analytics:rollup -- --remote --apply >> /var/log/eventiq-rollup.log 2>&1
50 3 * * *  cd /path/to/EventIQ && CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run retention -- --remote --apply >> /var/log/eventiq-retention.log 2>&1
```

`npm run analytics:rollup` sums every `analytics_events` row older than 48 hours
into a row per show, day and kind in `analytics_daily`, and removes what it
summed. **The dashboard's numbers do not move when it runs**: it reads the folded
days plus everything still in `analytics_events` and adds the two together, so a
row changing tables changes no total. Run it without `--apply` first — the dry
run names every show-day it would fold.

`npm run retention` is the sweep. It clears fighters past the retention policy
([HANDOVER.md section 6g](HANDOVER.md#6g-consent-removal-and-retention)), removes
counting rows the fold has already summed, and removes cached record pages over
thirty days old. It will **not** remove counting for a show-day that has never
been folded, whatever its age, because until the fold has run those rows are the
only copy of those numbers.

Both are **dry run by default** and both destroy data with `--apply`. Neither is
installed anywhere yet: as with the backup, the capability is not the schedule.

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

### Objects nothing points at

```bash
npm run r2:orphans                   # the local bucket, dry run
npm run r2:orphans -- --remote       # the deployed one
npm run r2:orphans -- --remote --apply
```

Every object under `fighters/`, `cutouts/`, `portraits/`, `sponsors/` and
`renders/` is reachable through one column, and `/media` refuses one that is
not — so an orphan is invisible rather than exposed, and this is a bill rather
than a hole. It never takes a `render_jobs.current_r2_key`, and it never takes
anything written in the last day, because a portrait waiting to be approved and
an upload a moment ahead of its row are both legitimately unreferenced.

**Listing a remote bucket needs an R2 API token**, because wrangler has no
command that lists objects and R2's own S3 API is what does. Make one under
**R2 · Manage R2 API Tokens** with **Object Read** on `eventiq-media`, and give
the script the pair it prints plus the account id:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
```

Read is enough. The deletes go through wrangler with the ordinary deploy token,
so the listing credential never needs to be able to remove anything.

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

- [x] **Rotate the Cloudflare API token, and drop Cloudflare Pages · Edit while
      you are in there.** Done 8 September 2026. The new token carries the four
      account rows — Workers Scripts, D1, R2, Account Settings — no zone row and
      no Pages, and it is the `CLOUDFLARE_API_TOKEN` repository secret beside
      `CLOUDFLARE_ACCOUNT_ID`. `node scripts/deploy.mjs --check` passes on it and
      two production deploys have run through it.
      **Still open, and it is the owner's:** the token it replaced is the one
      that was handled in chat during the build, it is still live in the
      dashboard, and it has to be deleted there — My Profile → API Tokens →
      Delete. A rotation that leaves the old key valid is not a rotation.
- [ ] **Turn on "Always Use HTTPS"** — SSL/TLS → Edge Certificates, for
      `eventiq.win`. **Owner, in the zone dashboard.** One toggle. Static files
      under `public/` and `_next/` are answered by the assets binding before the
      Worker runs, so the redirect in `proxy.ts` cannot reach them and
      `http://eventiq.win/fighters/*.webp` answers 200 over plain http today. The
      deploy token has no zone permission at all now, so this is not scriptable
      from here even in principle. [The detail](#https-at-the-edge).
- [ ] **Add the `/e/*` cache rule**, in the same dashboard visit and for the same
      reason: Caching → Cache Rules, `http.request.uri.path matches "^/e/"`,
      Eligible for cache, respect origin headers. The Worker already sends
      `public, s-maxage=60, stale-while-revalidate=300` on a published programme
      and Cloudflare does not cache a Worker's own response without being told
      to, so today that header is read by browsers and by nothing at the edge.
      This is the one worth having before a hall full of people opens the same
      card at once. [Caching the programme](#caching-the-programme).
- [ ] **Run the invite backfill.** **Owner.**
      `INVITE_KEY='...' npm run db:migrate-invites -- --remote`, after the
      `--dry-run` that currently counts **30 invites still in the clear**.
      `INVITE_KEY` is on the Worker and the schema and the code are deployed, so
      this is the last of the four steps and the only one outstanding.
      [The invite backfill](#the-invite-backfill).
- [ ] **Merge [PR #1](https://github.com/gogs1998/EventIQ/pull/1) into `main`,
      then confirm the hourly render actually runs.** **Owner.** GitHub runs a
      scheduled or dispatched workflow from the default branch only, so until the
      merge `gh workflow run render.yml` answers 404, the hourly cron has never
      fired, and `e2e-staging.yml`'s button does not exist either. Confirm with a
      dispatch and a look at `render_jobs` rather than by assuming the cron.
- [ ] **Then delete the legacy `RENDER_KEY` Worker secret** —
      `npx wrangler secret delete RENDER_KEY`. **Owner.** The runner's own
      unscoped key was minted on 8 September 2026 and is in the repository
      secret, so the migration is three-quarters done; what is left is retiring
      the one credential that reads every promoter's cards with no row behind it.
      Not before the workflow has rendered once, because deleting first would
      leave nothing able to render if the minted key were wrong.
      [Render keys](#render-keys-are-rows-now-and-the-secret-is-the-migration-path).
- [ ] **Put the secrets in a password manager.** **Owner**, and none of these can
      be read back out of a Worker:
      - `SESSION_SECRET` (production). Rotating it signs the promoter out, which
        is the whole of the revocation story and is deliberate. Signing out one
        account instead is `npm run promoter -- set-password`, which bumps that
        promoter's `session_version` and leaves everyone else alone.
      - `INVITE_KEY` (production), **the one that cannot be replaced.** Rotating
        it stops every link already sent out and leaves the dashboard unable to
        show what the old ones were, so a lost one means every fighter on every
        live card being sent a new link by hand.
      - Staging's `SESSION_SECRET`, `INVITE_KEY` and `RENDER_KEY`, plus the
        `SEED_PROMOTER_PASSWORD` staging was seeded with — which is also the
        `STAGING_PROMOTER_PASSWORD` repository secret.
      - The runner's minted render key, which is in the `RENDER_KEY` repository
        secret and is printed exactly once. Anyone who can push a workflow can
        read a repository secret; that is the trade for the videos being made
        without a person.
- [ ] **Point an external uptime check at `/api/health`.** Anything that will
      send a message to a phone — a free tier is fine. Nothing here phones home,
      so a 500 on show night stays a 500 until somebody happens to log in, and
      that has already happened once: the PBKDF2 failure was live and invisible
      until a person tried to sign in. It has to be *external*; a check running
      on the same thing it is checking answers no useful question. The route
      itself answers 200 in production as of 8 September 2026, so there is
      something to point at now.
- [ ] **Confirm the nightly backup actually ran**, rather than that it is
      scheduled. A backup was taken by hand before the 8 September rollout —
      `eventiq-media/backups/2026-09-08.sql`, with a copy kept off the account —
      but **nothing schedules one**, so that is a habit rather than a mechanism.
      `npm run db:restore-rehearsal -- --date <yesterday>` is the version of the
      question worth asking, because it also proves the file restores.
      [Backups](#backups). Set the [lifecycle rule](#the-r2-lifecycle-rule) at
      the same time, or the bucket keeps every export forever.
- [ ] **Reprint the table card from the live URL.** The QR encodes the origin it
      was served from, so one printed off a laptop is useless at a venue.
- [ ] **Get the consent wording legally reviewed**, and settle the lawful basis
      and the controller/processor position. **Owner, and it needs a lawyer
      rather than a commit.** It is on this list because a real fighter's
      photograph and age go on a page a promoter sells sponsorship against, and
      because it blocks the first real show rather than following it.
      [HANDOVER.md section 19](HANDOVER.md#19-what-to-build-next) item 2.
- [ ] **Decide the commercial model.** **Owner.** Nothing in the product prices
      anything, there is no billing, and per-bout sponsorship — the strongest
      argument in the pitch — is revenue the promoter collects rather than
      EventIQ. What a promoter pays and for what is undecided, and it wants
      deciding before a promoter asks rather than during the conversation.

Consent wording, the lawful basis and the retention policy used to be kept off
this list on the grounds that they are product rather than operations. They are
on it now, because "we cannot put a real fighter on here yet" is an operational
fact whatever kind of work fixes it, and because it is the item most likely to be
found at the last minute. The rest of that half is
[HANDOVER.md section 19](HANDOVER.md#19-what-to-build-next) items 1 and 2.

## What is left to do

Nothing is blocking the site. As of **8 September 2026** the production Worker
runs on a fresh account-scoped token, every migration through `0013` is applied,
`INVITE_KEY` is set, staging exists, and `https://eventiq.win` serves the card
out of D1 with the cache, CSP and HSTS headers it is meant to have. The
[rollout log](#rollout-log--8-september-2026) is the sequence.

This list is operational. The product roadmap — starting with getting a real
show onto the platform, with consent as the gate — lives in
[HANDOVER.md section 19](HANDOVER.md#19-what-to-build-next). Putting the
render pipeline on Cloudflare Containers is a roadmap item there and in
section 11, not something a deploy does.

What is still open, and who does it:

1. **Delete the old API token in the dashboard.** *Owner.* The replacement is in
   use and in the repository secrets; the one that was handled in chat during the
   build is still valid until somebody removes it. My Profile → API Tokens.
2. **Run the invite backfill.** *Owner.*
   `INVITE_KEY='...' npm run db:migrate-invites -- --remote`. A dry run reports
   30 invites still in the clear. Every one of those links works and will go on
   working — the table is in the supported half-migrated state — but the sealing
   is the point of the key. [The invite backfill](#the-invite-backfill).
3. **Merge [PR #1](https://github.com/gogs1998/EventIQ/pull/1) into `main`, and
   confirm the hourly render runs.** *Owner.* GitHub runs scheduled and
   dispatched workflows from the default branch only, so `render.yml`'s cron has
   never fired and `gh workflow run render.yml` answers 404. The three secrets it
   needs are all set; the branch is the only thing missing.
4. **Delete the legacy `RENDER_KEY` Worker secret, after 3.** *Owner.*
   `npx wrangler secret delete RENDER_KEY`. The runner holds a minted unscoped
   key already, so this retires the last credential that reads every promoter's
   cards without a row behind it. Not before a green render, because deleting
   first stops every render until the new key is proven.
5. **Turn on "Always Use HTTPS", and add the `/e/*` cache rule.** *Owner, in the
   zone dashboard.* Static files are still served over plain http and no
   application code can fix that; the cache rule is what makes the edge honour a
   header the Worker already sends. **The deploy token has no zone permission at
   all**, by design, so neither is scriptable from here.
   [HTTPS at the edge](#https-at-the-edge),
   [caching the programme](#caching-the-programme).
6. **Password manager entries** for `SESSION_SECRET`, `INVITE_KEY`, staging's
   three secrets and the runner's minted key. *Owner.* None can be read back out
   of a Worker and `INVITE_KEY` cannot be replaced without reissuing every link.
   The full list is in
   [before the first real show](#before-the-first-real-show).
7. **Legal review of the consent wording**, plus the lawful basis and the
   controller/processor position. *Owner, and a lawyer.* Blocks a real fighter's
   details going on the platform. HANDOVER section 19 item 2.
8. **The commercial model.** *Owner.* Undecided, and worth deciding before a
   promoter asks rather than during the conversation.
9. **Reprint the table card from the live URL.** The QR encodes the origin it
   was served from, so one printed from a laptop is useless at a venue.
10. **Render the tapes into R2.** The programme falls back to playing the
    sequence live in the browser where no mp4 exists, so this is a quality step
    rather than a fix, and item 3 is what makes it happen on its own. See
    [video rendering](#video-rendering).

Done on 8 September 2026, and no longer on this list: the API token rotated and
narrowed to four account permissions with no zone row and no Pages; a backup
taken before anything else; migrations `0002` to `0013` applied to production;
`INVITE_KEY` set on the Worker; two production deploys carrying the showcase
slug, the portrait flag and the environment var; the runner's render key minted
and set as a repository secret; and staging provisioned, migrated, secreted,
deployed and seeded with `STAGING_URL` and `STAGING_PROMOTER_PASSWORD` set.
Before that: the `eventiq-photos` bucket deleted, the promoter password and
`SESSION_SECRET` rotated, and the PBKDF2 iteration count brought down to
something the runtime will run.

## Rolling back

```bash
npx wrangler deployments list
npx wrangler rollback [deployment-id]
```

Rolling back the Worker does not roll back the database. Migrations are additive
and there is no down-migration path, which is a deliberate limit rather than an
oversight at this size: reverting a schema change means writing the SQL to
reverse it.
