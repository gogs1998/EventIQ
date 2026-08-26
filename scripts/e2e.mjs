/**
 * Walks the whole product against a running server and a real database.
 *
 *   npm run e2e                              # against http://localhost:3000
 *   npm run e2e -- --base http://localhost:8788 --shots /tmp/e2e
 *
 * The unit tests cover the derivation layer, which is pure and easy to test.
 * This covers the part that is not: sessions, server actions, D1 writes, R2
 * uploads and the invite token, none of which can be exercised without a browser
 * and a database. It is the only thing that would catch a form that posts to the
 * wrong action or a cookie that never gets set.
 *
 * It writes to whatever database the server is pointed at, so run it against
 * local bindings. It expects the demo card seeded (`npm run db:reset`) and picks
 * up the promoter password from .dev.vars, the same file the server reads.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { devVars } from "./dev-vars.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const BASE = arg("base", "http://localhost:3000");
const OUT = arg("shots", "/tmp/e2e");
const PROMOTER = arg("promoter", "cage-county");
const PASSWORD =
  arg("password") ?? devVars().SEED_PROMOTER_PASSWORD ?? process.env.SEED_PROMOTER_PASSWORD ?? "cagecounty";
const CHROME = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

let failures = 0;
const step = async (name, fn) => {
  process.stdout.write(`${name.padEnd(48)}`);
  try {
    const result = await fn();
    console.log(`ok${typeof result === "string" ? ` — ${result}` : ""}`);
    return result;
  } catch (error) {
    failures += 1;
    console.log(`FAILED: ${error.message}`);
    return null;
  }
};

/**
 * Sets a controlled input the way a user would, rather than the way puppeteer
 * would. React ignores a value written straight onto the element, so this goes
 * through the prototype setter and fires the event React is listening for.
 */
const fill = (page, selector, value) =>
  page.evaluate(
    (s, v) => {
      const el = document.querySelector(s);
      if (!el) throw new Error(`no ${s}`);
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selector,
    value,
  );

const clickText = (page, text) =>
  page.evaluate((t) => {
    const button = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.toLowerCase().includes(t.toLowerCase()),
    );
    if (!button) throw new Error(`no button saying "${t}"`);
    button.click();
  }, text);

/**
 * Rendered text, lowercased. The design sets most labels in CSS uppercase, so
 * innerText shouts and the source does not; comparing either way round without
 * this is how a passing assertion turns into a false failure.
 */
const textOf = async (page) => (await page.evaluate(() => document.body.innerText)).toLowerCase();
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

// --------------------------------------------------------------- the promoter

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
page.on("pageerror", (e) => console.log("\n  page error:", e.message));

await step("promoter area is not public", async () => {
  await page.goto(`${BASE}/promoter`, { waitUntil: "networkidle0" });
  if (!page.url().includes("/promoter/login")) throw new Error(`landed on ${page.url()}`);
});

await step("a wrong password is refused", async () => {
  await sleep(800);
  await fill(page, 'input[name="slug"]', PROMOTER);
  await fill(page, 'input[name="password"]', "definitely-not-the-password");
  await clickText(page, "Sign in");
  await sleep(3000);
  if (!(await textOf(page)).includes("not recognised")) throw new Error("no error shown");
  if (!page.url().includes("/login")) throw new Error("signed in with a wrong password");
});

await step("the right password signs in", async () => {
  await page.goto(`${BASE}/promoter/login`, { waitUntil: "networkidle0" });
  await sleep(600);
  await fill(page, 'input[name="slug"]', PROMOTER);
  await fill(page, 'input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}),
    clickText(page, "Sign in"),
  ]);
  await sleep(2500);
  if (page.url().includes("/login")) throw new Error(`still on login`);
  return page.url().replace(BASE, "");
});

const slug = await step("the dashboard is the real card", async () => {
  const body = await textOf(page);
  for (const want of ["who to chase", "bout sponsors sold", "this show so far", "last show"]) {
    if (!body.includes(want)) throw new Error(`missing "${want}"`);
  }
  await shot(page, "01-dashboard");
  return page.url().split("/promoter/e/")[1]?.split("/")[0];
});

