# EventIQ — beyond fight sport

The originator asked whether this should serve sports other than amateur MMA, and named **local and grassroots football** in particular, on the reasonable grounds that far more people play and watch it. Two investigations followed: one outward at the football market, its data and its money, one inward at what generalising this codebase would actually cost. They arrived at the same answer from opposite ends.

This document exists so that neither has to be run again, and so that whoever reopens the question inherits the reasoning rather than only the verdict. Companion to [HANDOVER.md](HANDOVER.md), which is why the product is the way it is, and to [CLAUDE.md](CLAUDE.md), which is the short version for somebody about to change something.

Structural claims cite a file and a line, counted at this commit. Market claims cite the source beside them. Section 10 separates what was verified from what was inferred, and names what could not be established at all.

---

## The answer

**Go wider within fight sport now, because boxing, Muay Thai and K1 already work with no code written. Treat football as a second vertical on shared foundations if and when a football customer exists. Do not generalise the fight domain in place.**

Football is genuinely the bigger market and nothing here disputes that. It is bigger by roughly two orders of magnitude in clubs, it has a compliance hook worth a fine, it has better structured data than MMA does, and it already sells the exact inventory this product was built to sell. It is still the wrong next move, for four reasons that are each fatal on their own and are cumulative together.

- **Fight sport widens for free and football does not.** Because the BUDO 79 programme photograph forced `discipline`, weight, class, rounds and billing onto the *bout* rather than the event (HANDOVER section 5), a promoter can put semi-pro boxing, C-class Muay Thai and amateur MMA on one card today and every surface handles it. That is the highest return available and it is a distribution problem, not a build problem.
- **What a football club wants is not what this product sells.** Its pain is an unpaid volunteer's Tuesday evenings and a £50–£500 fine, not a programme that looks better. EventIQ's entire sales mechanism is looking spectacular.
- **The data stops exactly where the product starts.** Football's feeds give fixtures, tables, form, appearances, goals and line-ups. None of them gives a photograph, a height, a date of birth or a home town. Everything a tale of the tape is made of would still have to be collected from sixteen players per squad per fixture, half of them at a club that is not your customer.
- **Generalising in place would rewrite the parts that are hardest to get right and best tested, for a sport that does not even need the generalisation it would buy** — a fixture is two sides, exactly like a bout.

Where the support for each of those lives:

| If you want | Read |
| --- | --- |
| Why fight sport is already wider than the product says | section 1 |
| Whether football clubs would buy, and from whom | section 2 |
| Whether football's data is obtainable and sufficient | section 3 |
| What clubs already sell and at what price | section 4 |
| What the code would have to change | section 5 |
| The three ways of doing it, and why one is recommended | section 6 |
| The two things neither investigation found alone | section 7 |
| Every other candidate sport, ranked | section 8 |
| What would have to be true to change this answer | section 9 |

---

## 1. Fight sport is already wider than the product says it is

This is the recommendation, and most of it is already true rather than proposed.

**Mixed-discipline cards work now, because of a decision already made rather than luck.** `discipline`, `weightKg`, `classLabel`, `titleLabel`, `womens`, `rounds`, `roundMinutes` and `billing` are all columns on `bouts` ([db/schema.ts:248-273](db/schema.ts)) and not on `events` — the correction the real programme photograph forced, written up in HANDOVER section 5. `DISCIPLINE_LABEL` ([lib/tape.ts:13](lib/tape.ts)) already covers MMA, Muay Thai, boxing, K1 and grappling; `boutClassLine` at `:65` and `boutFormat` at `:73` compose their line from per-bout fields; `weightLabel` at `:48` prints the round kilogram catchweights those cards actually use. So the programme, the dashboard, the chase list, the sponsor inventory and the video all already handle a bill that mixes disciplines.

**Boxing, Muay Thai and K1 are therefore zero code and zero risk.** They are one-versus-one, they have a card and a programme tradition, their sponsorship is mature, and a single promoter usually decides and pays alone. Every word the product puts on screen for them reads correctly today, including the corner vocabulary, which is *more* literal in boxing than it is in MMA.

Where fight sport falls short of itself is in the derivations and the words, never in the schema:

- **No hook checks the discipline.** `discipline` appears exactly once in [lib/tape.ts](lib/tape.ts), at `:69` inside the class line. `buildHooks` at `:372` is nine two-body comparisons written in striking-and-grappling terms, so a grappling bout can be sold on a finish rate computed from knockouts.
- **`finishCount` at `:129` is knockouts plus submissions**, clamped to the win column. Right for boxing, where submissions are zero by construction; wrong for grappling, where a knockout is a number a promoter should never be shown.
- **`ROW_SPECS` at `:247` shows reach for every bout.** Central for boxing, irrelevant for grappling, and meaningless for darts or snooker.
- **`STYLE_OPTIONS` ([lib/questionnaire.ts:69](lib/questionnaire.ts)) is an MMA style list** offered to every fighter whatever they are competing in.
- **`boutFormat`'s rounds-times-minutes framing** does not describe a BJJ match, which is one period, nor darts, which is best of legs or sets.

So grappling and BJJ are cheap but not free: discipline-aware hook selection, a discipline-aware row list, a per-discipline style vocabulary, and a format field that is not rounds multiplied by minutes. All of it is additive work inside `lib/tape.ts` and `lib/questionnaire.ts`, both of which are pure, thoroughly tested and touch no schema and no gate. Nothing in it goes near authorisation, consent or the renderer.

The corner vocabulary is the one thing that does not travel across all of fight sport. It is exactly right for boxing, Muay Thai and K1, defensible for MMA, and wrong for BJJ, darts and snooker, where the two sides are not corners.

---

## 2. What football would be buying, and who would be buying it

### The programme mandate, which is the commercial crux and is being repealed

