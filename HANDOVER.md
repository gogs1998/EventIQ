# EventIQ — handover

Written so this can be picked up in a fresh session with no prior context. Covers what exists, why it is the way it is, what was tried and rejected, what is still open, and what to do next.

Companion to the [README](README.md), which covers how to run things. This document covers *why*.

---

## 1. The idea, in the originator's words

> I go to amateur MMA events and it's great, but paper programmes on the table with the fighter's name, gym and weight class. My idea is a digital programme for each event — spectators scan a QR code, taken to a web page with a full digital programme. People want a reason to root for someone, so we send out questionnaires to all fighters: bio, stats, record, photo etc. They fill it in and we create a tale of the tape for every fight, expandable in the app. We can add their sponsors and Instagram too so they are motivated to fill it in. Also the promoters get a pro looking [programme] and can feature their sponsors.

Two refinements came later in the same conversation and both changed the build materially:

- **"I like the idea of video generation of the still photos for the TOTT like UFC."** This became the centrepiece, not a garnish.
- **"It's just an idea, but we need it to look spectacular to sell it to promoters."** This reframed the whole thing from *system* to *pitch artifact*. Operational completeness was traded away for visual impact, deliberately and repeatedly.

A third input was a **photograph of a real programme** from an actual event (BUDO 79, Grangemouth Town Hall). It is not in the repo, but what it taught us is in section 5. It is the single most valuable piece of input received and it is worth getting more like it.

---

## 2. Current state

