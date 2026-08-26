# EventIQ — handover

Written so this can be picked up in a fresh session with no prior context. Covers what exists, why it is the way it is, what was tried and rejected, what is still open, and what to do next.

Companion to the [README](README.md), which covers how to run things. This document covers *why*.

---

## 1. The idea, in the originator's words

> I go to amateur MMA events and it's great, but paper programmes on the table with the fighter's name, gym and weight class. My idea is a digital programme for each event — spectators scan a QR code, taken to a web page with a full digital programme. People want a reason to root for someone, so we send out questionnaires to all fighters: bio, stats, record, photo etc. They fill it in and we create a tale of the tape for every fight, expandable in the app. We can add their sponsors and Instagram too so they are motivated to fill it in. Also the promoters get a pro looking [programme] and can feature their sponsors.

Two refinements came later in the same conversation and both changed the build materially:

- **"I like the idea of video generation of the still photos for the TOTT like UFC."** This became the centrepiece, not a garnish.
- **"It's just an idea, but we need it to look spectacular to sell it to promoters."** This reframed the first version from *system* to *pitch artifact*. Operational completeness was traded away for visual impact, deliberately and repeatedly.

A third input was a **photograph of a real programme** from an actual event (BUDO 79, Grangemouth Town Hall). It is not in the repo, but what it taught us is in section 5. It is the single most valuable piece of input received and it is worth getting more like it.

Then, when the pitch demo was shown back:

> you are the fucking developer, make it real, i didnt ask you for a fancy demo, i asked you to build it

That is what section 2 onwards now describes. The demo was a facade with five holes in it, all of which are now filled.

---

## 2. Current state

Branch `cursor/eventiq-digital-fight-programme`, [PR #1](https://github.com/gogs1998/EventIQ/pull/1). Build, lint and typecheck clean; 97 unit tests and a 22-step browser walkthrough passing against local Cloudflare bindings.

**It is a working application, not a demo of one.** The five things that were faked are real:

| Was | Is now |
| --- | --- |
| No database — a fixture at `data/event.ts` | D1, with migrations. The fixture is the seed |
| The questionnaire saved nothing | Autosaves to D1, photographs to R2, resumable |
| `/promoter` was public | Password login, signed cookie, per-promoter ownership checks |
| Record import returned hardcoded data | Fetches and parses a real Sherdog page, cached in D1 |
| "Last show" figures were invented | Counted in D1, or shown as zero. The invented ones are deleted |

**Still not real, and honestly labelled:** video rendering runs outside Cloudflare (section 11), there is no email or SMS so invites are copied and pasted by the promoter, there is no self-service promoter signup, and the demo card's fighters and sponsors are invented apart from the three real brands in section 6.

**It is live at https://eventiq.win**, on Workers, with D1 and R2 behind it. The whole product has been walked end to end against production, not just against local bindings: signing in, adding and removing a bout, opening a real invite link, autosaving, uploading a photograph to R2, submitting, and watching the counts move on the dashboard. See section 12 and [DEPLOY.md](DEPLOY.md).

### Routes

| Route | What it is | Auth |
| --- | --- | --- |
| `/` | Pitch page and shop window: the recorded walkthrough, the main event video, a screenshot gallery | public |
| `/e/[slug]` | The programme. Flagship screen | public if published |
| `/e/[slug]/f/[fighter]` | Fighter profile, deep-linkable for an Instagram bio | public if published |
| `/e/[slug]/qr` | Printable table card | public |
| `/qr` | Redirects to the current show's table card | public |
| `/f/[token]` | The fighter's questionnaire | the token is the credential |
| `/f/demo` | The questionnaire as a walkthrough, saving nothing | public |
| `/promoter` | Shows list, or straight to the dashboard if there is one | password |
| `/promoter/e/[slug]` | Dashboard: chase list, readiness, sponsors, live counts | password |
| `/promoter/e/[slug]/card` | Card editor: event, bouts, fighters, sponsors | password |
| `/promoter/login` | Sign in | public |
| `/render/[slug]/[bout]` | Capture surface for the mp4 exporter | unlisted |
| `/media/[...key]` | Serves R2 objects | public |
| `/api/track` | Records one interaction | public, write-only |
| `/api/import-record` | Fetches and parses one record page | public |
| `/about-the-importer` | What the importer bot does, linked from its user agent | public |

---

## 3. Stack and the reasoning behind each choice

- **Next.js 16.3 App Router, TypeScript, Tailwind 4.** Single app at repo root.
- **Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).** `@cloudflare/next-on-pages` is deprecated and Pages is the wrong product for an app with server actions and a database.
- **D1** for data, **R2** for photographs and rendered video.
- **Drizzle ORM.** Chosen over Prisma because Prisma's D1 support still goes through a driver adapter and pulls a query engine into the bundle; Drizzle compiles to plain SQL and adds almost nothing to the Worker. The schema is 260 lines of TypeScript that generates its own migrations.
- **No auth dependency.** Web Crypto, which is in the Workers runtime, in Node and in the test environment, so the same code runs everywhere. Section 6.
- **`devIndicators: false`** in [next.config.ts](next.config.ts). Not cosmetic — the video exporter screenshots the running dev server, and the Next.js dev badge was being burned into every frame.
- **`images: { unoptimized: true }`** — all imagery is pre-optimised and the Workers image loader would be a cost for no gain.