await step("a show with no history says so instead of inventing", async () => {
  const body = await textOf(page);
  if (!body.includes("first show on here") && !body.includes("no previous show")) {
    throw new Error("the last-show panel claims history this promoter has not got");
  }
});

/** Whoever is top of the chase list, with the score the dashboard shows for them. */
const target = await step("the chase list carries a working invite link", async () => {
  const row = await page.evaluate(async () => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim().toLowerCase() === "copy link",
    );
    if (!button) return null;
    let link = null;
    navigator.clipboard.writeText = async (v) => {
      link = v;
    };
    button.click();
    await new Promise((r) => setTimeout(r, 400));
    const text = button.closest("li, div[class*='border']")?.innerText ?? "";
    return { link, score: Number(text.match(/(\d+)%/)?.[1] ?? -1), text };
  });
  if (!row?.link) throw new Error("nothing copied");
  if (!/\/f\/[\w-]{20,}$/.test(row.link)) throw new Error(`not a token link: ${row.link}`);
  return { invite: row.link.replace(BASE, ""), score: row.score };
});
const invite = target?.invite;

/**
 * The capture page the mp4 renderer screenshots carries the event, the venue,
 * the date and both fighters, and it cannot go behind the publish check because
 * rendering a card before it is published is the point of it. It takes a key of
 * its own instead, so a stranger gets the same 404 as for a slug that does not
 * exist. A fresh browser context is a caller with no cookie.
 */
await step("the render page is shut to a stranger", async () => {
  const context = await browser.createBrowserContext();
  try {
    const stranger = await context.newPage();
    const response = await stranger.goto(`${BASE}/render/${slug}/1`, {
      waitUntil: "domcontentloaded",
    });
    if (response.status() !== 404) throw new Error(`got ${response.status()}, wanted 404`);
  } finally {
    await context.close();
  }
});

/**
 * The other half: the key has to work, or the renderer stops and nothing here
 * would say so. Skipped rather than failed where the key is not to hand, since
 * against production it has to be exported and there is no reading it back out
 * of the Worker.
 */
await step("the render key opens it, and a wrong one does not", async () => {
  const key = process.env.RENDER_KEY || devVars().RENDER_KEY;
  if (!key) return "skipped: no RENDER_KEY in the environment or .dev.vars";

  const context = await browser.createBrowserContext();
  try {
    const renderer = await context.newPage();
    await renderer.setExtraHTTPHeaders({ "x-eventiq-render-key": key });
    const good = await renderer.goto(`${BASE}/render/${slug}/1`, {
      waitUntil: "domcontentloaded",
    });
    if (good.status() !== 200) throw new Error(`the right key got ${good.status()}, wanted 200`);

    await renderer.setExtraHTTPHeaders({ "x-eventiq-render-key": `${key}-wrong` });
    const bad = await renderer.goto(`${BASE}/render/${slug}/1`, {
      waitUntil: "domcontentloaded",
    });
    if (bad.status() !== 404) throw new Error(`a wrong key got ${bad.status()}, wanted 404`);
  } finally {
    await context.close();
  }
});

await step("the promoter can open their own render page", async () => {
  const response = await page.goto(`${BASE}/render/${slug}/1`, {
    waitUntil: "domcontentloaded",
  });
  if (response.status() !== 200) throw new Error(`got ${response.status()}, wanted 200`);
});

await step("the card editor lists the running order", async () => {
  await page.goto(`${BASE}/promoter/e/${slug}/card`, { waitUntil: "networkidle0" });
  const body = await textOf(page);
  if (!body.includes("running order")) throw new Error("no running order");
  await shot(page, "02-card-editor");
});

const boutCount = async (p) => Number((await textOf(p)).match(/(\d+) bouts/)?.[1] ?? NaN);

