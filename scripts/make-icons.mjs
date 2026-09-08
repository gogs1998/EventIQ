/**
 * Builds the icon set from one hand-authored vector definition.
 *
 *   node scripts/make-icons.mjs
 *
 * The mark is the red corner / blue corner split with a white play triangle
 * straddling the seam, designed on a 16-unit grid so that at 16x16 the triangle's
 * base and tip land on whole pixels and stay crisp. Every coordinate lives in
 * GEOMETRY below and both the vector and the rasters are emitted from it, so a
 * maskable variant can never drift away from what the favicon shows.
 *
 * Two forms come out of the same geometry:
 *
 *   rounded    a rounded square with transparent corners, for the tab strip
 *   fullBleed  edge to edge and opaque, for iOS and for Android maskable icons,
 *              both of which apply their own mask and would otherwise composite
 *              our corners onto a colour we did not choose
 *
 * Chrome does the rasterising rather than an image library, because it is the
 * renderer the icon actually has to survive and it is already a dependency of
 * the render pipeline.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const run = promisify(execFile);

const CHROME = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";

const RED = "#e8121f";
const BLUE = "#1668f0";
const WHITE = "#fff";

const GEOMETRY = {
  // Corner radius on the 16-unit grid. 3.25 reads as a bold rounded square at
  // 16px without the corners eating into the two colour fields.
  radius: 3.25,
  // The red half is drawn half a unit past the seam and the blue half is painted
  // over it. Abutting shapes are antialiased independently, so without the
  // overlap a seam pixel gets two half-covered edges and ends up translucent at
  // any size where the centre line does not fall on a whole pixel.
  seam: 8,
  overlap: 0.5,
  // Base at x=6, tip at x=12: the centroid lands on the seam at x=8, so the
  // triangle reads as centred rather than sitting on the red side. Whole numbers
  // keep the base and tip sharp at 16px. Well inside the 80% circle a maskable
  // icon has to keep its content within.
  triangle: "M6 4 12 8 6 12Z",
};

export function svg({ fullBleed }) {
  const { radius: r, seam: s, overlap: o, triangle } = GEOMETRY;
  const halves = fullBleed
    ? [
        `<path d="M0 0H${s + o}v16H0Z" fill="${RED}"/>`,
        `<path d="M${s} 0H16v16H${s}Z" fill="${BLUE}"/>`,
      ]
    : [
        `<path d="M${r} 0H${s + o}v16H${r}A${r} ${r} 0 0 1 0 ${16 - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z" fill="${RED}"/>`,
        `<path d="M${s} 0h${16 - r - s}A${r} ${r} 0 0 1 16 ${r}v${16 - r * 2}A${r} ${r} 0 0 1 ${16 - r} 16H${s}Z" fill="${BLUE}"/>`,
      ];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">',
    "  <title>EventIQ</title>",
    ...halves.map((h) => `  ${h}`),
    `  <path d="${triangle}" fill="${WHITE}"/>`,
    "</svg>",
    "",
  ].join("\n");
}

/** Screenshot one SVG at exactly size x size, with no resampling step. */
export async function raster(page, markup, size, { opaque }) {
  const data = `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}
     img{display:block;width:${size}px;height:${size}px}</style>
     <img src="${data}">`,
    { waitUntil: "load" },
  );
  return page.screenshot({ type: "png", omitBackground: !opaque });
}

/**
 * A .ico is a tiny directory of images. Modern browsers and Windows read PNG
 * payloads, which keeps a three-resolution file under a kilobyte where the old
 * uncompressed bitmap form would be tens of them.
 */
function ico(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const dir = Buffer.alloc(HEADER + ENTRY * images.length);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // 1 = icon
  dir.writeUInt16LE(images.length, 4);

  let offset = dir.length;
  images.forEach(({ size, png }, i) => {
    const at = HEADER + ENTRY * i;
    dir.writeUInt8(size >= 256 ? 0 : size, at); // 0 stands for 256
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt8(0, at + 2); // palette size, 0 for truecolour
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([dir, ...images.map((i) => i.png)]);
}

/**
 * Drops the mark into the corner of the Open Graph card. A link preview is a
 * near-black rectangle of small grey text at thumbnail size; the split is the
 * only thing on it with any colour, and it is what makes the card identifiable
 * in a WhatsApp thread before a word of it is readable.
 *
 * Exported because scripts/shots.mjs recaptures the card from the live hero and
 * would otherwise write the mark back off it.
 */
export async function brandOpenGraph(page, target) {
  const bug = await raster(page, svg({ fullBleed: false }), 96, { opaque: false });
  const overlay = ".stills/og-bug.png";
  await mkdir(path.dirname(overlay), { recursive: true });
  await writeFile(overlay, bug);
  const tmp = ".stills/og-branded.jpg";
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    target,
    "-i",
    overlay,
    "-filter_complex",
    "[0][1]overlay=x=W-w-48:y=H-h-48",
    "-q:v",
    "3",
    tmp,
  ]);
  await writeFile(target, await readFile(tmp));
}

async function main() {
  await mkdir("public/icons", { recursive: true });

  const rounded = svg({ fullBleed: false });
  const fullBleed = svg({ fullBleed: true });
  await writeFile("app/icon.svg", rounded);
  console.log("vector   app/icon.svg");

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });

  try {
    const page = await browser.newPage();

    // Older browsers and bookmark bars still ask for the .ico, and the three
    // sizes in it are the ones they ask for.
    const entries = [];
    for (const size of [16, 32, 48]) {
      entries.push({ size, png: await raster(page, rounded, size, { opaque: false }) });
    }
    await writeFile("app/favicon.ico", ico(entries));
    console.log("favicon  app/favicon.ico (16, 32, 48)");

    // iOS composites an apple-touch-icon onto white and rounds it itself, so it
    // gets the opaque full-bleed form.
    await writeFile("app/apple-icon.png", await raster(page, fullBleed, 180, { opaque: true }));
    console.log("apple    app/apple-icon.png (180)");

    for (const size of [192, 512]) {
      await writeFile(
        `public/icons/icon-${size}.png`,
        await raster(page, rounded, size, { opaque: false }),
      );
      console.log(`manifest public/icons/icon-${size}.png`);
      await writeFile(
        `public/icons/icon-maskable-${size}.png`,
        await raster(page, fullBleed, size, { opaque: true }),
      );
      console.log(`maskable public/icons/icon-maskable-${size}.png`);
    }

    await brandOpenGraph(page, "app/opengraph-image.jpg");
    console.log("social   app/opengraph-image.jpg");
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