**`output: "export"` is gone.** It was load-bearing for the demo and it is exactly what made a backend impossible. That was the first thing removed.

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
- **As mp4:** [scripts/render-tape.mjs](scripts/render-tape.mjs) opens `/render/[slug]/[bout]` **once** in headless Chrome, then drives `window.__setFrame(n)` and screenshots the viewport 480 times, streaming JPEGs into ffmpeg.

The component now takes a `card` prop as well as `frame`, because the data comes from the database rather than from a module-level import. That is a widening of its inputs, not a loosening of the rule: it is still a pure function of its props.

### Why not Remotion

Remotion does exactly this and does it better. It was rejected on licensing, not technical grounds. It is free for individuals and organisations of up to three people; beyond that, **both** an automated render pipeline **and** embedding its Player fall under "Remotion for Automators" at $0.01 per render with a $100/month minimum. That is an affordable cost but a poor dependency to place directly on the core feature of a product with no customers yet. With ffmpeg and Chrome already present the capture loop is about 150 lines.

Because the composition is frame-driven either way, **adopting Remotion later swaps the render harness rather than requiring a rewrite.**

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

## 6. The data layer

### The schema

[db/schema.ts](db/schema.ts) is the single description of the database; [db/migrations](db/migrations) is generated from it with `npm run db:generate` and applied with `npm run db:migrate`.

| Table | Holds | Notes |
| --- | --- | --- |
| `promoters` | One operator | `password_hash` is a PBKDF2 verifier, never a password |
| `events` | One show | `published` gates public visibility |
| `bouts` | The running order | Unique on (event, number). Carries its own sponsor |
| `fighters` | People | **Not** owned by an event. Section below |
| `sponsors` | A promoter's book | Resolved for show, bout and fighter placements alike |
| `event_sponsors`, `fighter_sponsors` | Placements | Ordered, because the order was sold |
| `invites` | A fighter's way in | Token plus three timestamps |
| `render_jobs` | The interface to the renderer | Section 11 |
| `analytics_events` | One row per interaction | Section 9 |
| `import_cache` | Fetched record pages | Section 8 |

Two decisions shape it more than anything else.

**Almost every column describing a fighter is nullable.** On a real amateur card most of them are missing for most of the bill. That is the central design constraint of the product rather than an edge case, so the database is as relaxed about absence as the UI is. Nothing has a default that could be mistaken for an answer. A record is all three of win/loss/draw or none of them, because a partly stored record read back as `0-0-0` would put a veteran on screen as a debutant.

**Fighters are their own table, not rows hanging off a bout.** The same person comes back for the promoter's next show and should get "confirm your details" rather than a blank form. That is the biggest retention hook in the idea and it only works if identity survives the event. It is also why the seed deletes fighters by explicit id rather than by promoter: if a seeded fighter is on somebody else's card the foreign key refuses, and a failed command is far better than a re-seed of the demo quietly rewriting a real fighter's profile.

Timestamps are Unix milliseconds, because SQLite has no date type and a number avoids a class of string-comparison bug that is very hard to see. Dates that are calendar facts rather than instants — the day of the show — stay as ISO `YYYY-MM-DD` text, because that is what they are.

### The seam between rows and pages

[lib/db/queries.ts](lib/db/queries.ts) is the only file that knows what the tables look like, and it knows nothing about pages. It maps rows onto the same `Fighter`, `Bout`, `Sponsor` and `FightEvent` types the demo used, which is what let the derivation layer keep every one of its tests.

