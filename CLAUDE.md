@AGENTS.md

# EventIQ — working on this codebase

Digital fight programmes for amateur MMA. Live at **https://eventiq.win**. Branch `cursor/eventiq-digital-fight-programme`, [PR #1](https://github.com/gogs1998/EventIQ/pull/1).

Spectators scan a QR code at a venue and get the full running order. Every bout expands into a tale of the tape, and the important ones come with a broadcast-style vertical video built from the fighters' own photographs. Promoters get a dashboard telling them who has not sent their details in yet, and sponsor placements they can sell.

It is a working application on Cloudflare — Workers, D1, R2 — not a prototype. The show data is real; the *content* (Cage County 12, its fighters, its gyms) is invented and seeded so there is something to demonstrate.

## Read these in this order

| Document | Covers |
| --- | --- |
| This file | How to work here: the rules, the traps, the conventions |
| [HANDOVER.md](HANDOVER.md) | **Why** everything is the way it is. 700 lines, and the most valuable thing in the repo. Section 14 is 31 bugs with what each one actually did |
| [README.md](README.md) | How to run things |
| [DEPLOY.md](DEPLOY.md) | Cloudflare procedure, token scopes, the PBKDF2 ceiling |

When you need to know why something is written a particular way, HANDOVER.md almost certainly says, and it says it at length. Check there before assuming a decision was an accident. A surprising amount of this code is shaped by a specific failure that has already happened once.

## Getting running

```bash
npm install
cp .dev.vars.example .dev.vars     # SESSION_SECRET, RENDER_KEY, the seed password
npm run db:reset                   # migrate and seed the local D1
npm run dev                        # http://localhost:3000
```

The seed prints the promoter password and a few invite links. Sign in at `/promoter/login` as `cage-county`. `next dev` gets real local D1 and R2, so the questionnaire saves, photographs upload and interactions are counted without deploying anything.

```bash
npm test           # 203 unit tests in 15 files, ~1s
npm run lint
npm run typecheck
npm run build
```

Three environment traps, all of which have cost real time:

- **`npm run typecheck` needs Next.js to have generated its route types.** `PageProps` and `LayoutProps` are globals that come out of `next typegen`, so on a clean checkout `tsc` alone reports eight errors that are nothing to do with your change. The script runs typegen first, so use the script rather than `tsc --noEmit`.
- **Never run `npm run dev` and `wrangler dev` at once.** They open the same Miniflare SQLite file and the second writer takes the first down mid-request. It presents as an unexplained connection refused.
- **`wrangler d1 execute --local` is a second writer too, and it loses.** Planting a row while a dev server is running appears to work and is then flushed back over the top. Stop the server, change the data, start it again. Same for `wrangler r2 object put --local`.

## Rules that are load-bearing

Each of these looks like an improvement from the outside and is a regression. Nearly all of them are a bug that already happened; the number points at HANDOVER.md section 14.

**`components/sequence/TaleOfTheTape.tsx` must stay a pure function of its props.** No CSS animations, no transitions, no timers, no state. All motion is interpolated in JS from the `frame` prop via `lib/anim.ts`, and the mp4 exporter depends on frame *n* being byte-identical every time it is drawn. Adding a transition does not fail loudly — it makes the video judder. (Note the separate lesson in bug 31: a pure composition guarantees the same markup, not that the pixels have painted. The exporter waits for React to commit, `decode()`s every image, then waits two more frames.)

**Do not raise `PBKDF2_ITERATIONS` above 100,000.** OWASP wants 600,000 and the deployed Workers runtime throws above 100,000. Node and the local `wrangler dev` both accept any count, so no local test can see this. It has already caused a production 500 twice (bugs 16, 17). Verification reads the count out of the stored hash, so a wrong constant does not break the current login — it breaks the next hash minted. If you change it, re-seed.

**`isDebut()` requires an explicit `0-0-0`.** A missing record is not a debut. The naive version would announce an eight-fight veteran as a debutant in front of a room that knows better. The database enforces the same thing: record columns are all-or-nothing. **Silence is not evidence** — the same mistake in different clothes produced bug 9, where invite status was derived from a completeness score that included fields the *promoter* had typed, so twenty-one fighters who never opened their link all read as "opened, unfinished".

