# EventIQ roadmap

What is built, what is next, and how the work gets done. [HANDOVER.md](HANDOVER.md) says why things are the way they are; [CLAUDE.md](CLAUDE.md) says how to work here; [DEPLOY.md](DEPLOY.md) says how it reaches Cloudflare. This file says what to build next, in order, and what is deliberately not being built. Dates are when the item landed on `main`.

## Position

EventIQ is **free for promoters**. The competition (myfightcard.com and the like) is a card viewer the promoter types into. EventIQ's edge is the second half of the product: fighters fill in their own details, every bout gets a generated video, sponsors get placements and real counts, and the promoter gets a chase list. Every feature below is judged by whether it deepens that gap.

## Done

**v1, September 2026** — from demo to product. Security gates (media gate, rate limits, lockout, CSP), CI, backups and a rehearsed restore, error boundaries and structured logs, the render pipeline on GitHub Actions with a leased queue and fingerprinted keys, operator-created promoter accounts, render keys in the database, invite tokens sealed at rest, consent and a privacy page, the promoter-side record importer, cancelled bouts, sponsor emblems, a staging environment, trustworthy counting with rollups, database-backed tests, one ownership chokepoint, an accessibility pass. HANDOVER section 14 carries the 46-entry bug ledger from this work.

**v2 tier one, 28 September 2026** — turning every show into the next customer:

- Persistent fighter profiles at `/fighters/[id]` and returning-fighter matching (`lib/fighter-match.ts`: a namesake is a question for the promoter, never a silent merge).
- The share loop: the face-off as a second video per bout (`render_jobs.template`), the programme's QR in its close, "send their video" per fighter, shares counted as taps.
- Public discovery at `/shows`, in the sitemap, with `SportsEvent` structured data.
- Paste the matchmaking sheet (`lib/sheet.ts`), or drop the posters and crop both corners.
- Two review-and-fix passes over the whole codebase (38 commits; the findings are in the ledger).

Six video templates exist in the renderer (`components/sequence/templates.ts`); only `tape` and `faceoff` are published. `walkout`, `social`, `countdown`, `card` and `doors` render from the command line and are not offered to promoters.

## Next

Ordered by value per unit of effort. S is hours, M is days, L is a week or more. Each item is sized to be one Opus agent in one worktree.

### Tier two: the night itself

1. **Live on the night** (L). The MC or promoter enters results from a phone; the programme updates for everyone who has it open; "next up" is visible without a reload. Reliability is the whole job here: it was deferred on purpose and should ship behind a per-event switch, default off, with the programme degrading to the static card if anything is unsure. Do not build round-by-round judging.
2. **Audience scorecard** (M). Crowd opinion after each bout, never a result, switchable off per event, feeding the sponsor report. HANDOVER section 19 item 9 for the risk, which is load-bearing.
3. **Highlights and recap** (M). A results video per bout and a full-card recap the morning after, rendered the same way the tape is. Templates exist; results data does not until item 1.

### Tier three: money

4. **Sponsor report** (M). A one-page PDF after the show with real counts per placement, ready to send. The counting is done; the shape of the page is the work. Probably what promoters would pay most for even while the product is free.
5. **Sponsors buy in-app** (L). A sponsor picks a bout, pays by card, uploads an emblem, gets their own link and their own counts. Needs a payment provider decision; Stripe is the obvious one.
6. **Self-serve signup** (M). Promoter accounts without an operator, with email verification. Today `npm run promoter -- create` is onboarding, which is fine until the day it is not.
7. ~~**Ticket link**~~ (S), done; then **tickets** (L). The link is on the programme until the show's day has passed, set from the card editor, https only and checked in the action, with taps counted (HANDOVER section 6i). QR ticketing is what is left, and it gives the promoter a headcount before doors.

### Tier four: polish that compounds

8. **Real sending** (M). WhatsApp Business API instead of deep links, with scheduled reminders to fighters who have not opened. Needs a Meta business account.
9. **Push through the PWA** (M). "Your fighter is up in two bouts." No app store.
10. **More published templates** (S each). `walkout` needs a `corner` column on `render_jobs` before it can be published; `countdown` and `doors` need a show-level job row. The plan is written at the foot of `components/sequence/templates.ts`.
11. **A promoter's own domain** (M). Their programme on their name; EventIQ discreet, which is already the rule in `lib/masthead.ts`.

### Known debts, from the reviews

Judged too risky for a review commit; each is one small job.

- `loadCard`'s `inArray` over fighter ids hits D1's 100-parameter limit at about 50 bouts (`lib/db/queries.ts`). Real cards are 15. Chunk it before anyone runs a tournament.
- `loadShowcase` gates itself in `lib/db/queries.ts` rather than beside the other gates in `lib/visibility.ts`. Move it.
- `scripts/r2-orphans.mjs` does not know the `posters/` prefix; `uploadPoster` can leave an object no row points at.
- `PosterCrop` is drag-only; a keyboard path is owed.
- `/api/health` reports `env: "production"` on a local dev server because `EVENTIQ_ENV` is a bound var. Make the label honest locally.
- `arg()`, `run()` and `d1Query` are duplicated across seven scripts; one `scripts/cli.mjs` would do.
- `npm audit` reports findings in the build chain only (wrangler → miniflare → sharp, the background-removal model, `qs`). None reach the Worker bundle. Fixing them means moving off the pinned wrangler; do it deliberately, with a staging deploy first.
- Migration `0015` put `template` into the render fingerprint, which marked every existing render stale once; the hourly runner has since re-rendered them. `stylised` is not in the fingerprint and is covered by the fighter's `updatedAt`; adding it would do the same again.

## Only the owner can do these

- In the Cloudflare dashboard: Always Use HTTPS, a cache rule for `/e/*`, and delete the old API token. The deploy token has no zone permissions.
- Password manager entries for the secrets: `INVITE_KEY`, the staging secrets, the runner's render key, the promoter passwords.
- A lawyer's eye on the consent wording in `lib/consent.ts` and `/privacy`.
- The commercial model beyond "free", and whether the demo card stays as the production showcase (`SHOWCASE_SLUG`).
- Real fighter photographs with permission, and the first real show. Until one promoter runs one real card, every ordering above is a guess.

## Deliberately not building

A native app, AI-written fighter bios, AI likenesses of real fighters (a stylised opt-in exists behind a flag, never presented as a likeness), round-by-round judging, betting, music beds. Each has been considered and each costs more than it earns at this size.

## How the work gets done

- One agent per item, in its own git worktree off `main`, with a dev server on its own port. On an 8 GB machine, no more than two or three at once: six dev servers crashed workerd (bug 39).
- Every item ships with: lint, typecheck, both vitest projects (`npm test`), and the 28-step walkthrough (`node scripts/e2e.mjs --base http://localhost:<port>`). Anything touching the compositions keeps the golden frames.
- Merge to `main`, then `npm run deploy` (migrations first, then the Worker) and `node scripts/deploy.mjs --env staging`, then the staging suite from GitHub (`gh workflow run e2e-staging.yml --ref main`). Production renders happen on the hourly workflow; `gh workflow run render.yml --ref main -f slug=<slug>` for a one-off.
- Migrations are numbered in merge order; the next free number is `0017`. When two branches both claim it, renumber and rebuild the snapshot chain so `npm run db:generate` reports nothing.
- Commit messages name the wrong old behaviour in a sentence. New bugs go in HANDOVER section 14 with the rule they left behind. Copy goes in `lib/copy.ts` with the tone tests.