Working demo, branch `cursor/eventiq-digital-fight-programme`, [PR #1](https://github.com/gogs1998/EventIQ/pull/1) (draft). Build, lint, typecheck clean; 55 unit tests passing.

| Route | What it is | Notes |
| --- | --- | --- |
| `/` | Pitch page and shop window | The recorded walkthrough, the main event video, a screenshot gallery |
| `/e/cage-county-12` | The programme | Flagship screen. 15 bouts, main event first, each expands to the tape |
| `/e/cage-county-12/f/[fighter]` | Fighter profile | Deep-linkable, intended for an Instagram bio |
| `/f/demo` | Fighter questionnaire walkthrough | Live preview; saves nothing |
| `/promoter` | The promoter's view | Chase list, bout readiness, unsold sponsor slots. See section 9a |
| `/qr` | Printable table card | QR generated client-side from current origin |
| `/render/[bout]` | Capture surface for the video exporter | Not linked from anywhere |

**Deliverables that exist:** the running demo, a static export (`npm run build` → `out/`), five pre-rendered vertical mp4s, and a 76-second sales recording (see section 9).

**The domain `eventiq.win` has been bought but the site is not live.** The deploy is prepared and blocked on credentials; see section 9b and [DEPLOY.md](DEPLOY.md).

**What does not exist:** any backend. No database, no accounts, no persistence, no admin, no email or SMS. The questionnaire is a walkthrough.

---

## 3. Stack and the reasoning behind each choice

- **Next.js 16.3 App Router, TypeScript, Tailwind 4.** Single app at repo root, no monorepo.
- **`output: "export"`** — static export. Chosen because a pitch demo must not have a server that can fall over mid-meeting, and because it drops onto any host later as a one-liner. This is load-bearing: it is *why* there is no database and no server actions. If a backend is added, this comes out first.
- **No database.** Content lives in a typed fixture at [data/event.ts](data/event.ts). For a pitch this is strictly better: nothing to seed, nothing to migrate, nothing to break. A real build needs Postgres; see section 12.
- **`devIndicators: false`** in [next.config.ts](next.config.ts). Not cosmetic — the video exporter screenshots the running dev server, and the Next.js dev badge was being burned into every frame of the video.
- **`images: { unoptimized: true }`** — required by static export, and all imagery is pre-optimised anyway.

Fonts are Anton (display), Oswald (body), Roboto Mono (labels), loaded via `next/font`. Design tokens are in [app/globals.css](app/globals.css) under `@theme`.

**Design direction: broadcast graphics, not a website.** Near-black ground, hard red-corner/blue-corner colour coding, condensed uppercase display type, tabular numerals (so stat counters do not reflow while ticking), film grain overlay. Full sentences are set in Oswald, never in Anton — an early version set hook lines in the condensed display face and they were unreadable and collided.

---

## 4. The tale of the tape — the important part

This is the centrepiece and the bit most likely to be broken by a careless change.

### The sequence

16 seconds, 480 frames at 30fps, 1080x1920 vertical. Scene boundaries live in [components/sequence/timeline.ts](components/sequence/timeline.ts):

| Scene | Frames | Content |
| --- | --- | --- |
| `billing` | 0–70 | Promoter mark, "MAIN EVENT", title, class line |
| `red` | 62–178 | Red corner reveal: cutout, name slam, nickname, gym, record ticking |
| `blue` | 170–286 | Same, mirrored |
| `headToHead` | 278–410 | Both fighters across a centre seam, stat rows staggering in and counting up |
| `close` | 402–480 | Hook lines, bout sponsor, event lockup |

Scenes overlap by 8 frames to crossfade.

### The two ideas that make it work

**Depth from a flat photograph.** Every portrait is background-removed into a transparent cutout at asset-prep time. In the sequence the cutout and the backdrop move at *different rates*, which reads as parallax rather than a photo sliding around. Plus a slow camera push, a light sweep and drifting embers. No AI video model, no per-clip cost, works for every fighter automatically. If a cutout is missing, the sequence falls back to an initialled "photo to follow" plate and still plays.

**One composition, two outputs.** [components/sequence/TaleOfTheTape.tsx](components/sequence/TaleOfTheTape.tsx) is a **pure function of a frame number**. No CSS animations, no timers, no state. All motion is interpolated in JS from `frame` using [lib/anim.ts](lib/anim.ts). Even the embers are seeded from their index so they are identical on every render of a given frame.

> **Do not add CSS animations, transitions or timers to this component.** Doing so silently breaks the mp4 exporter, because captured frames would no longer be deterministic and the video would stutter or judder rather than fail loudly.

That constraint buys both playback modes:

- **In the page:** `requestAnimationFrame` advances `frame`.
- **As mp4:** [scripts/render-tape.mjs](scripts/render-tape.mjs) opens `/render/[bout]` **once** in headless Chrome, then drives `window.__setFrame(n)` and screenshots the viewport 480 times, streaming JPEGs into ffmpeg. Navigating once and driving frames is far faster than 480 page loads and guarantees identical page state throughout.

`/render/[bout]` renders [RenderStage](components/sequence/RenderStage.tsx), which exposes `window.__setFrame`, `window.__duration` and `window.__ready` (set once fonts and images have settled), and hides the page-wide grain overlay because that is viewport-sized and would not scale with the composition.

### Why not Remotion

Remotion does exactly this and does it better. It was rejected on licensing, not technical grounds. It is free for individuals and organisations of up to three people; beyond that, **both** an automated render pipeline **and** embedding its Player fall under "Remotion for Automators" at $0.01 per render with a $100/month minimum. That is an affordable cost but a poor dependency to place directly on the core feature of a product with no customers yet. With ffmpeg and Chrome already present the capture loop is about 150 lines.

Because the composition is frame-driven either way, **adopting Remotion later swaps the render harness rather than requiring a rewrite.** If the sequences get elaborate enough to want its tooling, that door is open.

---

## 5. What the real programme photo taught us

A photo of an actual amateur card (BUDO 79) changed the data model partway through. Worth internalising, because it means the mental model of "an MMA show" was wrong:

- **These are mixed cards.** C-class Muay Thai, semi-pro boxing and amateur MMA on the same bill. So `discipline` and `classLabel` are **per bout**, not properties of the event. Weights are in **kg**, and promoters use round catchweights (57, 61, 66, 70, 77, 84) rather than named divisions.
- **They run to 15 bouts.** The photo was "page 2 of 2" starting at bout 10. An eight-bout demo was unrealistically short.
- **Every individual bout carries its own sponsor.** Each small bout card on the paper programme had a sponsor logo in its corner (JTM, Moore Equipment Hire, AP Nutrition). This is a revenue line promoters *already sell*, and it was missed entirely until the photo arrived. It is now the strongest commercial argument in the pitch: on paper a bout sponsor gets a logo the size of a stamp; here they get the bout and they close out its video.
- **Structure and vocabulary:** "RUNNING ORDER" as the header, numbered bouts, `CO MAIN` and `MAIN EVENT` as full-width cards with the title on the line, sanctioning body in the header, "SHOW SPONSORS" strip at the foot. All mirrored in the app.
- **It confirmed the premise exactly.** Name, gym, weight class. No records, no photos, no nicknames.

**Action: get more of these photos.** Every one is likely to contain another detail like the per-bout sponsors.

---

## 6. Where the content lives

[data/event.ts](data/event.ts) holds three exports: `sponsors`, `fighters`, `event`. Types in [lib/types.ts](lib/types.ts).

Almost every field on `Fighter` past `name` and `gym` is **optional**, because on a real card most of them are missing for most of the bill. This is the central design constraint of the whole product, not an edge case.

### The demo card

**Cage County 12**, Winter Gardens Blackpool, Sat 14 Nov 2026. Promoter: Cage County Promotions. 15 bouts, 31 fighters.

Completeness is **deliberately uneven**, and this is a feature of the pitch rather than unfinished work:

- **Main event, co-main, bouts 12 and 13** — fully filled in, with photos. This is what it looks like when fighters send their details.
- **Bouts 10 and 11** — one fighter complete, the other sent nothing. Bout 11 (Farrukh vs Baines) is the showcase for this: her column is full, his is a row of dashes.
- **Bouts 1–9** — a name and a gym, exactly like the paper programme.

**The gap between the top and bottom of the card is the pitch.** Do not "fix" it by filling everyone in. It is called out explicitly on the pitch page.

### Real vs invented

Everything is invented **except** three real sponsors, which lead the show-sponsor strip and the table card:

- **Mouthguards.pro** — strapline "Custom fitted". Sponsors Reeves and the co-main.
- **FightIQ.win** — **no strapline, because nobody has said what it does.** See open questions.
- **EventIQ** — strapline "Digital programmes", links to `/`. Bout sponsor of the main event, so it closes out the flagship video.

All three appear *inside* the main event video, which is where the value is.

Sponsor logos are **emblems only**, with names set in the app's own typography. This is deliberate: image generators misspell text, and a sponsor's name must never be wrong.

---

## 7. The derivation layer

[lib/tape.ts](lib/tape.ts) turns fields into a story. Both the static card and the video read from it, so they cannot disagree. Unit tested in [lib/tape.test.ts](lib/tape.test.ts).

Key functions:

- **`buildTape(bout)` / `buildTapeFrom(red, blue)`** — the side-by-side rows. A row survives if **either** corner can fill it and is dropped only when neither can. Half-filled rows show an em dash and no leader. Contested rows (record, height, reach, finishes) get a `leader` and an `edge` like `+11cm`. Age is deliberately *not* contested — younger is not better.
- **`buildHooks(bout)`** — up to three story lines, weighted and sorted: belt on the line, two debutants, nobody has lost, reach advantage, gym clash, hometown derby, experience gap, finish rate, southpaw vs orthodox. Returns `[]` rather than inventing something from an empty pair.
- **`completeness(fighter)`** — weighted score out of 100 plus the list of what is missing. Photo is worth 30, because it is what carries the card.
- **`tapeGapsBehind(mine, theirs)`** — lines the *opponent* answered and this fighter did not. Powers the questionnaire's competitive prompt.

### The bug worth never reintroducing

`isDebut()` requires an **explicit** `0-0-0` record. A test caught the naive version, which treated a *missing* record as a debut — meaning anyone who ignored the questionnaire would be advertised as making their debut. That would eventually put an eight-fight veteran on screen as a debutant in front of a room that knows better. **Silence is not a debut.** Same principle applies anywhere else absence gets interpreted as a value.

---

## 7a. Importing a record from Sherdog or Tapology

Idea from the originator: *"they could just send their Sherdog link and autopopulate."* Implemented as a demo in [lib/fighter-import.ts](lib/fighter-import.ts) and wired into section 03 of the questionnaire. The real fetch is stubbed, because parsing HTML needs a server and this is a static export.

### What the research found

- **Sherdog has no public API.** Verified: no `/api/`, no autocomplete, no JSON endpoints, and `/search/results` 404s. Don't waste time probing for one.
- **Scraping a profile is straightforward.** `/fighter/Name-ID` returns fully-rendered HTML with `itemprop` microdata intact and does not trip a bot challenge. It carries nickname, DOB, age, nationality, height, weight, weight class, association/team, and the win/loss/draw record broken down by KO/TKO, submission, decision and other. There is a **separate amateur bout table**, which is the one we care about.
- **Tapology is probably the better primary source for this audience.** It maintains dedicated UK & Ireland *amateur* rankings by weight class with amateur records, whereas Sherdog skews professional. Most fighters on a card like Cage County 12 are more likely to be on Tapology than Sherdog. Support both; do not assume Sherdog is the default.
- **Smoothcomp** is a competition platform rather than a record database, so it is no use for records. But it is widely used by UK amateur promotions for registrations, which makes it interesting for a *different* reason: that is where the promoter's roster already lives. Importing a whole card from Smoothcomp would beat importing fighters one at a time. Worth investigating as a partnership or integration.

### Design decisions

- **It fills the boring section only, and that is the point.** The form is already ordered fun-first, tape-last. Record, finishes, height, age and gym are almost exactly what these sites carry; sponsors, Instagram, walkout song, story and photo are not. So the import removes precisely the friction that kills completion while leaving intact the fields that create engagement and give a fighter a reason to bother.
- **Imported values are suggestions, not facts.** Amateur records on both sites go stale. Every imported field is badged with its source and has to be confirmed. Same principle as `isDebut`: never publish a claim about a fighter that we cannot stand behind, because the room knows better than the database.
- **It only fills blanks.** Anything the fighter already typed wins. Touching a field clears its source badge.
- **The error path must not dead-end.** Most amateurs have no record page at all, so a bad link says what a good one looks like *and* "no record online? Just fill the boxes in below."
- **Placement is inside section 03, not at the top of the form.** Leading with "paste your Sherdog link" would lose the flattering opening (nickname, photo) and would exclude the majority who have no page.
- **URL parsing is strict.** [lib/fighter-import.test.ts](lib/fighter-import.test.ts) covers lookalike domains — `sherdog.com.evil.test` must not match — plus missing scheme, missing `www`, query strings, and right-site-wrong-page.

### The bigger prize: the promoter does it

The most valuable version of this is not the fighter pasting their own link, it is **the promoter pasting links for the fighters who never reply**. That flips the failure mode: instead of a blank card you get real stats and merely no photo or story. It lets a promoter unilaterally raise the floor on the whole undercard, which is the single biggest weakness of the product as it stands. Build this into the promoter admin when that exists.

### To make it real

Needs a server-side endpoint that fetches the one pasted URL and parses it. Note that fetching a single page, on the fighter's own instruction, at human rate is a far more defensible posture than bulk crawling — worth keeping it that way deliberately, not by accident. Sherdog's `robots.txt` permits crawling, but robots.txt is not a licence: check terms of service before relying on this commercially, and cache aggressively so one fighter's link is fetched once. Have a manual fallback for the majority who are on neither site.

## 8. Assets

Pipeline: [scripts/prepare-assets.mjs](scripts/prepare-assets.mjs) reads `assets-src/` (gitignored) and writes optimised files to `public/`.

- Portraits → 900x1200 WebP q82, plus a background-removed cutout at 1000px wide WebP q88 with alpha.
- Sponsor emblems → black keyed out to transparent via ffmpeg `colorkey`, 320px WebP.
- Venue backdrop → 1920px WebP q72.

Background removal uses `@imgly/background-removal-node`, about 3.6s per image. It is a **devDependency that never ships** and only ever runs on local artwork — all `npm audit` findings are inside it; production dependencies are clean.

Raw generations were 28MB of PNG; committed output is 2.9MB. **Only the optimised output is committed**, so `assets-src/` being absent in a fresh clone is expected and fine.

All eleven portraits were generated images, all in one consistent style: *photorealistic studio portrait, head and shoulders, plain seamless dark charcoal backdrop, single hard rim light from the left, dramatic sports broadcast lighting, 85mm lens, no text or logos*. The plain backdrop matters — it is what makes the cutouts clean. Reuse that prompt for consistency if adding fighters.

---

## 9. The sales recording

Promoter pitches happen over WhatsApp more than in person, so a recording of the flow is a deliverable in its own right. Current cut: **65 seconds, 454x984, 2.5MB.**

Produced by [scripts/tour.mjs](scripts/tour.mjs) — a scripted walkthrough, not a human clicking around:

```bash
DISPLAY=:1 node scripts/tour.mjs setup     # chrome-less phone-shaped window
# start screen recording here
DISPLAY=:1 node scripts/tour.mjs tour      # ~72s
# stop recording here
DISPLAY=:1 node scripts/tour.mjs teardown
```

Chrome runs in `--app` mode, which removes the tab strip and address bar — the difference between looking like a product and looking like somebody's localhost. Scroll and pause timings live in the script so takes are repeatable.

**Hard-won details, all of which cost a re-record:**

- Crop the capture to the window afterwards. Last run: `crop=454:985:719:106`. This depends on where the window landed — re-measure with `xdotool getwindowgeometry`.
- The VM desktop is XFCE. Set a dark backdrop via `xfconf-query -c xfce4-desktop -p /backdrop/screen0/monitorVNC-0/workspace0/image-style -s 0`. **Plank (the dock) respawns when killed**, so do not fight it — crop it out instead.
- Minimise any other Chrome window first (`xdotool windowminimize <id>`), or it appears behind.
- **Park the mouse pointer off screen before playing the video** (`xdotool mousemove 1905 1195`). In the first attempt the cursor sat over the fighters' faces for the full sixteen seconds.
- Click **in-page** (`el.click()` via `page.evaluate`) rather than through puppeteer, which scrolls the element and ruins the framing. Likewise focus inputs with `{ preventScroll: true }`.
- Reset the window to a neutral page before recording, or the previous run's final state appears in the opening seconds.
- Trim dead air off both ends afterwards. Keep the pause on the tale-of-the-tape table — that is reading time, not dead air.

**Verify recordings with a video review before trusting them.** A browser-driving agent reported the first take as flawless; review found the embedded video skipped after four seconds, developer tools were visible in the opening frame, and the cursor sat over the picture throughout.

The finished cut is committed at `public/demo/eventiq-demo.mp4` (454x984, 2.8MB) and plays on the pitch page. The chapter list next to it in [app/page.tsx](app/page.tsx) was read off the recording itself with an ffmpeg contact sheet, not copied from the timings in `tour.mjs` — those drift, because the tour's sleeps do not account for page load or for the trim at either end. Re-derive them if the tour is re-recorded:

```bash
ffmpeg -i public/demo/eventiq-demo.mp4 -vf "fps=1/4,scale=180:-1,tile=5x4" -frames:v 1 grid.png
```

---

## 9a. The promoter's view

`/promoter` is the other half of the same fixture: the things a promoter knows that a spectator does not. Added because the pitch only ever showed the room's side, and what a promoter is actually buying is the answer to "who has not sent theirs".

Everything is derived in [lib/promoter.ts](lib/promoter.ts) from `data/event.ts`, so the dashboard and the programme cannot disagree. `data/promoter.ts` holds only what cannot be derived: invite overrides, and the previous show's engagement figures.

Four things on it, in order of how much they matter:

- **The chase list.** Ordered by position on the card rather than by how empty a profile is, because a hole in the main event costs more than a hole in bout two, and that is the order a promoter already thinks in. Each row carries a copy button that puts a WhatsApp-ready message on the clipboard.
- **Bout readiness.** Ready, one side missing, or nothing in. "One side missing" is called out hardest, because a bout with one finished fighter and one blank looks worse on the night than two blanks, which at least looks consistent.
- **Sponsor inventory.** How many of the fifteen bout slots are sold. This is the commercial hook and it is the thing the pitch page now links to.
- **Last show.** Illustrative engagement figures. This is the shape of the post-event sponsor report from section 14, sketched a page early because it is what turns bout sponsorship from a favour into a product.

`AS_OF` is pinned to fourteen days before the show rather than reading the clock, so the demo always opens at the moment this page is useful.

### The bug worth not reintroducing

Invite status was originally derived from `completeness()`: score of zero meant "not opened", anything above meant "opened, unfinished". That read as sensible and was wrong, because a record, an age and a hometown come off the **promoter's own entry form**. The result was twenty-one fighters who had never touched the link all reporting as "opened, unfinished", which erases the only distinction the page exists to draw — the difference between "he looked and bailed" and "he never looked" is the difference between a nudge and a phone call.

`inviteFor()` now looks only at fields nobody but the fighter could have supplied: photo, nickname, story, Instagram, walkout song, sponsors, height, reach. Same rule as `isDebut()` in section 7: **absence is not evidence.** It is worth assuming this class of bug is present anywhere a derived score stands in for a fact.

The nudge message also said "has already sent **his**", on a card with four women's bouts on it. It now says "theirs", and there is a test that fails on any gendered pronoun.

### Screenshots

[scripts/shots.mjs](scripts/shots.mjs) captures the gallery images against the dev server at a 390x844 phone viewport, plus the Open Graph card clipped from the live hero. `npm run shots -- --review /promoter` dumps full-page PNGs at 390 and 1280 for eyeballing, which is how the mobile layout of the chase list got fixed — it had the name, the badge, the meter and the button all trying to share one flex row and wrapping into a mess.

Two things learned: a full-page screenshot does **not** trigger lazy loading, so anything below the fold reviews as an empty box unless the script walks the page first; and a review PNG of a long page is unreadable when handed to a vision model whole, so slice it with ffmpeg `crop` before looking at it.

---

## 9b. Deployment: prepared, not done

**This is the blocker.** `eventiq.win` is bought. The site is a static export, so hosting it is a file upload, and [DEPLOY.md](DEPLOY.md) has the whole procedure. What is missing is a Cloudflare API token and account ID, and only somebody with dashboard access can create those.

`npm run deploy` ([scripts/deploy.mjs](scripts/deploy.mjs)) builds with `NEXT_PUBLIC_SITE_URL=https://eventiq.win` and runs `npx wrangler pages deploy out --project-name=eventiq`. With no credentials it exits 1 and prints the exact token permissions rather than failing mid-upload. Nothing has been run against a real account.

Three things that will bite:

1. **The zone has to be in Cloudflare before the custom domain can be attached at all.** If `eventiq.win` was not bought at Cloudflare Registrar, the site has to be added and the nameservers changed at the registrar first.
2. **The API token wants three permissions, not one.** Pages Edit, Account Settings Read, and DNS Edit scoped to the single zone — and the DNS one is only needed to attach the domain by API rather than by hand.
3. **Reprint the table card once it is live.** The QR reads the origin it is served from, which is deliberate so it works off a laptop in a meeting, but it means a card printed from localhost is useless at a venue.

`NEXT_PUBLIC_SITE_URL` ([lib/site.ts](lib/site.ts)) defaults to `https://eventiq.win`, so a plain build is already a correct public build. It feeds `metadataBase`, the Open Graph tags and the chase messages, and deliberately not the QR code.

---

## 10. Bugs found and fixed — do not reintroduce

1. **Live player skipped to the end after ~4 seconds.** It derived the frame from wall-clock time, so when painting a 1080x1920 canvas of masked, shadowed layers fell behind, the frame number ran away instead of playback slowing. On a mid-range phone this looked broken. **Fix:** where a pre-rendered mp4 exists the page plays that (hardware decoded, identical picture since it came from the same component); the live path caps catch-up at three frames per tick, so a slow device gets slow motion rather than a skip. See [TapePlayer](components/sequence/TapePlayer.tsx).
2. **Missing record read as a debut.** See section 7.
3. **Typing in the questionnaire felt like wading** — every keystroke repainted the whole preview. Fixed with `useDeferredValue`, so inputs stay immediate and the card trails slightly.
4. **QR card content overflowed on a phone** — the card was locked to the A5 print aspect ratio on screen, clipping the QR. Now it grows naturally on screen and A5 is handled by a print stylesheet.
5. **Raw URL printed under the QR** looked like a debug view, and on a real printed card it is noise nobody will type. Moved to the page around the card, which is print-hidden.
6. **Next.js dev badge burned into every video frame.** `devIndicators: false`.
7. **Names clipped at the frame edges** in the head-to-head, because they were inside overflow-hidden portrait containers. Now rendered at scene level.
8. **Hook sentences set in Anton** collided and were unreadable. Sentences use Oswald.
9. **Invite status derived from a score that included promoter-entered fields.** See section 9a.
10. **The chase message assumed a male opponent.** See section 9a.
11. **The chase list was unusable on a phone.** Four elements sharing one wrapping flex row. Now the name is its own row and the status, meter and button are a second one.
12. **Sponsor names truncated in the dashboard's card list**, so "EventIQ / Digital programmes" read as "DIGITAL PROGRAM…". The column was 32 units wide for lockups that need 40.

---

## 11. Environment notes

- Node 22, npm. ffmpeg 6.1.1 at `/usr/bin/ffmpeg`. Chrome at `/usr/local/bin/google-chrome` (override with `CHROME_PATH`).
- Dev server on `:3000`. The video exporter renders against it; it can also run against a served static build via `--base`.
- Rendering one bout takes about **60 seconds**. All 15 would be ~15 minutes.
- `X` display is `:1`, 1920x1200, XFCE, `xdotool` available.
- Videos are encoded at **crf 28**, which is visually indistinguishable from crf 20 on this material at a third of the size (~1.7MB per 16s clip).
- `public/` is ~15MB: 2.9MB imagery, five bout mp4s, the 2.8MB walkthrough recording, and ~230KB of gallery screenshots. Watch this. It is all served from a CDN so it is not a page-weight problem, but it is committed to git and it only goes one way.
- Wrangler 4.126.0 works via `npx wrangler` with no install.

## 12. Commands

```bash
npm run dev
npm run build            # static export to out/
npm test                 # 26 unit tests
npm run lint
npm run typecheck

npm run assets                          # cutouts + optimisation from assets-src/
npm run render -- --bout 15             # one bout to mp4
npm run render:headline                 # bouts 15,14,13,12,11
node scripts/render-tape.mjs --bout 15 --still 300   # single frame PNG, fastest way to iterate

npm run shots                           # gallery screenshots + the Open Graph card
npm run shots -- --review /promoter     # full-page PNGs at 390 and 1280
npm run deploy                          # blocked: needs Cloudflare credentials
```

---

## 13. Open questions for the originator

1. **What does FightIQ.win do?** It is currently a bare wordmark because inventing a description of a real business seemed worse than leaving it blank. A strapline would also even up the sponsor strip, where it is the only single-line lockup.
2. **Real fighter photographs.** The generated portraits are fine for demonstrating the idea, but a promoter who recognises nobody will notice. Getting a handful of real photos from one local gym would make a named pitch far stronger. Note this also needs the fighters' permission.
3. **Deployment credentials. This is the one thing blocking a live site.** `eventiq.win` is bought and the deploy is written and tested as far as it can be without an account. It needs a Cloudflare API token and account ID, which only somebody with dashboard access can create. See section 9b and [DEPLOY.md](DEPLOY.md). Until this happens the pitch is still "let me show you on my laptop" and the printed QR code cannot work.
3a. **Was the domain bought at Cloudflare Registrar or somewhere else?** If somewhere else, the nameservers have to change before the custom domain can be attached, and that is the slow step.
3b. **Are the last-show engagement figures on `/promoter` acceptable as illustrative?** They are invented and labelled as such in the page footer. If there are real numbers from a real show, even rough ones, they are worth far more than plausible ones.
4. **Music.** Videos are silent by design — no licensing exposure, and Instagram plays muted anyway. Adding a music bed is a licensing conversation, not a code one.
5. **Commercial model.** Not decided. Candidates: a per-event fee to the promoter; a share of bout sponsorship; or free programme with the post-event sponsor report as the paid upsell. This matters because it determines what gets built next.

---

## 14. Future plans

Split by whether it earns its place *before* a signed promoter or *after*, because that is the decision that keeps being relevant.

### Before — things that help win the first promoter

- **Deploy to a real URL.** Highest leverage, and now one command short of done. See section 9b.
- **Real photos** for at least the main event and co-main.
- **Render all 15 bouts** rather than five, so no bout in the demo is a dead end (~15 min of compute).
- **An "empty vs full" toggle on the pitch page**, dramatising the completeness gap directly rather than asking the promoter to scroll to the bottom of the card to see it.
- A **second demo event** in a different discipline mix (a pure Muay Thai card) would prove the model handles any promoter's show. The data model already supports it.

### After — the real product

Roughly in dependency order:

1. **Backend.** Postgres via Prisma (schema was designed in an earlier plan: `Promoter`, `Event`, `Fighter`, `Bout`, `Sponsor`, `Invite`, `RenderJob`). Removing `output: "export"` is the first step. Photo storage moves to S3/R2 behind the existing `uploadFile()` seam concept.
2. **Real questionnaires.** Magic-link invites keyed on an unguessable token, autosave, resumable. `Invite.lastOpenedAt` is the useful nudge signal — it tells the promoter "he opened it and bailed", which is different from "he never looked".
2a. **Make the record import real** (section 7a). A server-side endpoint that fetches and parses one pasted Sherdog or Tapology page. Then give the same tool to the promoter, so they can populate the fighters who never reply.
3. **Fighter profiles that persist across events.** A returning fighter gets "confirm your details", not a blank form. This is the biggest retention hook in the whole idea and it gets stronger with every show.
4. **Promoter admin.** The *read* half now exists at `/promoter` (section 9a). What is missing is everything that writes: create event, bouts and fighters; generate and copy real invite links rather than a demo one; a publish toggle. The invite statuses are currently derived from the fixture, and in a real build they come from `Invite.lastOpenedAt`, which is the useful nudge signal.
5. **Async render queue.** A 480-frame capture takes tens of seconds, so it can never block a request. Cache per bout, invalidate when either fighter's data changes.
6. **Sponsor tap counting and a post-event sponsor report.** Probably the thing promoters would actually pay more for: a one-pager they can send a sponsor proving impressions and taps. Turns bout sponsorship from a favour into a product.
7. **Multi-tenant auth.** Currently there is none at all; the demo has no accounts.
8. **Live on the night** — results as they happen, running order slipping, late replacements. Attractive but a different product with different reliability demands. Do not let it in early.

### Explicitly out of scope so far

Native app, ticketing, betting, live scoring, AI image-to-video models, music beds.

### Risks worth tracking

- **Personal data.** The questionnaire collects age, hometown and photographs of real people, accessed by an unguessable link with no authentication. A real build needs consent wording, a privacy notice, a retention policy and a basis for publishing. The questionnaire is the natural consent point — design it in rather than bolting it on.
- **Image rights.** Fighters' photos need permission to publish, including on sponsor-branded video. Same consent point.
- **Remotion licensing** if the render harness is ever swapped. See section 4.
- **Sponsor name accuracy.** Emblem-plus-typography exists precisely so a real business's name can never be misspelled by generated artwork. Keep it that way.

---

## 15. Commit map

Each commit is a self-contained piece with the reasoning in its message:

```
Scaffold Next.js static export with broadcast design system
Add the fight card model and the tale-of-the-tape derivations
Add demo artwork and the asset preparation pipeline
Add the tale-of-the-tape sequence and its mp4 exporter
Build the programme and fighter profile pages
Add the fighter questionnaire walkthrough
Add the promoter pitch page and printable table card
Rewrite the README around the built demo
Play the rendered file in the page and stop the live player skipping
Keep the raw URL off the printed table card
Add the scripted walkthrough used to record the sales demo
Document how the sales recording is produced
Remove unused create-next-app placeholder art
Show the fighter how they read against their actual opponent
Add Mouthguards.pro, FightIQ.win and EventIQ as sponsors
Add a handover document
Let fighters import their record from Sherdog or Tapology
Give the demo recording an ending
Give the promoter their own view of the card
Capture the sales recording and product screenshots
Finish the screenshot script and shoot the gallery at phone size
Turn the pitch page into a shop window
Give the site the metadata a public URL needs
Prepare the Cloudflare Pages deploy
```

The commit messages are the best record of *why* each decision was taken. Read them before changing anything load-bearing.