**Decide what an upload is from its bytes.** `lib/image-type.ts` reads magic numbers; `file.type` is a string the caller writes and is never read. An `image/svg+xml` upload satisfied every check the old code had, and an SVG is a document that can carry `<script>` which then runs at our own origin with our cookies in scope (bug 21, HANDOVER section 6b). The browser's JPEG re-encode in the questionnaire is not a control — the server action behind it is reachable directly.

**`lib/visibility.ts` is the only thing that decides who may see a card.** Public pages get a card through `loadVisibleCard` and the renderer's capture page through `loadRenderableCard`. Do not call `loadCard` from a route. A rule written inline in the one place somebody thought of is a rule three other places are free to forget (bugs 23, 27).

**"This one is different" is where the next hole will be.** The worst thing found in this project was `/render/[slug]/[bout]` serving unpublished shows to anyone who could guess a slug. It had a legitimate reason not to use the publish gate — the renderer works on drafts, which is the point of it — and a comment saying so, and that comment was where the thinking stopped. Anything that opts out of a general rule needs its own rule, not none.

**Background removal happens in the renderer and nowhere else.** It is an ONNX model, ~3.5s of CPU per image; Workers cannot run it and a fighter's phone should not be asked to. `scripts/cutouts.mjs` runs before any bout renders. The upload path stores a photograph and clears any stale cutout. `lib/portrait.ts` is the single place that decides between cutout, photograph and initialled plate — the sequence, the head-to-head and the questionnaire preview all read it, so a fighter sees in the preview what the video will show.

**The demo card's unevenness is the pitch, not unfinished work.** The main event is fully filled in; bouts 1–9 are a name and a gym like the paper programme. In particular **Chloe Baines has opened her link and done nothing since**, which makes her the warmest name on the chase list and the clearest illustration of what the dashboard is for. The end-to-end suite finishes by submitting and photographing her, so **re-seed after any production run** and delete the photograph it pushed to R2, which the seed does not clear (bugs 19, 20). Do not "fix" the card by filling everyone in.

**No pinned clocks.** `daysUntilShow()` measures against the real clock; the *seed* dates the demo show a fortnight ahead of seed time so the dashboard still reads as urgent. A pinned date was tried and had to go once the database held real shows (bug 18).

**Never state a count in a zero-bout string.** Publishing a show before entering its running order used to produce "a tale of the tape for all 0 bouts" and a chase list congratulating the promoter that "every profile on the card is finished" about a card with nobody on it. Those strings live in `lib/copy.ts` where the zero can be tested, and a test asserts no zero-bout string states a count, invites a tap, or breaks the tone rules (bug 28). Fixing a crash is not finishing the case.

## Copy and tone

These came from the originator directly and are easy to undo by writing something that merely reads well.

- **British English throughout.** "Programme", "optimise", "centimetres".
- **Never shame a promoter or a fighter.** An early version led on what the promoter lacked and told a fighter what they had missed. It now leads on what the room gains and offers a fighter a place on the card. A blank profile is a state to be handled gracefully, never a fault to be pointed out.
- **No laddy register on the product's own surfaces.** Fight idiom is fine *inside* the programme, where it belongs; the pitch page, the dashboard and the forms are plain and professional.
- **No unverifiable claims.** No "takes about four minutes", no invented engagement figures. The "last show" numbers were once fabricated and were the most dangerous thing in the demo, because they would have been repeated to a sponsor. Real counts or explicit zeroes, and the dashboard says nothing on it is estimated.
- **No gendered pronouns in generated messages.** The nudge said "has already sent his" on a card with four women's bouts. There is a test that fails on any of them.
- **EventIQ branding is prominent on marketing and promoter pages, discreet or absent on event pages.** The programme is the promoter's product and their sponsors are paying to be on it. `lib/masthead.ts` decides this by pathname, and once there is a masthead a page says EventIQ at the top once, not twice. The sponsor-strip emblem is deliberately monoline so EventIQ does not shout over the sponsors it sits beside.
- **Sponsor names are set in the app's own typography, never in generated artwork.** Image generators misspell text and a real business's name must never be wrong. Logos are emblems only.