The FA's *Standardised Rules*, adopted by National League System leagues at Steps 1 to 6, rule 8.14: the home club "is responsible for publishing a full match programme acceptable to the Board for each of its Competition matches", with a bracketed clause — the FA's convention for a provision an individual league opts into — permitting an electronic-only programme provided the league approves before the season starts and the format is "continuous for the whole of that Playing Season". "A Team Sheet will not be considered sufficient to comply with this Rule." **The obligation to publish is not bracketed; only the permission to do it electronically is** (FA Standardised Rules 2024-25, thefa.com).

The same rule obliges the *visiting* club to send the home club, at least five days before the match, its matchday squad and management team "together with any supplementary information required by the Competition" — which may include the crest, club history, "up-to-date pen pictures of their current Players", the latest team photograph and kit colours — and the home club's programme "must include the details sent by the visiting Club". That five-day rule is the only leverage anyone has over an away squad, and section 7 is about what it does not cover.

It is enforced with money. Southern Counties East Football League, at Steps 5 and 6, publishes its scale (scefl.com): non-publication £50–£200, an unacceptable programme £30–£120, failing to provide information to hosts when playing away £30–£120, and a programme bringing the competition into disrepute £100–£400. Its minimum specification is an eight-page booklet carrying the league sponsor's and the FA Respect logos on the cover, the club's Companies Act 2006 particulars, prominent space for line-ups with officials, the visitors' history or pen pictures, the club's iTrust QR code and two mandated statements on discrimination and foul language. Steps 1 and 2 carry the same obligation with the same once-a-season choice of medium; Maidenhead United's 2026/27 announcement states it plainly. For Steps 3 and 4 — the Trident Leagues, Isthmian, Northern Premier and Southern, 226 clubs rising to 240 — a former programme editor states that omitting "the 12 pages of mandatory content leaves your club liable for a £500 fine". **That is knowledgeable secondary evidence rather than a rulebook**, and no rulebook was found to confirm it; section 10.

**The caveat that changes the shape of the opportunity is that this rule is going away rather than spreading.** The Combined Counties League removed it entirely at its 2026 AGM. The EFL removed it in 2018, and Regulation 80.2 now reads "Any Club not producing a match programme will be required to agree alternative inventory with The League". Below Step 6 there is generally no production mandate at all — Kent County Football League rule 28 requires only that visiting details be included *if* a programme exists.

So the compliance wedge is real, it is worth £50–£500 a breach, digital satisfies it in most leagues, it covers the 996 clubs in the National League System across 48 divisions and 19 leagues (FA 2026-27 allocations) — and clubs are actively lobbying their leagues to be rid of it. A wedge that clubs are trying to remove is a wedge with a date on it, and a product whose first argument is "this keeps you compliant" inherits that date.

For scale below that: roughly 18,000 grassroots clubs and 1,100 leagues in England (England Football), none of which has a programme obligation.

### The pain is labour, and that is the finding that matters

Cover prices run £1 to £3 and typically £2.00 to £2.50. One supplier claims digital-print runs of 20 to 40 copies at "well under £2 per copy". The real numbers clubs publish are worse than that sounds. St Ives Town lost £450 and then £750 across two seasons at a £2 cover, went online-only, and **every programme sponsor continued to advertise in the digital edition with no drop in gates**. Northwich Victoria went digital in 2023 because print would have pushed the cover past £3.00. One editor reports selling about 60 in a crowd of 500, with sales down by half over two seasons while the crowd doubled. Northampton Saints, a professional rugby club, sold around 300 printed copies a matchday — "at that volume we are not able to generate any revenue for the Club" — and a digital trial drew 2,500 unique users. For honesty in the other direction: Macclesfield FC claims over 15,000 programme sales a season, which is one unusually well-supported club rather than the level.

And the people producing them are unpaid volunteers in a role that keeps falling vacant. Welling United failed to produce a programme for its 2026/27 opening fixture because the editor left; the club apologised publicly, informed the league and advertised the vacancy. Editors describe "a couple of evenings a week for something 50-odd people flick through and throw away".

**The inference to carry forward: a Step 5 club does not want a better-looking programme, it wants its Tuesday evenings back and the £200 fine avoided.** That is a workflow product. This is a spectacle product, deliberately — "we need it to look spectacular to sell it to promoters" is the instruction that shaped the whole build (HANDOVER section 1). A pitch built on "your programme will look better" is dead on arrival at this level. A pitch built on "you will not have to make one" is not, and it is a different product from the one that exists.

### The space is already occupied

| Who | What they sell | Why it matters here |
| --- | --- | --- |
| **Zeeon** | Interactive digital match guides, drag-and-drop designer portal, QR codes round the ground, analytics, free to fans. Founded 2021, 1–10 staff, "over 150 teams across rugby, football and cricket" — Northampton Saints, Exeter Chiefs, Sale Sharks, St Helens RFC, Birmingham Moseley, Sheffield United Women | The direct competitor, and strongest in rugby. In August 2024 it shipped an "Interactive Squad Profile" framed exactly as this product frames per-bout sponsors: "In the past, squad profiles were often found at the back of the publication, so how effective was that for player sponsors? … Fans can click on a player's sponsor to go directly to their website" |
| **The Non-League Network** | Interactive programmes "from only £150 per programme" | Prices the ceiling |
| **Gamechanger Sports** | 40, 60 and 80-page tiers, and it builds a bespoke database of local businesses and sells the programme to them | The sponsor-acquisition service is the interesting part, and it is the part clubs would actually pay for |
| **Matchday-Online** (Cipher Graphics) | Web-to-print self-serve template, club builds its own in about half an hour. £150 one-off for 8 variable pages, £220 for 12, plus printing | Explicitly aimed at clubs that "find creating a programme in house challenging" — the same buyer, at a one-off price |
| **MatchDayCreative** | Design agency plus PDF hosting and print on demand | |
| **Swipebooks** (YFS Media) | Mobile-first swipe format with a permanent QR poster reused every fixture | Closest in format philosophy to this product |
| **MatchDay Digital** | Aggregator app on revenue share | A publisher model, not a club tool |