`loadCard()` fetches a whole show in six queries regardless of how many bouts are on it. D1 charges per row read and a fifteen-bout card touches thirty fighters, so the difference between this and the obvious per-fighter loop is the difference between a page that is cheap and one that is not.

The result is a [`Card`](lib/card.ts): the event, every fighter on it, every sponsor the promoter has. Everything downstream is a pure function of that object. `lib/tape.ts` and `lib/promoter.ts` never see a database.

### The seed

[lib/seed.ts](lib/seed.ts) turns `data/event.ts` into SQL. Cage County 12 survives as **seeded data** rather than as a hardcoded special case, because its unevenness is the argument for the product and reproducing that by hand in SQL would guarantee it drifts from the fixture the tests use.

The SQL is generated at seed time and **never committed**. Invite tokens are the only thing standing between a stranger and a fighter's profile, so a file of known ones in a public repository would be a way of shipping a vulnerability that looks like a convenience. `db/seed.sql` is gitignored for the same reason.

---

## 6a. Authentication

Two kinds of caller, and neither justifies an identity provider.

**The promoter** signs in with a password. It is verified against a PBKDF2-SHA256 hash at 600,000 iterations (OWASP's floor at the time of writing) and the session is a **signed cookie**, not a row: `{promoterId, expiresAt}` HMAC-SHA256'd with `SESSION_SECRET`, httpOnly, secure, `sameSite=lax`, fourteen days. The expiry is inside the signature so the holder cannot extend it. Comparison is constant-time.

There is deliberately **no server-side revocation**. With one operator it would be ceremony rather than security, and rotating `SESSION_SECRET` invalidates every session at once, which is the entire threat model handled in one command.

[proxy.ts](proxy.ts) redirects cookieless requests to the login form. **That is not the authorisation check** and must never be mistaken for one: it runs before the database is reachable. The real check is `currentPromoter()` in every page and `requirePromoter()` in every action, and every promoter action re-reads the event and confirms the signed-in promoter owns it. A forged cookie gets past the proxy and fails there.

Asking for a show that belongs to somebody else returns the same 404 as asking for one that does not exist, so the promoter area cannot be used to find out who runs what.

**The fighter** has no account at all. The token in their URL is the credential: 32 bytes from the CSPRNG, never derived from anything about the fighter, because a token built from a name and an event would be guessable by anybody holding the printed card. Every action re-reads the invite from the database rather than trusting a form field, and nothing takes a fighter id from the caller. A fighter holding a link can edit exactly one profile: theirs.

This is a real trade-off and it should be stated plainly: anyone who gets hold of the link can edit that fighter's entry. It is the price of a form that gets filled in by people who will not create an account for a programme entry, and `New link` on the dashboard invalidates the old one.

---

## 7. Where the content lives

`data/event.ts` holds three exports: `sponsors`, `fighters`, `event`. Types in [lib/types.ts](lib/types.ts). It is now **only** the seed; nothing at runtime reads it.

### The demo card

**Cage County 12**, Winter Gardens Blackpool, Sat 14 Nov 2026. Promoter: Cage County Promotions. 15 bouts, 30 fighters.

Completeness is **deliberately uneven**, and this is a feature of the pitch rather than unfinished work:

- **Main event, co-main, bouts 12 and 13** — fully filled in, with photos. This is what it looks like when fighters send their details.
- **Bouts 10 and 11** — one fighter complete, the other sent nothing. Bout 11 (Farrukh vs Baines) is the showcase for this: her column is full, his is a row of dashes.
- **Bouts 1–9** — a name and a gym, exactly like the paper programme.

**The gap between the top and bottom of the card is the pitch.** Do not "fix" it by filling everyone in.

### Real vs invented

Everything is invented **except** three real sponsors, which lead the show-sponsor strip and the table card:

- **Mouthguards.pro** — strapline "Custom fitted". Sponsors Reeves and the co-main.
- **FightIQ.win** — **no strapline, because nobody has said what it does.** See open questions.
- **EventIQ** — strapline "Digital programmes", links to `/`. Bout sponsor of the main event, so it closes out the flagship video.

All three appear *inside* the main event video, which is where the value is.

Sponsor logos are **emblems only**, with names set in the app's own typography. This is deliberate: image generators misspell text, and a sponsor's name must never be wrong.

---

## 8. The derivation layer

[lib/tape.ts](lib/tape.ts) turns fields into a story. Both the static card and the video read from it, so they cannot disagree. Unit tested in [lib/tape.test.ts](lib/tape.test.ts).

Key functions:

- **`buildTape(red, blue)`** — the side-by-side rows. A row survives if **either** corner can fill it and is dropped only when neither can. Half-filled rows show an em dash and no leader. Contested rows (record, height, reach, finishes) get a `leader` and an `edge` like `+11cm`. Age is deliberately *not* contested — younger is not better.
- **`buildHooks(bout, red, blue)`** — up to three story lines, weighted and sorted: belt on the line, two debutants, nobody has lost, reach advantage, gym clash, hometown derby, experience gap, finish rate, southpaw vs orthodox. Returns `[]` rather than inventing something from an empty pair.
- **`completeness(fighter)`** — weighted score out of 100 plus the list of what is missing. Photo is worth 30, because it is what carries the card.
- **`tapeGapsBehind(mine, theirs)`** — lines the *opponent* answered and this fighter did not. Powers the questionnaire's competitive prompt.

These all take fighters and bouts as arguments. During the rewrite they were changed from importing the fixture to being handed a `Card`, which is why they are still testable and why the 49 original tests survived the move to a database intact.

### The bug worth never reintroducing

`isDebut()` requires an **explicit** `0-0-0` record. A test caught the naive version, which treated a *missing* record as a debut — meaning anyone who ignored the questionnaire would be advertised as making their debut. That would eventually put an eight-fight veteran on screen as a debutant in front of a room that knows better. **Silence is not a debut.** The database enforces the same thing: record columns are all-or-nothing.

---

## 8a. Importing a record

Idea from the originator: *"they could just send their Sherdog link and autopopulate."* Now real, in [lib/record-import](lib/record-import) behind [`/api/import-record`](app/api/import-record/route.ts).

### What works and what does not

- **Sherdog works.** `/fighter/Name-ID` returns fully-rendered HTML with `itemprop` microdata intact and does not trip a bot challenge. [lib/record-import/sherdog.ts](lib/record-import/sherdog.ts) parses name, nickname, gym, height, age and the win/loss/draw record. There is a **separate amateur fight table** and it is preferred over the professional one when it exists, because that is the record that matters on these cards. Tested against a committed HTML fixture so the parser can be changed without hitting the site.
- **Tapology does not work and cannot be made to.** It sits behind Cloudflare's bot protection, which a Worker's outbound fetch cannot pass and should not try to. The earlier research saying Tapology has better UK amateur coverage is still true, and that makes this a genuine loss rather than a shrug — but the honest answer is a message saying we cannot read it and offering Sherdog or the boxes below. Pretending to be a browser to get past a block would be both dishonest and a declaration that we know we are unwelcome.
- **Sherdog has no public API.** Verified: no `/api/`, no autocomplete, no JSON endpoints, `/search/results` 404s. Do not waste time probing for one.
- **Smoothcomp** is a competition platform rather than a record database, so it is no use for records. But it is where a UK amateur promoter's roster already lives, which makes importing a whole card from it far more valuable than importing fighters one at a time. Worth investigating as a partnership.

### How it behaves

- **It fetches one page, on a person's instruction, at human rate.** Nothing crawls, nothing follows links, nothing runs on a schedule. The bot identifies itself as `EventIQBot/1.0` and links to [/about-the-importer](app/about-the-importer/page.tsx), which exists and says what it does — a user agent pointing at a 404 is the same as not identifying yourself.
- **Results are cached in D1 for a week, failures included.** Caching is not an optimisation here, it is what keeps this defensible: one fighter's link costs the source site one request no matter how many times the form is reopened. Caching failures matters more than caching successes, because the person whose page will not parse is the one most likely to press the button again.
- **Imported values are suggestions, not facts.** Every imported field is badged with its source and has to be confirmed. Amateur records go stale. Same principle as `isDebut`: never publish a claim about a fighter we cannot stand behind.
- **It only fills blanks.** Anything the fighter already typed wins. Touching a field clears its source badge.
- **The error path does not dead-end.** Most amateurs have no record page at all, so a bad link says what a good one looks like *and* "no record online? Just fill the boxes in below."
- **Placement is inside section 03, not at the top.** Leading with "paste your Sherdog link" would lose the flattering opening and exclude the majority who have no page.
- **URL parsing is strict.** [lib/fighter-import.test.ts](lib/fighter-import.test.ts) covers lookalike domains — `sherdog.com.evil.test` must not match — plus missing scheme, missing `www`, query strings, and right-site-wrong-page.

Sherdog's `robots.txt` permits crawling, but robots.txt is not a licence. Check terms of service before relying on this commercially.

### The bigger prize: the promoter does it

The most valuable version is not the fighter pasting their own link, it is **the promoter pasting links for the fighters who never reply**. That flips the failure mode: instead of a blank card you get real stats and merely no photo or story. It lets a promoter unilaterally raise the floor on the whole undercard. The endpoint exists and is not yet wired into the promoter's card editor. This is the highest-value small piece of work left.

---

## 9. Counting

[app/api/track/route.ts](app/api/track/route.ts) writes one row per interaction into `analytics_events`: `programme_open`, `bout_expand`, `tape_play`, `sponsor_tap`, `profile_view`. The client sends them with `sendBeacon` where it can, so a tap that navigates away still lands.

**There is no user identifier and none is wanted.** `sessionId` is a random value held for the length of one visit, so opens can be counted per spectator rather than per reload, and it is stored nowhere else.

The table is append-only and unaggregated, because the value to a promoter is a report they can hand a sponsor and the questions a sponsor asks are not known in advance.

The dashboard shows the counts twice: **This show so far**, live, and **Last show**, which is the shape of the post-event sponsor report. Both render from the same query so they cannot end up meaning different things.

**The invented "last show" figures are gone.** They were the most dangerous thing in the demo: plausible numbers that would have been repeated to a sponsor. The panel now shows real counts or explicit zeroes, and says in the footer that nothing on the page is estimated.

---

## 10. The promoter's view

`/promoter/e/[slug]` is the other half of the same rows: the things a promoter knows that a spectator does not. Everything is derived in [lib/promoter.ts](lib/promoter.ts) from the same `Card` the programme reads, so the dashboard and the card cannot disagree.

- **The chase list.** Ordered by position on the card rather than by how empty a profile is, because a hole in the main event costs more than a hole in bout two, and that is the order a promoter already thinks in. Each row carries the fighter's real invite link, a copy button, a `New link` button that invalidates the old one, and a copy button that puts a WhatsApp-ready message on the clipboard.
- **Bout readiness.** Ready, one side missing, or nothing in. "One side missing" is called out hardest, because a bout with one finished fighter and one blank looks worse on the night than two blanks, which at least looks consistent.
- **Sponsor inventory.** How many of the fifteen bout slots are sold.
- **The counts**, section 9.

The card editor at `/promoter/e/[slug]/card` writes: event details, add and edit and remove bouts, fighter names and gyms, add sponsors. Creating a bout creates both fighters and both invites in the same action, because a bout with no way to contact either corner is not a useful thing to have made.

**Removing a bout renumbers the rest only while the event is unpublished.** Once it is published the numbers are in circulation — on a poster, in a message, in the analytics table — so a deleted bout leaves a gap. That mirrors what happens on a real card when somebody pulls out.

### The bug worth not reintroducing

Invite status was originally derived from `completeness()`: score of zero meant "not opened", anything above meant "opened, unfinished". That read as sensible and was wrong, because a record, an age and a hometown come off the **promoter's own entry form**. The result was twenty-one fighters who had never touched the link all reporting as "opened, unfinished", which erases the only distinction the page exists to draw — the difference between "he looked and bailed" and "he never looked" is the difference between a nudge and a phone call.

`inviteStatus()` now reads the three timestamps on the invite row and nothing else. `lastOpenedAt` is written when the fighter's page actually loads. **Absence is not evidence.** It is worth assuming this class of bug is present anywhere a derived score stands in for a fact.

The nudge message also said "has already sent **his**", on a card with four women's bouts on it. It now says "theirs", and there is a test that fails on any gendered pronoun.

---

## 11. Video rendering: the one thing that is not serverless

Headless Chrome and ffmpeg cannot run on Workers. This is not a limitation to work around, it is a fact to design for, and pretending otherwise would produce a feature that fails on the night.

So rendering is an **out-of-band job** run from a machine that has both, and `render_jobs` is the entire interface between it and the app. The app never produces a video; it reads back what the renderer finished.

```bash
npm run render -- --slug cage-county-12 --list
npm run render -- --slug cage-county-12 --bout 15 --publish
npm run render -- --slug cage-county-12 --stale --publish --remote
```

[scripts/render-tape.mjs](scripts/render-tape.mjs) reads the running order out of D1, captures 480 frames per bout, streams them into ffmpeg, puts the mp4 in R2 and writes the key into `render_jobs`. It talks to D1 and R2 through wrangler rather than through an API of our own, because anyone who can run it already holds the Cloudflare credentials and a write endpoint on the public site would be a way in for no gain.

It fingerprints the inputs to each bout and stores the hash with the job, so `--stale` renders only the bouts whose fighters have changed. A fifteen-bout card is about a quarter of an hour of compute and most of the time one fighter has sent one photograph.

**Cloudflare Browser Rendering does not solve this.** It can drive a browser; it cannot run ffmpeg. Do not go round that loop again.

The five mp4s committed under `public/renders/` predate the bucket. The seed records them as finished jobs pointing at those static paths, so they still play.

---

## 12. Deployment: done

`https://eventiq.win` is a Worker, bound to the D1 database `eventiq` and the R2 bucket `eventiq-media`, with the custom domain attached. `node scripts/deploy.mjs --check` probes each permission the deploy needs and now reports all four present.

The build was held up for a while on **Account · D1 · Edit** being missing from the token, which is worth knowing about because the failure is unhelpful: D1 answers **401**, not 403, so it reads like a bad token rather than a token that is fine but scoped for something else. `--check` exists to say which of the four it actually is. The full permission list is in [DEPLOY.md](DEPLOY.md).

Three things that bit, and will bite again on a fresh account:

1. **The database id has to go into `wrangler.jsonc` and be committed.** `--provision` writes it. It is not a secret — it names a database only this account's tokens can open — but a deploy from a clean checkout binds nothing without it.
2. **`SESSION_SECRET` has to exist before the first deploy** or the promoter area refuses to serve. There is no fallback, deliberately.
3. **Reprint the table card now it is live.** The QR reads the origin it is served from, which is deliberate so it works off a laptop in a meeting, but a card printed from localhost is useless at a venue.

`npm run e2e -- --base https://eventiq.win` runs the whole walk against production. It is honest about what it does to the data — it adds a bout, removes it again, and fills in a fighter's profile — so anything it touches needs putting back afterwards. Running it against a card a promoter is actually using would be rude.

---

## 13. Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # SESSION_SECRET and the seed password
npm run db:reset                   # migrate + seed the local D1
npm run dev                        # http://localhost:3000
```

`next dev` gets real local D1 and R2 through `initOpenNextCloudflareForDev()`, so server actions, uploads and counting all work without deploying anything. State lives under `.wrangler/`, which is gitignored.

To exercise the actual Workers runtime rather than Node:

```bash
npx opennextjs-cloudflare build
npx wrangler dev --port 8788 --local
```

**Do not run both at once.** They open the same Miniflare SQLite file and the second writer takes the first one down mid-request, which presents as an unexplained connection refused. That cost half an hour.

`.dev.vars` is the source of truth for local secrets and **wrangler ignores the shell**, so anything outside the Worker that reads the same names has to read that file the same way. [scripts/dev-vars.mjs](scripts/dev-vars.mjs) exists because Node's `process.loadEnvFile` is the wrong way round — it leaves an already-exported variable in place — so with `SEED_PROMOTER_PASSWORD` exported in the shell the seed set one password and the login page expected another. That presents as "the password is wrong" and is not fun to diagnose.

### The browser walkthrough

```bash
npm run e2e -- --base http://localhost:8788
```

[scripts/e2e.mjs](scripts/e2e.mjs) drives 22 steps through the whole product: sign in with the wrong password and the right one, add a bout, see it on the public card, remove it, open a fighter's invite, type, reload, upload a photograph and fetch it back out of the bucket, submit, see it on the programme, see the score move on the dashboard, watch the counts go up, import a Sherdog record, be refused by a made-up token, sign out.

The unit tests cover the derivation layer, which is pure and therefore easy. This covers the half that is not, and it is the only thing that would catch a form posting to the wrong action or a cookie that never gets set.

Two things it taught, both worth knowing before writing another one: the design sets labels in CSS uppercase, so `innerText` shouts and the source does not; and React ignores a value written straight onto an input, so the test has to go through the prototype setter and fire the event React is listening for.

---

## 14. Bugs found and fixed — do not reintroduce

1. **Live player skipped to the end after ~4 seconds.** It derived the frame from wall-clock time, so when painting a 1080x1920 canvas of masked, shadowed layers fell behind, the frame number ran away instead of playback slowing. **Fix:** where a rendered mp4 exists the page plays that (hardware decoded, identical picture since it came from the same component); the live path caps catch-up at three frames per tick, so a slow device gets slow motion rather than a skip.
2. **Missing record read as a debut.** Section 8.
3. **Typing in the questionnaire felt like wading** — every keystroke repainted the whole preview. Fixed with `useDeferredValue`.
4. **QR card content overflowed on a phone** — the card was locked to the A5 print aspect ratio on screen. Now it grows naturally and A5 is a print stylesheet.
5. **Raw URL printed under the QR** looked like a debug view. Moved to the page around the card, which is print-hidden.
6. **Next.js dev badge burned into every video frame.** `devIndicators: false`.
7. **Names clipped at the frame edges** in the head-to-head, because they were inside overflow-hidden portrait containers. Now rendered at scene level.
8. **Hook sentences set in Anton** collided and were unreadable. Sentences use Oswald.
9. **Invite status derived from a score that included promoter-entered fields.** Section 10.
10. **The chase message assumed a male opponent.** Section 10.
11. **The chase list was unusable on a phone.** Four elements sharing one wrapping flex row.
12. **Sponsor names truncated in the dashboard's card list**, so "EventIQ / Digital programmes" read as "DIGITAL PROGRAM…".
13. **Seeding twice in a row failed** on a primary key collision and left the database half rebuilt. The seed cleared everything scoped to the promoter but not the fighters, because a fighter is not owned by one. There is now a test asserting that every table the seed writes to is cleared first, and cleared in an order the foreign keys allow — the specific row will not be the one that breaks next time.
14. **The seed and the login page disagreed about the password.** Section 13.
15. **The importer's user agent linked to a page that did not exist.** It does now.

---

## 15. Environment notes

- Node 22, npm. ffmpeg 6.1.1 at `/usr/bin/ffmpeg`. Chrome at `/usr/local/bin/google-chrome` (override with `CHROME_PATH`).
- Wrangler 4.126.0 via `npx wrangler`, no install needed.
- Rendering one bout takes about **60 seconds**. All 15 would be ~15 minutes.
- `X` display is `:1`, 1920x1200, XFCE, `xdotool` available. Only needed for the sales recording.
- Videos are encoded at **crf 28**, visually indistinguishable from crf 20 on this material at a third of the size (~1.7MB per 16s clip).
- `public/` is ~15MB: 2.9MB imagery, five bout mp4s, the 2.8MB walkthrough recording, and ~230KB of gallery screenshots. Watch this. New renders go to R2 now, not into the repository.

## 16. Commands

```bash
npm run dev                  # next dev, with local D1 and R2
npm run build                # next build
npm test                     # 97 unit tests
npm run lint
npm run typecheck

npm run db:generate          # migrations from db/schema.ts
npm run db:migrate           # apply them locally
npm run db:seed              # the demo card, with fresh invite tokens
npm run db:reset             # both
npm run db:studio -- "select count(*) from fighters"

npx opennextjs-cloudflare build
npx wrangler dev --port 8788 --local     # the real Workers runtime
npm run e2e -- --base http://localhost:8788

npm run assets                                       # cutouts, from assets-src/
npm run render -- --slug cage-county-12 --list
npm run render -- --slug cage-county-12 --bout 15 --still 300   # one PNG, fastest iteration
npm run render -- --slug cage-county-12 --stale --publish

npm run shots                            # gallery screenshots + the Open Graph card
node scripts/deploy.mjs --check          # what the token can and cannot do
npm run deploy                           # build and push the Worker
npm run e2e -- --base https://eventiq.win --password '...'
```

---

## 17. The sales recording

Promoter pitches happen over WhatsApp more than in person, so a recording of the flow is a deliverable in its own right. Current cut: **65 seconds, 454x984, 2.5MB**, committed at `public/demo/eventiq-demo.mp4` and playing on the pitch page.

Produced by [scripts/tour.mjs](scripts/tour.mjs) — a scripted walkthrough, not a human clicking around:

```bash
DISPLAY=:1 node scripts/tour.mjs setup     # chrome-less phone-shaped window
# start screen recording here
DISPLAY=:1 node scripts/tour.mjs tour      # ~72s
# stop recording here
DISPLAY=:1 node scripts/tour.mjs teardown
```

Chrome runs in `--app` mode, which removes the tab strip and address bar — the difference between looking like a product and looking like somebody's localhost.

**Hard-won details, all of which cost a re-record:**

- Crop the capture to the window afterwards. Last run: `crop=454:985:719:106`. Re-measure with `xdotool getwindowgeometry`.
- The VM desktop is XFCE. **Plank (the dock) respawns when killed**, so crop it out rather than fighting it.
- Minimise any other Chrome window first, or it appears behind.
- **Park the mouse pointer off screen before playing the video.** In the first attempt the cursor sat over the fighters' faces for sixteen seconds.
- Click **in-page** (`el.click()` via `page.evaluate`) rather than through puppeteer, which scrolls the element and ruins the framing.
- Reset the window to a neutral page before recording, or the previous run's final state appears in the opening seconds.

**Verify recordings by watching them.** A browser-driving agent reported the first take as flawless; review found the embedded video skipped after four seconds, developer tools were visible in the opening frame, and the cursor sat over the picture throughout.

The recording predates the rewrite and still shows the demo. **It needs re-recording**, because the flow it shows no longer includes the parts that are now the strongest thing to show: a fighter's entry appearing on the card, and the counts going up.

---

## 18. Open questions for the originator

1. **What does FightIQ.win do?** It is currently a bare wordmark because inventing a description of a real business seemed worse than leaving it blank. A strapline would also even up the sponsor strip.
2. **Real fighter photographs.** The generated portraits are fine for demonstrating the idea, but a promoter who recognises nobody will notice. A handful of real photos from one local gym would make a named pitch far stronger. Needs the fighters' permission.
3. **The D1 token permission.** Section 12. This is the only thing between here and a live site.
4. **Who else needs a login?** There is one promoter account, created by the seed, and no signup. If a second promoter is coming, that changes from a `wrangler d1 execute` into a feature.
5. **Consent wording.** The questionnaire collects age, hometown and photographs of real people and publishes them. It needs a sentence the fighter agrees to and a retention policy behind it. Section 20.
6. **Music.** Videos are silent by design — no licensing exposure, and Instagram plays muted anyway.
7. **Commercial model.** Not decided. Candidates: a per-event fee to the promoter; a share of bout sponsorship; or free programme with the post-event sponsor report as the paid upsell. This determines what gets built next.

---

## 19. What to build next

Roughly in order of value per unit of work.

1. **Deploy it.** Section 12.
2. **Give the promoter the record importer.** The endpoint exists; it needs a paste box in the card editor. This is the single biggest lever on the weakest part of the product, the undercard.
3. **Re-record the sales demo** against the real thing, including a fighter's entry landing on the card.
4. **Send the invites.** They are currently copied and pasted. An SMS or WhatsApp integration turns "the promoter chases thirty people by hand" into "the promoter presses a button", and `sentAt` already exists to record it.
5. **The post-event sponsor report.** The counting is done; what is missing is a one-page thing a promoter can send. Probably the thing promoters would actually pay more for.
6. **Returning fighters.** The schema already keeps fighters across events. What is missing is matching them on the way in, so a second show offers "confirm your details" rather than a blank form.
7. **Render on a schedule.** `--stale` makes this a one-line cron on any machine with ffmpeg. Then the video for a bout is never more than a day behind the data.
8. **Render all 15 bouts** rather than five, so no bout in the demo is a dead end.
9. **Live on the night** — results as they happen, running order slipping, late replacements. Attractive but a different product with different reliability demands. Do not let it in early.

### Explicitly out of scope so far

Native app, ticketing, betting, live scoring, AI image-to-video models, music beds.

---

## 20. Risks worth tracking

- **Personal data.** The questionnaire collects age, hometown and photographs of real people, and it is reachable by an unguessable link with no authentication. It needs consent wording, a privacy notice, a retention policy and a basis for publishing. The questionnaire is the natural consent point — design it in rather than bolting it on. This is now more urgent than it was, because the data is stored rather than living in a browser tab.
- **Invite links are bearer tokens.** Anyone who gets the link can edit that fighter's entry. Mitigated by regeneration and by there being nothing sensitive behind it beyond the profile itself, but it is a real property of the design and not an oversight.
- **Image rights.** Fighters' photos need permission to publish, including on sponsor-branded video. Same consent point.
- **Sherdog's terms.** `robots.txt` permits crawling, but that is not a licence. Read the terms before this is commercial. The importer is deliberately built to be defensible — one page, on request, cached, identified — but that is a posture, not permission.
- **Remotion licensing** if the render harness is ever swapped. Section 4.
- **Sponsor name accuracy.** Emblem-plus-typography exists precisely so a real business's name can never be misspelled by generated artwork. Keep it that way.
- **No backups.** D1 has time travel for 30 days, which is not the same as a backup strategy and should be said out loud before there is real data in it.