await step("adding a bout writes both fighters", async () => {
  const before = await boutCount(page);
  await fill(page, 'input[name="redName"]', "Test Redcorner");
  await fill(page, 'input[name="redGym"]', "Testing Gym");
  await fill(page, 'input[name="blueName"]', "Test Bluecorner");
  await fill(page, 'input[name="blueGym"]', "Other Gym");
  await clickText(page, "Add the bout");
  await sleep(4000);
  const after = await boutCount(page);
  if (after !== before + 1) throw new Error(`bouts went ${before} to ${after}`);
  return `${before} to ${after}`;
});

await step("it shows up on the public programme", async () => {
  await page.goto(`${BASE}/e/${slug}`, { waitUntil: "networkidle0" });
  // The running order is surnames only, the way a programme prints it.
  if (!(await textOf(page)).includes("redcorner")) throw new Error("not on the card");
});

await step("removing it takes it off again", async () => {
  await page.goto(`${BASE}/promoter/e/${slug}/card`, { waitUntil: "networkidle0" });
  page.on("dialog", (d) => d.accept());
  await clickText(page, "Test Redcorner");
  await sleep(1000);
  await clickText(page, "Remove this bout");
  await sleep(4000);
  if ((await textOf(page)).includes("test redcorner")) throw new Error("still there");
  return `back to ${await boutCount(page)} bouts`;
});

// ---------------------------------------------------------------- the fighter

const fighter = await browser.newPage();
await fighter.setViewport({ width: 430, height: 932 });
fighter.on("pageerror", (e) => console.log("\n  fighter page error:", e.message));

await step("the invite link opens their questionnaire", async () => {
  if (!invite) throw new Error("no invite link from the dashboard");
  await fighter.goto(`${BASE}${invite}`, { waitUntil: "networkidle0" });
  const body = await textOf(fighter);
  // The copy uses a typographic apostrophe, so match either.
  const line = body.split("\n").find((l) => /you.re on bout/.test(l));
  if (!line) throw new Error(`unexpected page: ${body.slice(0, 120)}`);
  await shot(fighter, "03-questionnaire");
  return line;
});

await step("typing saves without a save button", async () => {
  await sleep(1000);
  await fill(fighter, 'input[placeholder="The Welsh Dragon"]', "The Verifier");
  await fill(fighter, 'input[placeholder="@owenpryce"]', "theverifier");
  await fill(fighter, 'input[placeholder="Wrexham"]', "Runcorn");
  await fill(fighter, "textarea", "Two years in the gym and the whole street has bought tickets.");
  await sleep(5000);
  if (!(await textOf(fighter)).includes("saved")) throw new Error("never reported a save");
});

await step("the save survives a reload", async () => {
  await fighter.reload({ waitUntil: "networkidle0" });
  const value = await fighter.evaluate(
    () => document.querySelector('input[placeholder="The Welsh Dragon"]').value,
  );
  if (value !== "The Verifier") throw new Error(`came back as "${value}"`);
});

const photo = `${OUT}/photo.jpg`;
await step("a photograph goes to the bucket and back", async () => {
  spawnSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=0x203040:s=1200x1600",
    "-frames:v", "1", photo,
  ]);
  const input = await fighter.$('input[type="file"]');
  if (!input) throw new Error("no file input");
  await input.uploadFile(photo);
  await sleep(6000);

  const src = await fighter.evaluate(() => {
    const img = [...document.querySelectorAll("img")].find((i) => i.src.includes("/media/"));
    return img?.src ?? null;
  });
  if (!src) throw new Error("no stored photo on the page");

  const status = await fighter.evaluate(async (url) => (await fetch(url)).status, src);
  if (status !== 200) throw new Error(`stored photo serves ${status}`);
  return new URL(src).pathname;
});

await step("submitting puts them on the card", async () => {
  await clickText(fighter, "Put me on the card");
  await sleep(4000);
  if (!/you.re on the card/.test(await textOf(fighter))) throw new Error("no confirmation");
  await shot(fighter, "04-submitted");
});