On top of that, the club platforms are already installed: **Pitchero** (free, £38 or £99 a month, "over 60,000 club volunteers", and it already does fixtures, results, tables, **player profiles**, statistics, match reports and sponsor pages), **Spond** (free and dominant for scheduling and payments), **TeamFeePay**, **Teamo**, and the FA's own free **FA Matchday** app on the Whole Game System.

**What was not found** — and this is absence of evidence rather than evidence of absence — is anyone at this level who either populates a programme from a data feed instead of a volunteer typing and dragging, or generates video. That is the gap, and it is narrow.

### Who decides, and when

Governance is a committee or a board of volunteers: chair, secretary, treasurer, commercial manager, media, fan engagement, community, sometimes operations. At the formal end, 1874 Northwich is fan-owned with provision for fifteen directors, work divided into ten "Business Development Areas" including "IT, Technical and Web-site", an annual planning cycle and monthly board meetings.

**This is materially worse than selling to an MMA promoter and it should be said plainly.** A promoter is usually a single owner-operator who controls the venue, the card, the fighters and the money and can decide in one conversation. A non-league club has a commercial manager who wants it, a treasurer guarding the budget, a committee that ratifies it, and in fan-owned cases an AGM. The buyer and the budget holder are different unpaid volunteers. There are 996 clubs rather than a few dozen promotions, and each sale is slower and more diffuse.

The budget position is blunt. Nuneaton Town's stated aim is "to operate as close to cost-neutral as possible". Programme editors are unpaid. Clubs went digital because they could not absorb a rise in print cost. Step 6 clubs run print runs in single figures purely to avoid a fine. A new recurring subscription is a hard sell; a cost that visibly displaces printing and volunteer hours is not. The anchors to price against are £150–£220 one-off (Matchday-Online) and £38–£99 a month for an entire club platform (Pitchero).

**The season timing is unusually clean and is operationally the most useful thing in this section.** Commercial brochures launch in May — Worthing on 14 May 2026, Spennymoor on 11 May 2026, Macclesfield in May 2026. Selling runs June and July: Nuneaton had £42,600 committed by the end of May and £72,217 by mid-July, received in advance. The season starts in mid-August. League AGMs, where programme rules change, sit in May and June; both the Combined Counties repeal and SCEFL's guidance refresh landed then. **So any approach happens in April, May or June.** By late July the brochure is printed and the budget is set, September to February is talking to exhausted volunteers with no money left, and March is when next season's thinking starts.

---

## 3. Football's data, and the line where it stops

This is where football diverges most sharply from MMA, in both directions — the feeds are far better than anything fight sport has, and they omit the only fields this product is made of.

### FA Full-Time is closed, deliberately, and the licence settles it anyway

The FA's own support article explains the closure in terms that read as though written about this use case: "For security purposes full time feeds / code snippets have been removed from public pages. We made a decision to move the Code Snippets into the admin area to reduce the risk of other sites or products scraping our sites for ALL leagues fixtures and results data. In the past, the Full-Time site has had it's performance severely affected by unlicensed websites trying to pull data across all of our competitions." Embed snippets still exist, but only inside Full-Time admin and only for registered league or team administrators. Clubs do embed their own table and fixtures that way, and third parties publish guides to it.

Tested directly from this infrastructure, `https://fulltime.thefa.com/` returned **HTTP 403** behind a Cloudflare challenge while `https://www.thefa.com/` returned 200, and the same Full-Time host was reachable through a third-party proxy on different infrastructure. **The block is therefore IP reputation rather than an absolute refusal**: a real browser on a domestic connection reads Full-Time perfectly well, and a Cloudflare Worker is precisely the kind of datacentre origin that gets challenged. That is the same wall Tapology put up in front of the record importer, and HANDOVER section 8a already settled how to read it — a block a Worker could route around is a declaration that we are unwelcome, not an obstacle.

The licence position makes the technical question moot. The FA's terms of use prohibit users from "publish, distribute, extract, re-utilise, or reproduce any part of the Media in any form", state that "you shall not incorporate any material from any part of the Media in any commercial work or publication", and separately prohibit anyone who would "web scrape or crawl any of our Media". The same wording appears on County FA sites, and Full-Time carries additional terms under which the league and the club are data Controllers and the FA is Processor. **Scraping Full-Time is off the table on licence grounds whether or not it can be made to work.** This is the principle HANDOVER section 20 already states about Sherdog — a robots.txt permitting crawling is not a licence — except that here there is no permission to misread in the first place. Community libraries calling undocumented POST endpoints do exist. Do not build on them.

### Football Web Pages is the actual answer, and it is a good one

Football Web Pages states that it makes its data "available to **non-league football clubs for free** for use on their official/public website only". Authentication is an `FWP-API-Key` header, the rate limit is ten requests a minute and negotiable, and the base URL is `https://api.footballwebpages.co.uk/v2/`. Endpoints cover competitions, fixtures-results, league-table, form-guide, **appearances**, **goalscorers**, attendances, league-progress, match with line-ups, records, rounds and teams. Tested, the host returns **400 without a key rather than 403**, so it is reachable server-side and simply wants authenticating — a materially better technical position than Full-Time.

