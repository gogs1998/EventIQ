# EventIQ

Digital fight programmes for amateur MMA.

> Picking this up cold? Read [HANDOVER.md](HANDOVER.md) first. It covers the reasoning behind each decision, what was tried and rejected, the open questions, and what to do next. This file covers how to run things.

Spectators scan a QR code at the venue and open the full running order for that show. Every bout expands into a tale of the tape, and the ones that matter come with a broadcast-style video built from the fighters' own photos.

This repository is a **pitch demo**. It runs on an invented show with invented fighters, and it exists to be shown to a promoter.

## The problem

Amateur shows run on paper. A real programme from a real event gives you a fighter's name, their gym, and their weight class. That is it. No record, no photo, no story, and nothing for the gyms, fighters or sponsors to take home. The punter in row four claps politely because there is nothing else to do.

## What is here

| Route | What it is |
| --- | --- |
| `/` | The promoter pitch |
| `/e/cage-county-12` | The programme. 15 bouts, main event first, tap any bout for the tape |
| `/e/cage-county-12/f/[fighter]` | A fighter profile, deep-linkable from an Instagram bio |
| `/f/demo` | The fighter questionnaire, with their card building live as they type |
| `/qr` | The printable table card |
| `/render/[bout]` | Capture surface for the video exporter, not linked from the programme |

## The tale of the tape

The centrepiece. A still photograph and a row of numbers become a 16 second vertical sequence: bout billing, each corner revealed in turn, a head to head with the stats counting up and the leading side highlighted, then a closing hook drawn from the data.

Two things make it work.

**Depth from a flat photo.** At asset-prep time every portrait goes through background removal to produce a transparent cutout. The cutout and the backdrop then move at different rates, which reads as parallax rather than a photograph sliding around. If a cutout fails, the sequence falls back to an initialled plate that says "photo to follow" and still plays.

**One composition, two outputs.** [`components/sequence/TaleOfTheTape.tsx`](components/sequence/TaleOfTheTape.tsx) is a pure function of a frame number. There are no CSS animations and no timers; all motion is interpolated in JS from `frame` using the helpers in [`lib/anim.ts`](lib/anim.ts). That single constraint buys both playback modes:

- **In the page**, [`TapePlayer`](components/sequence/TapePlayer.tsx) advances `frame` with `requestAnimationFrame`.
- **As an mp4**, [`scripts/render-tape.mjs`](scripts/render-tape.mjs) opens `/render/[bout]` once in headless Chrome, then drives `window.__setFrame` and screenshots the viewport 480 times, streaming the frames into ffmpeg.

Because the composition is deterministic, those two are the same picture. Rendering a bout takes about a minute.

Remotion does this better and was the obvious choice, but its licence is free only up to three people; past that, an automated render pipeline and embedding its player both fall under a paid tier. That is a fine cost and a bad dependency to put on the core feature of a product with no customers yet. With ffmpeg and Chrome already present the capture loop is about 150 lines. Since the composition is frame-driven either way, adopting Remotion later swaps the render harness rather than requiring a rewrite.

## Half-filled profiles are the normal case

Getting fighters to return the questionnaire is the actual hard problem, not the web page. Two consequences run through the code.

**Nothing may look broken when a fighter has told us nothing.** [`buildTape`](lib/tape.ts) keeps a row if *either* corner can fill it and drops it only when neither can, missing portraits get a designed placeholder rather than a gap, and `completeness()` drives an honest progress score. Note that `isDebut()` requires an explicit `0-0-0`: silence is not a debut, because announcing a veteran as a debutant is worse than saying nothing.

**The form is ordered to be finished.** Nickname, photo, Instagram and sponsors first; height, reach and record last. A form that opens with "reach in centimetres" does not get completed. The fighter watches their own card build as they type, and the reward for finishing is a video of it.

The demo card is deliberately uneven for the same reason: the top of the bill is what it looks like when fighters send their details in, and the openers are a name and a gym, exactly like the paper programme. Bout 11 has one fighter who filled everything in and one who sent nothing.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The QR code on `/qr` is generated in the browser from the current origin, so it points at whatever address you are serving from and can be scanned off a laptop screen.

```bash
npm run build      # static export to out/, no server needed
npm test           # unit tests for the tape logic
npm run lint
npm run typecheck
```

## Regenerating assets and videos

The committed files in `public/` are the source of truth for the demo. Both scripts are only needed if you change the artwork or the sequence.

```bash
npm run assets           # cutouts + optimisation, reads assets-src/ (gitignored)
npm run render -- --bout 15
npm run render:headline  # the five bouts with pre-rendered mp4s
```

`scripts/render-tape.mjs --bout 15 --still 300` dumps a single frame as a PNG, which is the quickest way to iterate on the composition.

## Recording the sales demo

Promoter pitches happen over WhatsApp more than in person, so a recording of the flow is a deliverable in its own right. [`scripts/tour.mjs`](scripts/tour.mjs) scripts it: Chrome runs in app mode at phone dimensions so there is no tab strip or address bar in shot, and the scroll and pause timings live in the script so a take is repeatable.

```bash
node scripts/tour.mjs setup     # chrome-less phone-shaped window
node scripts/tour.mjs tour      # run the walkthrough while recording the screen
node scripts/tour.mjs teardown
```

Crop the capture to the window afterwards; the last run used `crop=454:985:719:106`, which depends on where the window landed.

## What is real and what is not

Every fighter, gym, sponsor and event here is invented, and the portraits are generated images. Swap in real photographs before showing this to a specific promoter.

There is no database, no accounts and no backend. It is a static export, so the fighter questionnaire is a walkthrough that keeps its state in the browser and saves nothing.

## Not built yet

Real questionnaires with magic links and storage, promoter admin, sponsor tap counting and a post-event sponsor report, live results, ticketing, a native app.