## Where things live

```
app/            routes; server actions live next to the page that posts to them
components/     UI; components/sequence/ is the video composition
lib/            derivation and helpers, all pure and unit-tested
lib/db/         the only files that know what the tables look like
db/             schema.ts is the single description; migrations are generated
data/event.ts   the demo card — now only the seed, nothing reads it at runtime
scripts/        renderer, cutouts, seed, e2e, deploy, screenshots, sales tour
```

The seam that matters: `lib/db/queries.ts` maps rows onto the same `Fighter`, `Bout`, `Sponsor` and `FightEvent` types the original fixture used, and `loadCard()` fetches a whole show in six queries. Everything downstream is a pure function of that `Card` object — `lib/tape.ts` and `lib/promoter.ts` never see a database, which is why they kept every test through the move from fixture to D1. Keep new derivation on that side of the line.

## Testing

`npm test` is the derivation layer, which is pure and therefore cheap to test. It does not touch a database or a browser.

The other half is `scripts/e2e.mjs`, 25 steps through a real browser:

```bash
npm run e2e -- --base http://localhost:8788     # against the Workers runtime
npm run e2e -- --base https://eventiq.win --password '...'
```

It is the only thing that would catch a form posting to the wrong action or a cookie that never gets set. It **writes as it goes** — adds a bout, removes it, fills in a fighter, uploads a photograph — so pointing it at production means re-seeding afterwards, and it is not something to point at a card a promoter is using.

Two things it taught, worth knowing before writing another one: the design sets labels in CSS uppercase so `innerText` shouts where the source does not, and React ignores a value written straight onto an input, so a test has to go through the prototype setter and fire the event React listens for.

## Conventions

**Commit messages describe what changed about the product's behaviour, in a sentence, often by naming the wrong old behaviour.** No conventional-commits prefixes, no ticket references, no trailing full stop. The existing log is the spec:

```
Decide what an upload is from its bytes, not from its declaration
Hash passwords at a count the edge will actually run
Show the photograph a fighter actually sent, not a plate saying to send one
Say the card is empty once, and stop claiming fifteen bout slots on every card
Stop the local dev server redirecting itself to a port with no https on it
```

One logical change per commit. Documentation is committed alongside the behaviour it describes, or as its own `Write down...` commit when it is only documentation.

**Comments explain constraints, not mechanism.** The codebase is deliberately light on narration and heavy on the one-line note saying why a value cannot change. Reasoning that runs longer than a line or two goes in HANDOVER.md, which is why that document is as long as it is.

**When something works everywhere except live, reach for `wrangler dev --remote` before reaching for the logs.** The edge runtime differs from every runtime you can test on, and PBKDF2 is unlikely to be the only limit it has.

---

## How this got here

The conversation that produced this, in order, because several of the decisions above only make sense against it.

**1. The idea.** The originator goes to amateur MMA shows and the programme on the table gives you a fighter's name, gym and weight class and nothing else. His pitch: a digital programme behind a QR code, questionnaires out to every fighter, a tale of the tape for every bout, sponsors and Instagram links so the fighters are motivated to fill it in. The line that anchors the whole product is **"people want a reason to root for someone."**

**2. Two refinements that changed the build.** He asked for **video generation from the still photos, "like UFC"** — which became the centrepiece rather than a garnish — and said **"we need it to look spectacular to sell it to promoters"**, which reframed the first version from a system into a pitch artifact. Operational completeness was traded away for visual impact, deliberately.

**3. A photograph of a real programme** (BUDO 79, Grangemouth Town Hall) arrived partway through and corrected the data model. Amateur cards are *mixed* — C-class Muay Thai, semi-pro boxing and amateur MMA on one bill — so `discipline` and `classLabel` are per bout, not per event, and weights are round catchweights in kg. They run to 15 bouts, not eight. And **every individual bout carries its own sponsor**, a revenue line promoters already sell that had been missed entirely. That is now the strongest commercial argument in the pitch. HANDOVER section 5. **Get more of these photographs**; every one has contained something like this.