Coverage reaches the level that matters: Step 5 and Step 6 divisions were verified with full table, fixtures, form guide, appearances, goalscorers and attendances (Combined Counties Premier Division South and Division One). It is becoming the de facto official data layer at that level. SCEFL states that "All Leagues at Steps 3 and 4 use them as their only host of live match information … We were the first Step 5/6 League to fully commit to FWP and once we were on board other leagues at our level quickly followed", and the Hellenic League joined for 2026/27 across all its Step 5 and 6 competitions. SCEFL also confirms that embedding is normal practice among its clubs.

Three constraints not to gloss over:

- **"Official/public website only" is a real limit.** A multi-tenant service pulling many clubs' data through one key is plainly outside that grant. The defensible reading is a key per club, used on that club's own or club-branded domain, with Football Web Pages told exactly what is being done. **That conversation costs nothing and is the first step of any football experiment**, ahead of any code.
- **Ten requests a minute** is comfortable for a scheduled nightly fetch into our own store — which is already the shape of the record importer — and hopeless for rendering on demand.
- **It appears to be one small business.** Concentrating an entire vertical's data layer on it, with no contract behind it, is a single point of dependency of exactly the kind HANDOVER section 20 tracks elsewhere.

### The crux

**The feed stops exactly where the product starts.** Football Web Pages gives fixtures, results, tables, form, attendances, appearances, goals, line-ups and head-to-head history. It gives **no photograph, no height, no reach, no date of birth, no position and no home town**. Nothing at this level gives those. Everything a tale of the tape is built from would still have to be collected from the players themselves — sixteen from each of two squads, every week, one of which is not your customer and has no incentive beyond the league's five-day rule.

Commercial providers — Sportmonks, API-Football, TheStatsAPI from $50 a month, football-charts — sell the shape of data anyone would want, but all are professional-football-first, and **it could not be established that any of them reaches Step 5, Step 6 or county level**. Treat that as unverified rather than as a no.

Youth and Sunday league can be discounted entirely. Affiliated data lives in Full-Time and FA Matchday, which is the closed system; everything else is a spreadsheet and a group chat. No feed, no gate money, no sponsors, no programme.

---

## 4. What clubs already sell, and for how much

Every club publishes a sponsorship brochure as a PDF, so this is unusually easy to verify.

| Club (level) | Match sponsor | Matchball | Player | Programme advertising |
| --- | --- | --- | --- | --- |
| Histon FC | £150+VAT | £50+VAT | £100+VAT, other teams £25 | £100–£250+VAT; full page £250, half £150 |
| Lancing FC | £250 a game | £75 a game | in bundles | £250 a season; £25 single advert; man of the match £75 |
| Erith Town (Step 5) | £300 a match including a named man of the match | £100 a match | in bundles | full page £250, half £150, quarter £150, or £25 for a single match |
| Spennymoor Town (Step 2) | £1,000+VAT grade A, £600 grade B | £400+VAT | — | advert £200+VAT; whole programme £2,000–£3,000+VAT |
| Eastleigh (Step 1) | £1,250+VAT | — | £50+VAT | programme sponsor £750+VAT |
| Macclesfield (Step 2/3) | in packages | in packages | in packages | Gold from £10,000+VAT; Silver £3,000–£10,000; Bronze £300–£3,000 |

The inventory across those brochures is wider than expected: shirt, shorts, training and travel wear, match, matchball, man of the match, **player**, programme full, half and quarter page, sponsorship of individual programme *features* such as the chairman's welcome or the manager's notes, whole-programme, **teamsheet**, pitchside and crowd-facing boards, dugout, scoreboard, centre circle, stand, stadium naming rights, car park, PA and tannoy, **attendance sponsorship**, supplements, social media packages, clubhouse screens, megascreen, website banner and, at one club, bar napkins.

Two of those findings bear directly on the pitch.

**Player sponsorship already exists and is exactly this product's per-fighter sponsor**, at £50 to £100+VAT a head, already delivered "in the matchday programme for every home game" and "next to your player's profile on the club's website". The concept needs no explaining to anybody. The other edge of that is that Zeeon is attacking a slot that is already sold, and we would be the second entrant into it.

**Digital programme advertising is already priced inventory at Steps 5 and 6.** Erith Town sells placement "in the physical and digital matchday programmes"; Lancing sells a half page and a full page "Digital Programme Ad". This is the strongest single fact in football's favour: clubs at exactly the target level have already decided that a digital programme is a saleable asset and put a number on it.

For scale, Nuneaton Town at Step 4 — recently promoted and well run — reported sponsorship income of £65,210 in a season, up from £27,684, with £72,217 committed for the following season by mid-July against £42,600 at the same point the year before. Treat that as an upper-middle case rather than as the level.

---

## 5. What the code says

### Where "two individuals per contest" is baked in

Eighteen non-test source files reference `redId`, `blueId`, `red_id` or `blue_id`; twenty-seven including tests and fixtures. Fifteen files under `app/`, `components/` and `lib/` carry the corner design tokens, and the composition carries the same two colours again as hard-coded hexes.

**The reframing that drives the whole recommendation is that `bouts.redId`/`blueId` is not one assumption but two wearing one coat: *arity two*, and *a side is a person*. Football does not challenge the first. A fixture is home versus away. It challenges only the second.** That single observation is what makes an N-sided generalisation mostly wasted work.

Where the first assumption lives:

- **Database.** [db/schema.ts:274-279](db/schema.ts) — `redId` and `blueId` are both `text().notNull().references(() => fighters.id)`, two columns rather than a join table and both mandatory. `fighters` at `:198` is global, with no promoter, event, club or season column (the decision and its safety argument are HANDOVER section 19 item 11). `:398` — `uniqueIndex("invites_event_fighter")`. `:450` — `uniqueIndex("render_jobs_event_bout")`. The analytics tables at `:462` and `:524` group by bout number, fighter and sponsor.
- **Types and the card.** [lib/types.ts:94](lib/types.ts) — `export type Corner = "red" | "blue"`, a closed two-member union threaded through derivation, the promoter layer and the composition; `:64-65` for the bout's two ids; `:7` for `Discipline`. [lib/card.ts:102](lib/card.ts) — `cornersOf()` returns `{ red, blue }` and is the accessor most downstream code goes through.
- **Derivation.** [lib/tape.ts:309](lib/tape.ts) — `buildTape(red, blue)`. `:247` — `ROW_SPECS`: record, age, height, reach, stance, finishes, gym, home town, every one a property of an individual human body rather than of a squad. `:354` — `tapeGapsBehind`. `:372` — `buildHooks`, nine two-body comparisons. `:467` — `COMPLETENESS_FIELDS`.
- **The promoter's view.** [lib/promoter.ts:114](lib/promoter.ts) — `rowFor(card, invites, bout, corner)`. The chase list's unit is *(bout, corner)*, and there is no representation of a participant other than "one of the two sides of a bout". `boutReadiness` at `:182` returns `ready`, `lopsided` or `empty`, and "lopsided" only means anything for two.
- **The render pipeline.** [lib/renders.ts:53-79](lib/renders.ts) — eight of the twenty-five `RENDER_INPUT_FIELDS` are the red and blue four, and `renderFingerprint` at `:127` throws on a missing *or extra* field, which makes that list a hard contract with [scripts/render-tape.mjs](scripts/render-tape.mjs). The renderer joins `fighters` twice to read a bout.
- **The composition.** [components/sequence/timeline.ts:14-20](components/sequence/timeline.ts) — `SCENES` has literal `red` and `blue` keys with hard frame windows. The 480-frame, 16-second shape *is* five scenes, two of which are one fighter each. Everything in `TaleOfTheTape.tsx` is parameterised by `Corner`, which is the good news (a parameter rather than duplicated code) and the bad news (a two-member union, driving a split-screen design that means nothing for three).
- **Routes and actions.** [app/promoter/actions.ts:226](app/promoter/actions.ts) — `addBout` creates two fighters, two invites and one bout in a single `db.batch`, so adding a contest and adding two people are the same operation; `removeBout` at `:477` unwinds it. The questionnaire is written in the second person against one named other throughout.
- **Visual language.** [app/globals.css:19-22](app/globals.css) defines `--color-red-corner`, `--color-red-corner-hot`, `--color-blue-corner` and `--color-blue-corner-hot`, the only strong accents besides gold. Useful nuance: in about half of the files that carry them the tokens are being used as "warning red" and "informational blue" rather than as corners at all — `ActionStatus`, `LoginForm`, `RecordImport`, `AddBoutForm`, `PublishToggle` and most of the dashboard, where a red pip means an unfinished profile — which is a naming problem rather than a conceptual one. The genuinely corner-semantic uses are `BoutCard`, `TapeTable`, `FighterPortrait`, `Questionnaire`, `BoutRow`, the programme, the fighter profile and `TapePlayer`, plus the composition, which does not use the tokens at all: `TaleOfTheTape.tsx:37-38` holds the two colours as its own hex constants because it is captured at a fixed size and never themed. And the product's own mark *is* the red and blue split (HANDOVER section 3), so this is a design job rather than a find and replace. Football clubs have colours of their own, which is an opportunity as much as an obstacle.

### What is already sport-agnostic, which is the more important half

**Everything security-critical or operationally critical was written against events, people, invites, objects and counts — nouns that survive a change of sport — and only the derivation and presentation layers know what a fight is.** The majority of the code where a mistake is a security incident or a data loss is therefore already sport-agnostic, and the parts that know it is a fight are the parts that are pleasant to write.

| Subsystem | Transfers | Notes |
| --- | --- | --- |
| Identity, tenancy, sessions | fully | [lib/auth.ts](lib/auth.ts), [lib/session.ts](lib/session.ts). PBKDF2 at exactly 100,000 iterations is a Workers ceiling rather than a preference (HANDOVER section 6a) and carries over unchanged. Render keys are rows scoped to a promoter, [lib/db/queries.ts:555](lib/db/queries.ts) |
| Authorisation | almost fully, and it is the single best asset | [lib/visibility.ts](lib/visibility.ts) is 481 lines deciding who may see what in terms of *published*, *owned*, *invited* and *render-keyed*: entry points at `:87`, `:117`, `:139` and `:273`, branded `VisibleCard` and `OwnedCard` at `:48` and `:51` making a smuggled card a compile error, an eslint rule forbidding `loadCard` under `app/`, `parseMediaKey` at `:321`, `mediaVisibleTo` at `:377` and `mediaVisibility` at `:441`. Its only domain coupling is indirect: `eventsShowingPortrait` ([queries.ts:671](lib/db/queries.ts)) and `trackRefsBelong` (`:583`) reach a person through `bouts.red_id`/`blue_id`, so a new domain supplies one equivalent "is this person on this event" query rather than a redesign |
| Invite tokens | fully, and this is arguably the most transferable idea in the repository | [lib/invite-token.ts](lib/invite-token.ts): an unguessable bearer token, an HMAC digest for indexed lookup and an AES-GCM ciphertext so the dashboard can show the link back, both keys from one secret via HKDF under different info strings. No participant account, no password, no email verification — exactly right for a club secretary holding eighteen phone numbers and no appetite for onboarding anybody |
| Consent | mechanism yes, wording no | [lib/consent.ts](lib/consent.ts) has the right architecture for any sport: version the text (`CONSENT_VERSION` at `:22`), store version and timestamp on the invite, gate in the server action rather than the component (`consentGate` at `:158`), check the age before the tick, keep one authoritative removal set (`clearedFighterColumns` at `:181`). `CONSENT_TEXT` is fight-specific and the column list names fight fields |
| Media | fully | [lib/image-type.ts](lib/image-type.ts) reads magic numbers and `file.type` is never read. That rule is the one most worth carrying forward verbatim (HANDOVER section 6b) |
| The render harness | yes; the composition, no | Generic: `render_jobs` as the only interface, lease-based claiming ([lib/renders.ts:211](lib/renders.ts)), `claimSql` as a single conditional UPDATE with `RETURNING` ([scripts/render-tape.mjs:374](scripts/render-tape.mjs)), `seek()` at `:573` committing the frame then decoding every image then waiting two more animation frames, the ffmpeg invocation, and publish-then-delete ordering so a card never points at a missing object. [lib/capture.ts:33](lib/capture.ts) extracts the readiness check into a pure function over a list of images with no notion of a fighter in it, which is a good sign about the direction of travel. Not generic: `RENDER_INPUT_FIELDS`, the bout fingerprints, the renderer's SQL, and `TaleOfTheTape` itself |
| Sponsors and counting | structurally | Placement at three levels with `sponsorInventory` ([lib/promoter.ts:203](lib/promoter.ts)) is a commercial model rather than a fight model, and football has the same three levels: competition or ground, match ball, kit. `/api/track` takes no credential but writes nothing for an unpublished show and nothing naming a reference that is not on the card, and the live tail folds into the daily table additively so totals never move (HANDOVER section 9) |
| Chase and completeness | mechanism yes, field list no | `inviteStatus` off three timestamps ([lib/promoter.ts:45](lib/promoter.ts)), `DONE_AT = 70` at `:22`, `daysUntilShow` against the real clock at `:29`, and the zero-state copy rules in [lib/copy.ts](lib/copy.ts) |
| Operations | fully | The four CI gates, drizzle migrations, the seed's structure, the browser walkthrough as a pattern, structured logging, the R2 orphan finder, the backup script, [lib/masthead.ts](lib/masthead.ts) deciding branding by pathname. The QR-to-programme flow and the printable table card are a distribution mechanism with no sport in them at all, and would plausibly work *better* at a football ground, because a fixture has a fixed venue with a fixed sign |

