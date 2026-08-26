/**
 * Drives a scripted walkthrough of the demo for the sales recording.
 *
 *   node scripts/tour.mjs setup    # open a chrome-less, phone-shaped window
 *   node scripts/tour.mjs tour     # run the walkthrough in that window
 *   node scripts/tour.mjs teardown
 *
 * Chrome runs in --app mode so there is no tab strip or address bar in shot,
 * which is the difference between looking like a product and looking like
 * someone's localhost. Scroll and pause timings are scripted so the result is
 * repeatable rather than depending on how steadily somebody moves a mouse.
 */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const run = promisify(execFile);

const BASE = process.env.BASE ?? "http://localhost:3000";
const PORT = 9333;
const PROFILE = "/tmp/eventiq-tour-profile";
const WIDTH = 460;
const HEIGHT = 1010;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  // A dark desktop so the area around the window is not a distraction.
  await run("xsetroot", ["-solid", "#050506"]).catch(() => {});

  const x = Math.round((1920 - WIDTH) / 2);
  const child = spawn(
    "/usr/local/bin/google-chrome",
    [
      `--app=${BASE}/qr`,
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      `--window-position=${x},80`,
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--disable-infobars",
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  await sleep(4000);
  // Park the pointer out of shot.
  await run("xdotool", ["mousemove", "1900", "1190"]).catch(() => {});
  console.log("window up");
}

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  const { webSocketDebuggerUrl } = await res.json();
  const browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
    defaultViewport: null,
  });
  const pages = await browser.pages();
  return { browser, page: pages[0] };
}

/** Eased scroll to an absolute offset, run inside the page for smoothness. */
async function scrollTo(page, target, duration) {
  await page.evaluate(
    async (to, ms) => {
      const from = window.scrollY;
      const delta = to - from;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const step = (t) => {
          const p = Math.min(1, (t - t0) / ms);
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          window.scrollTo(0, from + delta * eased);
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    target,
    duration,
  );
}

async function scrollToSelector(page, selector, duration, offset = 90) {
  const target = await page.evaluate(
    (sel, off) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return window.scrollY + el.getBoundingClientRect().top - off;
    },
    selector,
    offset,
  );
  if (target === null) throw new Error(`missing ${selector}`);
  await scrollTo(page, target, duration);
}

/** Clicks in-page rather than through puppeteer, which would scroll the element itself. */
async function clickText(page, text) {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((e) =>
      e.textContent?.includes(t),
    );
    if (!el) return false;
    el.click();
    return true;
  }, text);
  if (!ok) throw new Error(`no clickable element containing "${text}"`);
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
}

/** Keeps the pointer out of shot, which matters most while the video is playing. */
async function parkCursor() {
  await run("xdotool", ["mousemove", "1905", "1195"]).catch(() => {});
}

async function tour() {
  const { browser, page } = await connect();

  await parkCursor();

  // 1. The table card: this is the thing on the table at the venue.
  await goto(page, "/qr");
  await sleep(2600);

  // 2. What the code opens.
  await goto(page, `/e/cage-county-12`);
  await sleep(2600);

  // 3. Down through the running order.
  await scrollTo(page, 1500, 4500);
  await sleep(900);
  await scrollTo(page, 3100, 4500);
  await sleep(1400);

  // 4. Back to the main event and open it.
  await scrollTo(page, 620, 2200);
  await sleep(900);
  await clickText(page, "Tale of the tape");
  await sleep(2000);

  // 5. The tape itself.
  await scrollToSelector(page, "article table, article .grid", 1800, 120).catch(
    async () => scrollTo(page, 1250, 1800),
  );
  await sleep(600);
  await scrollTo(page, 1360, 1400);
  await sleep(3400);

  // 6. Play it, and leave it completely alone for the full sixteen seconds.
  await scrollToSelector(page, "video", 1600, 70);
  await sleep(700);
  await clickText(page, "Play the tape");
  await parkCursor();
  await sleep(17800);

  // 7. What the fighters wrote.
  await page.evaluate(() => window.scrollBy({ top: 620, behavior: "smooth" }));
  await sleep(2800);

  // 8. The fighter's side of it.
  await goto(page, "/f/demo");
  await sleep(2600);

  await clickText(page, "Use the one from the gym");
  await parkCursor();
  await sleep(2800);

  // Frame it so the field sits low and the card's name lockup stays visible
  // above it, since watching the nickname land on the card is the whole point.
  const NICKNAME = 'input[placeholder="The Welsh Dragon"]';
  const target = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const bottom = window.scrollY + el.getBoundingClientRect().bottom;
    return Math.max(0, bottom - window.innerHeight * 0.86);
  }, NICKNAME);
  if (target !== null) await scrollTo(page, target, 900);
  await sleep(500);

  // focus() would scroll the field to the top and push the card out of shot.
  await page.evaluate((sel) => {
    document.querySelector(sel)?.focus({ preventScroll: true });
  }, NICKNAME);
  await page.keyboard.type("The Welsh Dragon", { delay: 60 });
  await parkCursor();
  await sleep(3200);

  // 9. Play their reveal so it ends on the fighter's own card.
  await clickText(page, "Play your walkout").catch(() => {});
  await parkCursor();
  await sleep(5200);

  browser.disconnect();
  console.log("tour done");
}

async function teardown() {
  await run("pkill", ["-f", PROFILE]).catch(() => {});
  console.log("closed");
}

const phase = process.argv[2];
if (phase === "setup") await setup();
else if (phase === "tour") await tour();
else if (phase === "teardown") await teardown();
else {
  console.error("Usage: node scripts/tour.mjs setup|tour|teardown");
  process.exit(1);
}
