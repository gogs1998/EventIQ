# Deploying to eventiq.win

The site is a static export, so hosting it is a file upload. There is no server,
no database and nothing to keep running. This document covers Cloudflare Pages
because the domain was bought with a public demo in mind and Pages serves static
output free, but any static host works: the whole site is the contents of `out/`.

**Nothing in here has been run.** No hosting credentials exist in the
development environment, so the deploy has been prepared and left one command
short of live. See [what is left to do](#what-is-left-to-do).

---

## 1. Create an API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** →
**Create Custom Token**.

| Permission | Scope | Why |
| --- | --- | --- |
| Account · Cloudflare Pages · **Edit** | the account that will own the project | creating the project and uploading the build |
| Account · Account Settings · **Read** | same account | wrangler resolves the account before uploading |
| Zone · DNS · **Edit** | **`eventiq.win` only** | only needed to attach the custom domain by API |

Leave everything else off. Scope the DNS permission to the single zone rather
than "All zones" — the token is going into a shell and possibly into CI, and it
does not need to be able to touch anything else.

If the custom domain is going to be attached by hand in the dashboard instead,
drop the DNS permission entirely and the token can only publish files.

## 2. Find the account ID

It is on the right-hand column of any domain's **Overview** page in the
dashboard, or:

```bash
npx wrangler whoami
```

## 3. Set both values and deploy

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...

npm run deploy
```

`npm run deploy` ([scripts/deploy.mjs](scripts/deploy.mjs)) builds with
`NEXT_PUBLIC_SITE_URL=https://eventiq.win` and then runs:

```bash
npx wrangler pages deploy out --project-name=eventiq --branch=main
```

It refuses to start with a printed list of the permissions above if either
variable is missing, rather than failing halfway through with a Cloudflare error
code. Wrangler 4.126.0 works via `npx wrangler`; there is no need to install it.

Wrangler creates the `eventiq` project on the first deploy and prints a
`*.pages.dev` URL. That URL is worth keeping — it is a working demo link even
before DNS is sorted.

Useful variations:

```bash
npm run deploy -- --skip-build       # upload the existing out/ again
npm run deploy -- --attach-domain    # also point eventiq.win at the project
CF_PAGES_PROJECT=eventiq-staging npm run deploy
```

## 4. Attach eventiq.win

**The zone has to be in Cloudflare first.** If the domain was bought at
Cloudflare Registrar it already is. If it was bought anywhere else, add the site
in the Cloudflare dashboard and change the nameservers at the registrar to the
two Cloudflare gives you. That propagates in minutes to a few hours, and nothing
below works until it has.

Then either use the dashboard (project → **Custom domains** → **Set up a custom
domain**), or:

```bash
npm run deploy -- --attach-domain
```

which is this call:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/eventiq/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"eventiq.win"}'
```

Cloudflare creates the CNAME and issues the certificate itself. Repeat with
`www.eventiq.win` if that should work too, then add a redirect rule from `www` to
the apex so there is only one address in circulation.

## 5. Check it

```bash
curl -sI https://eventiq.win | head -3
curl -s https://eventiq.win/robots.txt
curl -s https://eventiq.win/sitemap.xml | head -5
```

Then on a phone, in this order, because these are the things a static export
gets wrong:

1. `/` — the walkthrough recording and the tale-of-the-tape video both play.
2. `/e/cage-county-12` — open a bout, play the tape.
3. `/qr` — scan the printed code with another phone. The QR is generated from
   the current origin, so on the live site it points at the live site.
4. Paste `https://eventiq.win` into WhatsApp and check the preview card appears.

---

## The site URL

`NEXT_PUBLIC_SITE_URL` sets the canonical address at build time. It defaults to
`https://eventiq.win` ([lib/site.ts](lib/site.ts)), so a plain `npm run build`
already produces a correct public build and the deploy script only sets it
explicitly so the intent is visible in CI logs.

It feeds `metadataBase`, the Open Graph tags and the WhatsApp chase messages on
the promoter view. It deliberately does **not** feed the QR code, which reads the
origin it is being served from — that way the printed card still works off a
laptop screen in a meeting.

For a preview deployment on a different hostname:

```bash
NEXT_PUBLIC_SITE_URL=https://eventiq-preview.pages.dev npm run build
node scripts/deploy.mjs --skip-build
```

## What is left to do

1. Create the token and find the account ID (sections 1 and 2). Only a human
   with dashboard access can do this.
2. Run `npm run deploy`.
3. Confirm the zone is in Cloudflare, then `npm run deploy -- --attach-domain`.
4. Reprint the table card once the live URL exists, so the QR on the table points
   at `eventiq.win` rather than at a laptop.

## Somewhere other than Cloudflare

`out/` is a directory of static files with no server requirements, so:

- **Netlify** — `npx netlify deploy --prod --dir=out`
- **Vercel** — `npx vercel deploy --prebuilt out`, or connect the repo
- **GitHub Pages** — push `out/` to `gh-pages`; needs `basePath` in
  [next.config.ts](next.config.ts) unless it is served from a domain root
- **Any web server** — copy `out/` into the document root

The only host-specific thing in the repo is `scripts/deploy.mjs`.