### Four questions that were checked rather than assumed

**A squad is not a person — does the global `fighters` table help or hurt?** It helps, for a reason that is easy to misread. `fighters` has no owner, so the table already models "a person in the world who appears on shows", which is what a footballer is. The problem is not the globalness but the *directness*: because `bouts` points straight at a person, there is no seam where a squad could sit. For football you would keep the people table nearly as it stands and have a fixture's two sides point at a squad, with a squad having members. Arity two survives, `fighters` survives as `people`, and what is new is one join table and a club-for-a-season relationship. That is a much smaller model change than "generalise to N sides" implies, and it is a further argument against the shape of option A.

**Can `TaleOfTheTape` be parameterised, or is a second composition the answer?** A second composition, on two pieces of evidence. First, the purity constraint is real and portable: the composition carries no CSS animation, transition or timer, and the only `prefers-reduced-motion` handling is a comment at [app/globals.css:139-146](app/globals.css) explaining that the sequence needs no exemption because its motion is not CSS. (The player chrome around it, `TapePlayer.tsx`, does use `transition-colors` on its own controls — that is the frame around the picture and not the picture, and the exporter never sees it.) A football composition can and should be written under the same rule, because determinism is a property of the exporter rather than of the fight. Second, the composition is not a template with two slots. It is a five-scene, 480-frame structure whose middle three scenes are "reveal one fighter", "reveal the other", and "put their bodies side by side and count the differences". Football's interesting content differs in kind, so parameterising would mean keeping the skeleton and replacing everything it says, which produces a fight promo about a football match. What transfers is the harness, the frame discipline, the capture readiness pattern, [lib/anim.ts](lib/anim.ts) and the typographic system. What does not is `SCENES` and `TaleOfTheTape.tsx`.

**Season context — does anything assume a one-off event?** Nothing assumes it, and nothing supports a season either. `events` ([db/schema.ts:133](db/schema.ts)) is a standalone promoter-scoped row with a date, a venue and a slug; there is no series, competition or season table and no self-reference. `render_jobs` is event-scoped and unique on event and bout number; both analytics tables are event-scoped and cascade-delete. So a season is representable as a set of events with nothing joining them, and every count is per event by construction. Two consequences: a league table or a form guide has no home and would be new tables plus new derivation; and the dashboard's "last show" panel is already doing a two-event comparison by hand, which is the seed of the season query and shows the shape is not alien. In the other direction, `fighters` being global means a person's history across events already accumulates, which is most of what a season needs to know about a participant.

**Does the invite and completeness machinery support repeat participants?** Yes, and this is where football is genuinely *easier*. `uniqueIndex("invites_event_fighter")` means one invite per person per event and therefore many across events, which is exactly right for a squad playing every fortnight. `draftFromFighter` ([lib/questionnaire.ts:98](lib/questionnaire.ts)) already pre-fills from an existing person, so a returning participant confirms rather than retypes and `COMPLETENESS_FIELDS` scores them done on arrival — the returning-fighter hook of HANDOVER section 19 item 12, arriving for free. **But consent lives on the invite, deliberately, because consent is given for a show.** A fortnightly fixture list therefore means re-consenting the same eighteen people every fixture, which is either a policy decision to revisit or friction that would sink adoption on its own. That is the sharpest football-specific question in the whole assessment, and it is a legal question before it is a technical one.

---

## 6. The three options

### Option A — generalise in place. Rejected

N sides; a side is a person or a squad; a sport discriminator on the contest.

What changes: `bouts` gains a discriminator and loses its two foreign-key columns for a join table; `fighters` becomes `people` and gains a squad or club-season concept; `Corner` stops being a two-member union, which propagates into `lib/card.ts`, `lib/tape.ts`, `lib/promoter.ts`, `lib/renders.ts`, `lib/db/render-jobs.ts`, the composition and every route above. `buildTape`'s signature and all nine hooks need a general or per-sport form. `boutReadiness`'s "lopsided" needs redefining. `addBout` stops being one batch that makes two fighters.