**4. "Make it real."** Shown the finished demo, the response was *"you are the fucking developer, make it real, i didnt ask you for a fancy demo, i asked you to build it."* That is the hinge of the whole project. Five things were facades and all five are now real: there was no database (a fixture at `data/event.ts`), the questionnaire saved nothing, `/promoter` was public, the record import returned hardcoded data, and the "last show" figures were invented. `output: "export"` was the first thing removed — it was load-bearing for the demo and it is exactly what made a backend impossible. Then it was deployed to eventiq.win for real, which surfaced the PBKDF2 ceiling as a production 500 that no local test could reproduce.

**5. Sponsors.** He asked for **Mouthguards.pro, FightIQ.win and EventIQ** as real sponsors. They lead the show-sponsor strip and appear inside the main event video, which is where the value is. FightIQ.win still has no strapline because nobody has said what it does, and inventing a description of a real business seemed worse than leaving it blank.

**6. Copy and tone.** He asked for the marketing copy to be rewritten: more professional, less laddy, and with any shaming of promoters or fighters removed, while keeping the fight idiom inside the programme itself. That produced the rules above and about six commits of rewriting, plus retaking every screenshot because the copy had changed.

**7. Branding.** "EventIQ needs to be more prominent at the top" — then, immediately and importantly, **"prominent on the web page, but definitely not on the event page."** The programme is the promoter's product. That asymmetry is `lib/masthead.ts` and it is a product decision, not a styling one.

**8. Reviews.** A code review and a security review found six things and an independent audit found three more; closing the photograph-to-video gap found two. All eleven are fixed and written up as bugs 21–31. The most serious was the capture page leaking unpublished shows. The most instructive is the SVG upload, because "validate the bytes, not the declaration" is exactly the kind of rule somebody relaxes later while adding a format.

**9. The photograph-to-video gap.** Asked whether the pipeline actually worked end to end, it did not: nothing generated a cutout on upload, so a fighter who sent a photograph appeared in their video as though they had sent nothing. It survived as long as it did because **the seeded card is the one card where every fighter already has a cutout**, so every check of the centrepiece was a check of the one state that was never in question. Anything only ever exercised against the demo data is worth re-checking against a fighter who has just filled the form in.

## What is outstanding

The reasoning lives in [HANDOVER.md](HANDOVER.md) section 19. This is the short version of that list, split into what needs a person and what needs a commit. Numbers in each list are local; the handover is the canonical order.

**Needs the originator, not code:**