await step("the programme shows what they sent", async () => {
  await page.goto(`${BASE}/e/${slug}`, { waitUntil: "networkidle0" });
  if (!(await textOf(page)).includes("the verifier")) throw new Error("nickname is not on the card");
  await shot(page, "05-programme");
});

await step("the dashboard sees the profile fill up", async () => {
  await page.goto(`${BASE}/promoter/e/${slug}`, { waitUntil: "networkidle0" });
  const body = await textOf(page);
  await shot(page, "06-dashboard-after");
  // A finished profile drops off the chase list entirely; a part-finished one
  // stays but scores higher than it did. Either proves the write landed.
  const still = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim().toLowerCase() === "copy link",
    );
    const text = button?.closest("li, div[class*='border']")?.innerText ?? "";
    return Number(text.match(/(\d+)%/)?.[1] ?? -1);
  });
  if (!body.includes("done") && still <= target.score) {
    throw new Error(`score did not move: ${target.score}% then ${still}%`);
  }
  return `${target.score}% to ${still}%`;
});

// -------------------------------------------------------------------- the rest

const counted = (page) =>
  page.evaluate(() => {
    const panel = [...document.querySelectorAll("section")].find((s) =>
      s.innerText.toLowerCase().includes("this show so far"),
    );
    const read = (label) => {
      const cell = [...panel.querySelectorAll("div")].find(
        (d) => d.firstElementChild?.textContent?.trim().toLowerCase() === label,
      );
      return Number(cell?.children[1]?.textContent.replace(/[^\d]/g, "") ?? -1);
    };
    return { opens: read("programme opens"), expands: read("bouts expanded") };
  });

await step("interactions are counted as they happen", async () => {
  const before = await counted(page);

  const spectator = await browser.newPage();
  await spectator.setViewport({ width: 430, height: 932 });
  await spectator.goto(`${BASE}/e/${slug}`, { waitUntil: "networkidle0" });
  await sleep(1500);
  await spectator.evaluate(() => document.querySelector("article button")?.click());
  await sleep(2500);
  await spectator.close();

  await page.reload({ waitUntil: "networkidle0" });
  const after = await counted(page);
  if (after.opens <= before.opens) {
    throw new Error(`programme opens went ${before.opens} to ${after.opens}`);
  }
  if (after.expands <= before.expands) {
    throw new Error(`bouts expanded went ${before.expands} to ${after.expands}`);
  }
  return `opens ${before.opens} to ${after.opens}, expands ${before.expands} to ${after.expands}`;
});

await step("a Sherdog link is read for real", async () => {
  const outcome = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/import-record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.sherdog.com/fighter/Conor-McGregor-29688" }),
    });
    return res.json();
  }, BASE);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome).slice(0, 160));
  const { record, recordKind, name } = outcome.tape;
  return `${name} ${record.w}-${record.l}-${record.d} ${recordKind}`;
});

await step("a Tapology link fails honestly", async () => {
  const outcome = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/import-record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.tapology.com/fightcenter/fighters/somebody" }),
    });
    return res.json();
  }, BASE);
  if (outcome.ok) throw new Error("claimed to have read Tapology");
  return outcome.reason?.slice(0, 50);
});

await step("a made-up token is not a way in", async () => {
  const res = await page.evaluate(
    async (base) => (await fetch(`${base}/f/definitely-not-a-real-token`)).status,
    BASE,
  );
  if (res !== 404) throw new Error(`got ${res}, wanted 404`);
});

await step("signing out locks the dashboard again", async () => {
  await page.goto(`${BASE}/promoter/e/${slug}`, { waitUntil: "networkidle0" });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {}),
    clickText(page, "Sign out"),
  ]);
  await sleep(1500);
  await page.goto(`${BASE}/promoter`, { waitUntil: "networkidle0" });
  if (!page.url().includes("/login")) throw new Error("still signed in");
});

await browser.close();
await writeFile(`${OUT}/base.txt`, `${BASE}\n`);
console.log(`\n${failures} failed. Screenshots in ${OUT}`);
process.exit(failures ? 1 : 0);
