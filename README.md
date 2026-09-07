# EventIQ

Digital fight programmes for amateur MMA. Running at **https://eventiq.win**.

> Picking this up cold? Read [HANDOVER.md](HANDOVER.md) first. It covers the reasoning behind each decision, what was tried and rejected, the open questions, and what to do next. This file covers how to run things, and [CLAUDE.md](CLAUDE.md) covers working in here: the rules that are load-bearing, the environment traps, and how the project got its shape.

Spectators scan a QR code at the venue and open the full running order for that show. Every bout expands into a tale of the tape, and the ones that matter come with a broadcast-style video built from the fighters' own photos.

The show data is real — a database, real fighter questionnaires, a promoter login, real interaction counting. The **content** is invented: Cage County 12 is a made-up show with made-up fighters, seeded so there is something to demonstrate.

## The problem

Amateur shows run on paper. A real programme from a real event gives you a fighter's name, their gym, and their weight class. That is it. No record, no photo, no story, and nothing for the gyms, fighters or sponsors to take home. The punter in row four claps politely because there is nothing else to do.

## What is here

| Route | What it is |
| --- | --- |
| `/` | The pitch page. The recorded walkthrough, the main event video, and a gallery of every screen |
| `/e/[slug]` | The programme. 15 bouts, main event first, tap any bout for the tape |
| `/e/[slug]/f/[fighter]` | A fighter profile, deep-linkable from an Instagram bio |
| `/e/[slug]/qr` | The printable table card |
| `/f/[token]` | A fighter's questionnaire, reached by their own invite link |
| `/f/demo` | The questionnaire as a walkthrough, saving nothing |
| `/promoter` | The promoter's area, behind a password |
| `/render/[slug]/[bout]` | Capture surface for the video exporter. Needs the render key, or the promoter who owns the show |

## Architecture

Next.js on **Cloudflare Workers** via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with **D1** for data, **R2** for photographs and rendered video, and **Drizzle** for the schema and migrations. Authentication is Web Crypto and nothing else: a PBKDF2 password hash and an HMAC-signed cookie for the promoter, an unguessable token in the URL for the fighter.