That is every subsystem except authentication, media validation and the operational scripts. Most of it is mechanical, but three parts are genuinely new design: what a tale of the tape *is* without two subjects, what the chase list's unit becomes, and what the fingerprint contract looks like when the input list is variable-length — `renderFingerprint` throws on an extra field precisely to stop that drifting.

**The migration is the hard blocker, and the repository already documents it.** [db/migrations/0002_bout_weight_decimal.sql](db/migrations/0002_bout_weight_decimal.sql) contains a comment and `SELECT 1;` and nothing else, because drizzle generated a table rebuild wrapped in `PRAGMA foreign_keys=OFF`, **which D1 does not support**, and dropping and recreating `bouts` on a live show was refused. `ALTER TABLE … ADD COLUMN` is available and used by `0009` and `0011`; `DROP COLUMN` is available and used by `0006`, and it succeeds on a column carrying a `REFERENCES` clause with a unique index present on other columns. What is **not** available without the rebuild that was already refused is relaxing `NOT NULL` on `red_id` and `blue_id`. So the choice is to keep both columns populated as dead weight through a long dual-write period, or to accept a rebuild already judged not worth it on a database holding less than it holds now.

The risk is high and concentrated in the wrong place. Of 774 tests in 40 files, the largest concentrations sit precisely on the files this option rewrites: `lib/copy.test.ts` 80, `lib/visibility.test.ts` 58, `tests/db/promoter-actions.test.ts` 54, `lib/tape.test.ts` 54, `tests/db/queries.test.ts` 42, `lib/promoter.test.ts` 38, `tests/db/visibility.test.ts` 31, `lib/renders.test.ts` 27, `lib/card.test.ts` 26. **A generalisation invalidates those tests' signatures while leaving their intent valid, which is the worst kind of churn, because a rewritten test no longer testifies to the behaviour that survived the rewrite.** Add the demo card whose deliberate unevenness the sales pitch depends on (CLAUDE.md is explicit that it is the pitch and not unfinished work), and this risks the one thing that is working for a customer who has not signed. And because football is two-sided, most of the N-arity work would be speculative even if it went perfectly.

### Option B — a second vertical on shared foundations. The shape football should take, when it has a customer

Extract the platform — `lib/auth.ts`, `lib/session.ts`, `lib/invite-token.ts`, `lib/image-type.ts`, `lib/capture.ts`, the `render_jobs` machinery minus its field list, the counting fold, `lib/masthead.ts`, and above all the *shape* of `lib/visibility.ts` parameterised over "how do I load a card" and "is this person on this event" — then build a football domain beside the fight domain with its own tables, its own `Card` equivalent, its own derivations and its own composition.

**Is the seam real enough to build against? Yes, and this is the load-bearing judgement in this document.** `cardWhere` ([lib/db/queries.ts:243](lib/db/queries.ts)) fetches a whole show in two `db.batch` round trips and returns a plain object; `lib/card.ts` navigates it; `lib/tape.ts` and `lib/promoter.ts` import no database module at all and are tested as pure functions. The evidence that the seam is structural rather than stylistic is historical: those two modules kept every test through the entire move from a `data/event.ts` fixture to D1 (HANDOVER section 6). The two places it is thinner than advertised are `lib/visibility.ts`, which is generic in its logic but imports concrete loaders, and `lib/renders.ts`, whose flat single-contest field list a squad-shaped input would have to nest.

What it buys is a football product that is actually football — a season table, form, a squad, a fixture — rather than a fight card with the labels changed, and that difference is what decides whether a club secretary uses it twice. It also buys the ability to fail at football without harming the fight product, which barely moves. The cost accepted is two domains to keep in step, two compositions to art-direct, and the standing risk that a fix to a shared gate gets applied to one domain's loader and not the other's. That is exactly the failure CLAUDE.md warns about — a rule written inline in the one place somebody thought of is a rule three other places are free to forget — and it argues for the platform being genuinely shared code rather than a copied pattern.

### Option C — nothing structural; go wider within fight sport. Recommended, and partly already true

Section 1 is the whole of it. Boxing, Muay Thai and K1 read correctly today with no code written, which makes them a distribution problem. Grappling and BJJ cost a discipline-aware hook set, a discipline-aware row list, a per-discipline style vocabulary and a format field that is not rounds times minutes — all additive, all inside two pure and well-tested modules, none of it touching the schema or a gate. Darts and snooker are structurally a perfect fit and a total vocabulary mismatch: averages, checkout percentages, centuries and highest breaks mean a new `ROW_SPECS`, a new hook set and a composition that is not red corner against blue corner.

---

## 7. The two findings neither investigation reached alone

These emerged only from putting the market work and the code work side by side, and they are the strongest argument in this document.

**1. The data collection problem in football is not merely bigger, it is structurally *and* legally recurring.** The market side establishes that no feed at this level carries a photograph, so every player's picture has to come from the player: sixteen per squad per fixture, with no leverage over the away club beyond the league's five-day rule, which obliges a club to send pen pictures and not to persuade sixteen individuals to send photographs and consent. The code side establishes that consent is scoped to an invite and therefore to an event, deliberately, because consent is given for a show. Put together, you would re-collect *and* re-consent the same squad every fortnight, plus an away squad you have no relationship with. In MMA it is two people and one promoter who controls both.