1. **Get a single real show onto the platform.** Not code. Free if necessary. This is the first item on the roadmap: until one promoter runs one real card, every subsequent ordering is a guess. Blocked by the next item, not parallel with it.
2. **Consent wording, a privacy notice, a lawful basis and a retention policy.** Blocker on item 1. The demo is invented people so nothing applies; the moment real amateur fighters' photographs, ages and hometowns are collected and published, with sponsor monetisation attached, it has to be in place first. The questionnaire is the natural consent point — design it in rather than bolting it on.
3. **Turn on "Always Use HTTPS"** in the Cloudflare dashboard, under SSL/TLS → Edge Certificates. Files under `public/` and `_next/` are served by the assets binding without the Worker running, so the app-level redirect in `proxy.ts` cannot reach them and `http://eventiq.win/fighters/*.webp` answers 200 with no redirect. The deploy token cannot set this.
4. **Rotate the Cloudflare API token**, which was handled in chat during this build and should be treated as known. The promoter password and `SESSION_SECRET` have already been rotated; the token has not. While in there, drop **Cloudflare Pages · Edit** from its scopes, which nothing uses. [DEPLOY.md](DEPLOY.md#what-is-left-to-do) keeps the live list.
5. **Decide where `RENDER_KEY` lives.** Nobody holds it today: it is set on the Worker, cannot be read back, and whoever wants to render mints a fresh one. That is fine while one person renders on their own laptop and is the wrong shape the moment two people or a cron job need to. A password manager entry, not a file in the repository.
6. **What does FightIQ.win do?** A strapline would also even up the sponsor strip.
7. **Real fighter photographs**, with permission, from one local gym. The generated portraits demonstrate the idea but a promoter who recognises nobody will notice.
8. **The commercial model**: a per-event fee, a share of bout sponsorship, or a free programme with the post-event sponsor report as the paid upsell.
9. **Reprint the table card from the live URL.** The QR encodes the origin it was served from, so one printed from a laptop is useless at a venue.
10. **Decide the tenancy model before promoter number two.** One promoter, created by the seed, and no signup. With a second, `RENDER_KEY` becomes a cross-tenant read and the global `fighters` table becomes a data-sharing and consent question. Cheap to decide now, expensive later. HANDOVER section 19 item 11.

**Code work, in rough order of value per unit of effort:**

1. **Error reporting, and a D1 export that is actually a backup.** Small. Nothing phones home today; a 500 on show night stays a 500 until somebody logs in. D1 time travel is 30 days and is not a backup. HANDOVER section 19 item 3, section 20.
2. **A `cancelled` flag on a published bout.** Small. Withdrawals happen on every amateur card and there is no way to say "this bout is off" once spectators are reading it; deleting it destroys the sponsor placement and the analytics history. A struck-through bout and a "withdrawn" line. This is not "live on the night". HANDOVER section 19 item 4.
3. **Give the promoter the record importer.** The endpoint exists and works; it needs a paste box in the card editor. The valuable version is the promoter pasting links for the thirty fighters who never reply. Biggest lever on the weakest part of the product.
4. **Make the fighter's share loop deliberate.** The "Download for Instagram" link already exists wherever an mp4 does; nothing prompts a fighter to use it, nothing burns the event into the video, and nothing records whether anyone ever has. Cheapest growth available.
5. **Re-record the sales demo.** The committed cut predates the database and no longer shows the strongest thing there is to show: a fighter's entry landing on the card and the counts going up. `scripts/tour.mjs` scripts it; HANDOVER section 17 has the hard-won recording details, every one of which cost a re-record.
6. **Send the invites.** They are copied and pasted by hand today. `sentAt` already exists to record it.
7. **An audience scorecard.** Crowd opinion, never a result; switchable off per event; scored once after the bout, not live judging. Speculative until a real show has run. Feeds the sponsor report. HANDOVER section 19 item 9 for the risk, which is load-bearing.
8. **The post-event sponsor report.** The counting is done; what is missing is a one-page thing a promoter can hand a sponsor. Probably the thing they would actually pay more for. Wants the scorecard's numbers in it.
9. **Tenancy before promoter two**, of which a change-password form is the small piece of code and understates the decision above. Per-promoter render keys; whether fighters are shared.
10. **Returning fighters.** The schema already keeps fighters across events; what is missing is matching them on the way in, so a second show offers "confirm your details" rather than a blank form. Across promoters this waits on the tenancy decision and on consent.
11. **Cache the public programme for the show window.** Small. Several hundred spectators, ninety minutes, six D1 queries per load, and the card does not change.
12. **An accessibility pass.** Small. Contrast, focus order, screen-reader labelling. Nobody has checked.
13. **Render on a schedule.** `--stale` makes this a one-line cron on any machine with ffmpeg. Cheap version that still needs the laptop.
14. **Render the remaining ten bouts** so no bout in the demo is a dead end.
15. **Put the renderer on Cloudflare Containers.** Architectural, not a config change. HANDOVER section 11. Do not confuse it with Browser Rendering, which remains the wrong tool.

Explicitly out of scope so far: native app, ticketing, betting, live scoring, AI image-to-video models, music beds. Live scoring means round-by-round judging, not the crowd scorecard. "Live on the night" is attractive and is a different product with different reliability demands — do not let it in early. The cancelled-flag item above is the exception that proves that, not a weakening of it.