Video rendering is the one part that does not run on Cloudflare, because headless Chrome and ffmpeg cannot. It is an out-of-band job; see [rendering](#rendering-video) below and section 11 of the handover.

## Running it

```bash
npm install
cp .dev.vars.example .dev.vars     # SESSION_SECRET, RENDER_KEY and the seed password
npm run db:reset                   # migrate and seed the local database
npm run dev
```

Then open http://localhost:3000. `next dev` gets real local D1 and R2, so the questionnaire saves, photographs upload and interactions are counted without deploying anything. State lives under `.wrangler/`.

The seed prints the promoter password and a few invite links. Sign in at `/promoter/login` as `cage-county`.

```bash
npm test           # 203 unit tests in 15 files, about a second
npm run lint
npm run typecheck
npm run build
```

Those four are what [CI](.github/workflows/ci.yml) runs on every push and every pull request, on the Node version in [`.nvmrc`](.nvmrc), so a green tick means the same thing there as it does here. Use `npm run typecheck` rather than `tsc --noEmit`: it runs `next typegen` first, and without that a clean checkout reports eight errors about `PageProps` that have nothing to do with your change.

To run against the actual Workers runtime rather than Node:

```bash
npm run preview    # opennextjs-cloudflare build, then its own preview server
```

or the two halves separately, which is what you want if you are rebuilding repeatedly:

```bash
npx opennextjs-cloudflare build
npx wrangler dev --port 8788 --local
```

**Not at the same time as `npm run dev`** — both open the same local SQLite file and the second one takes the first down.

`npm run cf-typegen` regenerates `cloudflare-env.d.ts` from `wrangler.jsonc`. It is not part of any other command and the file it writes is gitignored: [`env.d.ts`](env.d.ts) declares the bindings by hand instead, because the generated version is 580KB of runtime declarations for a handful of bindings that change about once a year. Run it when you are debugging a binding type and want to see what wrangler thinks it is.

## The end-to-end walkthrough

```bash
npm run e2e -- --base http://localhost:8788
```

Drives a browser through 25 steps: sign in, check the renderer's capture page is shut to a stranger and open to the render key and to the promoter who owns the show, add a bout, watch it appear on the public card, remove it, open a fighter's invite, type, reload, upload a photograph and fetch it back out of the bucket, submit, see it on the programme, see the dashboard notice, watch the counts go up, import a Sherdog record, and be locked out again after signing out. Screenshots land in `/tmp/e2e`.

## The tale of the tape

The centrepiece. A still photograph and a row of numbers become a 16 second vertical sequence: bout billing, each corner revealed in turn, a head to head with the stats counting up and the leading side highlighted, then a closing hook drawn from the data.

Two things make it work.

**Depth from a flat photo.** Every portrait goes through background removal to produce a transparent cutout. The cutout and the backdrop then move at different rates, which reads as parallax rather than a photograph sliding around.

That happens in the render pipeline, not in the upload: background removal is an ONNX model and several seconds of CPU per image, which a Worker cannot run at all and a fighter's phone should not be asked to. So `npm run render` cuts out anybody who has sent a photograph and has no cutout of it, and until it does the sequence shows the photograph — soft-masked, vignetted and moved a third as far, because a rectangle travelling over a drifting backdrop is the thing the parallax exists to avoid. The initialled "photo to follow" plate is only for a fighter who has sent nothing at all. The order lives in [`lib/portrait.ts`](lib/portrait.ts).

**One composition, two outputs.** [`components/sequence/TaleOfTheTape.tsx`](components/sequence/TaleOfTheTape.tsx) is a pure function of its props, of which one is a frame number. There are no CSS animations and no timers; all motion is interpolated in JS from `frame` using the helpers in [`lib/anim.ts`](lib/anim.ts). That single constraint buys both playback modes:

- **In the page**, [`TapePlayer`](components/sequence/TapePlayer.tsx) advances `frame` with `requestAnimationFrame`.
- **As an mp4**, [`scripts/render-tape.mjs`](scripts/render-tape.mjs) opens `/render/[slug]/[bout]` once in headless Chrome, then drives `window.__setFrame` and screenshots the viewport 480 times, streaming the frames into ffmpeg.

Because the composition is deterministic, those two are the same picture.

## Half-filled profiles are the normal case

Getting fighters to return the questionnaire is the actual hard problem, not the web page. Two consequences run through the code.

**Nothing may look broken when a fighter has told us nothing.** [`buildTape`](lib/tape.ts) keeps a row if *either* corner can fill it and drops it only when neither can, missing portraits get a designed placeholder rather than a gap, and `completeness()` drives an honest progress score. Note that `isDebut()` requires an explicit `0-0-0`: silence is not a debut, because announcing a veteran as a debutant is worse than saying nothing. The database enforces the same thing — a record is all three numbers or none of them.

**The form is ordered to be finished.** Nickname, photo, Instagram and sponsors first; height, reach and record last. A form that opens with "reach in centimetres" does not get completed. The fighter watches their own card build as they type, and the reward for finishing is a video of it.

The seeded card is deliberately uneven for the same reason: the top of the bill is what it looks like when fighters send their details in, and the openers are a name and a gym, exactly like the paper programme.

## The promoter's view

Behind a password. A chase list ordered by position on the card, bout-level readiness, the bout sponsor slots still unsold, and the counts for this show and the last one. Everything on it is derived by [`lib/promoter.ts`](lib/promoter.ts) from the same rows the programme reads, so the two cannot disagree.

The nudge button copies a message ready to paste into WhatsApp, naming the fighter's bout, their opponent and their own invite link, and saying the other one has already sent theirs only where [`tapeGapsBehind`](lib/tape.ts) says that is true.

Invite status comes from timestamps on the invite row, not from how full the profile looks. A record and an age come off the promoter's own entry form, so anyone with those but nothing else reads as "not opened" rather than as somebody who looked and gave up — which is the one distinction the page exists to draw.

The card editor writes: event details, bouts, fighters, sponsors, invite links and the publish toggle.

## The database

```bash
npm run db:generate         # migrations from db/schema.ts
npm run db:migrate          # apply them to the local database
npm run db:migrate:remote    # apply them to the live one
npm run db:seed             # the demo card, with fresh invite tokens
npm run db:reset            # both
npm run db:studio -- "select count(*) from fighters"
```

[`db/schema.ts`](db/schema.ts) is the single description of the schema. The seed is generated from `data/event.ts` at run time and never committed, because it contains working invite tokens.

`db:migrate:remote` is there for a schema change that needs applying without a deploy. It is not the usual path: `npm run deploy` applies pending migrations itself, before the Worker goes up, because the Worker expects the schema that ships with it. See [DEPLOY.md](DEPLOY.md).

Seeding the live database is deliberately awkward, because it is a rewrite rather than an insert — it deletes the promoter, their sponsors, the show and its fighters, and reissues every invite token. It wants a password, a flag spelled out in full, and a live database that still holds nobody but the seeded promoter:

```bash
SEED_PROMOTER_PASSWORD='...' npm run db:seed:remote -- --i-understand-this-rewrites-production
```

### Backups

```bash
npm run db:backup                                   # export the live D1 into R2, as backups/<date>.sql
npm run db:restore-rehearsal -- --date 2026-09-07   # load it into a scratch database and count the rows
```

D1's time travel goes back thirty days and lives in the same account as the database, which is a recovery mechanism rather than a backup. The export is a plain `.sql` file somebody can open and count. The rehearsal exists because a backup nobody has restored is a hope, and it found something on its first run: a D1 export cannot be fed straight back in. [DEPLOY.md](DEPLOY.md#backups) has the reasons, the cron line and the R2 lifecycle rule.

## Rendering video

```bash
npm run render -- --slug cage-county-12 --list              # what needs doing
npm run render -- --slug cage-county-12 --bout 15 --publish
npm run render -- --slug cage-county-12 --stale --publish --remote
```

Reads the running order from D1, captures the frames, puts the mp4 in R2 and records the key in `render_jobs`, which is where the programme looks for it. `--stale` renders only the bouts whose fighters have changed since the last render. One bout is about a minute.

It needs `RENDER_KEY` — the capture page it screenshots serves cards that are not published yet, so it is not public. Locally that comes out of `.dev.vars`; against the deployed site export it to match the Worker secret. See section 6c of the handover.

`--bout 15 --still 300` dumps a single frame as a PNG, which is the quickest way to iterate on the composition.

Cutouts are made first, and can be made on their own:

```bash
npm run cutouts -- --slug cage-county-12 --remote
npm run cutouts -- --slug cage-county-12 --remote --refresh-cutouts
```

[`scripts/cutouts.mjs`](scripts/cutouts.mjs) is idempotent, never regenerates a cutout that exists, and never fails a render: a photograph it cannot handle is logged and the video falls back to the photograph. `--list` on the renderer says which bouts have a photograph still waiting.

## Regenerating assets

```bash
npm run assets     # optimisation of the curated art in assets-src/
npm run icons      # favicon, apple icon and the manifest icons
```

Only the optimised output in `public/` is committed. `npm run icons` is the exception to everything below it: the mark is a geometry definition inside [`scripts/make-icons.mjs`](scripts/make-icons.mjs) and every icon is emitted from it, so that one can always be rerun.

**`assets-src/` is gitignored, so on a fresh clone `npm run assets` has nothing to work on.** The sources exist on the machine the demo artwork was made on and nowhere else, which means the committed files in `public/` cannot be regenerated from this repository — a new portrait or a re-crop needs the originals from that machine, or new originals. That was a reasonable trade while the inputs were large generated images and the outputs were the only thing anyone needed; it stops being reasonable the moment somebody has to change one. It is written down here rather than quietly discovered.

This is for the demo card's artwork. Cutouts for photographs a fighter actually sends are made by the renderer, above, from what is in R2 — that path does not depend on `assets-src/` at all.

## Recording the sales demo

Promoter pitches happen over WhatsApp more than in person, so a recording of the flow is a deliverable in its own right. [`scripts/tour.mjs`](scripts/tour.mjs) scripts it: Chrome runs in app mode at phone dimensions so there is no tab strip or address bar in shot, and the scroll and pause timings live in the script so a take is repeatable.

```bash
node scripts/tour.mjs setup     # chrome-less phone-shaped window
node scripts/tour.mjs tour      # run the walkthrough while recording the screen
node scripts/tour.mjs teardown
```

Crop the capture to the window afterwards. The committed cut at `public/demo/eventiq-demo.mp4` predates the database and needs re-recording.

## Product screenshots

The gallery on the pitch page uses real captures of the running app, not mockups.

```bash
npm run shots                                  # public/screens + app/opengraph-image.jpg
npm run shots -- --review /promoter            # full-page PNG at 390 and 1280, for eyeballing
```

## Deploying

[DEPLOY.md](DEPLOY.md) has the full procedure. In short: create the D1 database and the R2 bucket, put `SESSION_SECRET` and `RENDER_KEY` in place, seed a promoter, then `npm run deploy`.

```bash
node scripts/deploy.mjs --check    # what the current token can and cannot do
```

**Live at https://eventiq.win.** `npm run e2e -- --base https://eventiq.win` walks the whole product against it. Note that it writes as it goes, so it is not something to point at a card a promoter is using.

## What is real and what is not

Every fighter, gym and event here is invented, and the portraits are generated images. Three sponsors are real brands — Mouthguards.pro, FightIQ.win and EventIQ — and nothing is claimed about them that has not been said. Swap in real photographs before showing this to a specific promoter.

There is no email or SMS, so invite links are copied and pasted by the promoter. There is no self-service signup; promoter accounts are created by the seed. Video rendering runs outside Cloudflare and is not part of a deploy.