**2. A large share of the "much bigger market" is legally unavailable today.** `lib/consent.ts` refuses under-eighteens outright and stores nothing at all, including the age, which is correct as designed and is one of the load-bearing rules of this codebase. Grassroots football is heavily youth football. Neither investigation flagged this on its own, and it means the headline market-size figures — 18,000 clubs, 1,100 leagues — overstate the addressable market by an amount nobody has quantified. This is recorded as a limitation rather than as a risk: it is not something that might go wrong, it is a fact about the numbers already quoted.

---

## 8. The other sports, ranked

The strongest three, in order.

1. **Boxing and Muay Thai.** One versus one, an existing card and programme tradition, mature sponsorship, a single promoter who decides and pays alone, and — per section 1 — no marginal build and no marginal risk. The highest return available, and a distribution problem rather than a build problem.
2. **Grassroots and non-league football.** The biggest market by an order of magnitude, the best data availability of any candidate thanks to Football Web Pages, and a real compliance hook. Against it: eleven a side, crowded with incumbents, bought by committee, and the head-to-head format does not transfer.
3. **Grassroots rugby union.** The closest structural match to football and in some ways better, because the programme tradition is alive and functional at National and Regional level and the sponsorship inventory already includes shirt-number and per-player sponsorship, programme advertising, pitchside boards, dugout and scoreboard. The catch is that rugby is Zeeon's home turf and its strongest vertical.

The rest, briefly:

| Sport | Fit | What kills it |
| --- | --- | --- |
| Rugby league | Same shape as union | Smaller footprint |
| Village and league cricket | Batter versus bowler is intellectually the best non-fight fit for a tale of the tape | The tradition is a *scorecard*, generated live rather than published beforehand; very low footfall, all-day matches, clubhouse and boundary-board sponsorship |
| Grappling and BJJ | Excellent format fit | Smoothcomp already owns registration and brackets, there is no programme tradition to replace, and the spectators are largely other competitors' families |
| Amateur wrestling | Same fit | Much smaller, no sponsorship culture |
| Powerlifting, strongman | — | One versus field, no programme tradition |
| Speedway | On paper the best fit after fight sport: a racecard is a genuinely *functional* document, heats are small head-to-heads, and programmes sell at £3.50–£4.00, or £10 for a Grand Prix | British speedway has only a handful of professional clubs, so the addressable market is a rounding error |
| Karting, club motorsport | — | The programme is a timing sheet nobody is paid to design, and sponsorship attaches to the car |
| Athletics | — | No programme culture, and the spectators are parents |
| Darts and snooker | Structurally near-perfect: two individuals, a card of ordered matches, an audience wanting a reason to root for someone | Professional tiers are served in-house; the amateur level has no tradition and no gate |

---

## 9. What would have to be true to revisit this

So that a future reader can reopen the decision on evidence rather than on enthusiasm. At minimum, all four of these:

- **A football customer who asks first.** This is the same bar HANDOVER section 19 item 1 sets for everything else, and for the same reason.
- **Football Web Pages agreeing in writing to a per-club key for this use.** Free to ask, and the first step rather than a later one.
- **A consent architecture that works per season rather than per event, with a defensible position on minors.** Legal before technical, and it lands squarely on HANDOVER section 19 item 2, which is unfinished for the sport we already serve.
- **Evidence that an away club will actually send sixteen photographs.** That is the whole product, and nothing in the rules obliges it.

**The cheapest experiment is not a build.** Pick one Step 5 or Step 6 club in a league where rule 8.14 still bites, get a Football Web Pages key on that club's behalf, hand-produce a single fixture in the existing shell with both squads typed in manually, and do it in April, May or June while the commercial brochure is being written.

**And name the trap before running it: the demo will work beautifully on the one club whose data you filled in yourself.** This project has already learned that twice. Invite status was derived from a completeness score that included fields the promoter had typed, so twenty-one fighters who never opened their link read as "opened, unfinished" — absence mistaken for evidence (HANDOVER section 10). And the photograph-to-video gap survived as long as it did because the seeded card was the one card where every fighter already had a cutout, so every check of the centrepiece was a check of the one state that was never in question (HANDOVER section 4). A football pilot on hand-entered data is the same experiment a third time.

---

## 10. What is verified, what is inferred, and what is not established

**Verified.** Every file path and line number above, counted at this commit against this branch. Every quoted rule, price, fine, endpoint and statement of coverage, from the source named beside it. The two network tests: `fulltime.thefa.com` returning 403 behind a Cloudflare challenge from this infrastructure while `www.thefa.com` returns 200, and `api.footballwebpages.co.uk` returning 400 without a key rather than 403. The Step 5 and Step 6 coverage in Football Web Pages, checked against Combined Counties Premier Division South and Division One. That the 774 tests in 40 files pass, and that `lib/tape.ts` mentions `discipline` exactly once.

**Inferred, and marked as such where it appears.** That the pain a club feels is labour rather than print cost — drawn from the volunteer-editor evidence and the club accounts, not stated by any club in those words. That a multi-tenant key would fall outside Football Web Pages' "official/public website only" grant, which is a reading of a licence and not a ruling on one. That the compliance wedge has a date on it, which follows from two repeals rather than from a stated direction of travel.

**Not established, and not to be treated as settled.**

- **The Trident Leagues figure.** A former programme editor states that omitting "the 12 pages of mandatory content leaves your club liable for a £500 fine" at Steps 3 and 4 (226 clubs rising to 240). That is knowledgeable secondary evidence and not a rulebook, and no rulebook was found to confirm it.
- **Commercial providers below Step 4.** Sportmonks, API-Football, TheStatsAPI and football-charts all sell the right shape of data, and **it could not be established that any of them covers Step 5, Step 6 or county football**. That is an open question rather than a no.
- **Whether anybody at this level already auto-populates from a feed or generates video.** None was found, which is absence of evidence rather than evidence of absence.
- **How much of the grassroots market is under eighteen**, and therefore how much of the headline market size section 7 removes. Nobody has quantified it.
