import { create } from "qrcode";

/**
 * A QR code as geometry, for anything that has to draw one rather than wait for
 * one.
 *
 * components/QrCode.tsx generates its code in an effect, which is right for a
 * page: it reads the browser's own origin, so a code scanned off a laptop in a
 * meeting goes where that laptop is serving from. A video composition cannot do
 * either of those things. It is a pure function of a frame number — the mp4
 * exporter screenshots frame *n* and expects the same picture every time — so
 * the code has to exist at the moment React renders, with no effect, no state
 * and nothing to wait for.
 *
 * So: the encoder synchronously, and the modules drawn as one SVG path. Never as
 * text. A URL printed in the corner of a video is not a thing anybody can use,
 * and a code drawn out of characters is not a code.
 */

/** Error correction. `M` is what the printed table card uses; one code, one look. */
const LEVEL = "M";

export type QrPath = {
  /** Modules across, which is also the path's coordinate space. */
  size: number;
  /** An SVG path covering every dark module, in that coordinate space. */
  path: string;
};

/**
 * The dark modules of `text`, merged into runs along each row.
 *
 * A rect per module is upwards of a thousand elements for a URL of any length,
 * and every one of them is a node React reconciles on all three hundred frames
 * of a walkout. Runs collapse the usual code to a few hundred path commands
 * drawn in one element, which is the same picture for a fraction of the work.
 */
export function qrPath(text: string): QrPath {
  const { modules } = create(text, { errorCorrectionLevel: LEVEL });
  const { size, data } = modules;

  const commands: string[] = [];
  for (let y = 0; y < size; y += 1) {
    let runStart: number | null = null;
    // One past the last column, so a run reaching the right-hand edge is closed
    // by the loop rather than by a special case after it.
    for (let x = 0; x <= size; x += 1) {
      const dark = x < size && (data[y * size + x] ?? 0) !== 0;
      if (dark && runStart === null) runStart = x;
      if (!dark && runStart !== null) {
        commands.push(`M${runStart} ${y}h${x - runStart}v1h${runStart - x}z`);
        runStart = null;
      }
    }
  }

  return { size, path: commands.join("") };
}

/* -------------------------------------------------------------------------
 * The same code as a matrix with a quiet zone, for the show-level compositions,
 * which lay the modules out themselves. Two shapes of the one encoder, both
 * synchronous, both medium correction, so every code on every surface is the
 * same code.
 * ---------------------------------------------------------------------- */

/**
 * A QR code as data a composition can draw, rather than as a picture.
 *
 * `components/QrCode.tsx` makes one in the browser from the current origin,
 * because a code on a printed table card is scanned off whatever screen or
 * sheet it is in front of. A video is the other case entirely: it leaves here
 * and is watched on somebody else's phone, so the address in it has to be the
 * canonical one, and it has to be in the frame before the exporter screenshots
 * it. An <img> that arrives a moment late is a frame of nothing in the mp4, and
 * a component that generates one in an effect is not a pure function of its
 * props.
 *
 * So the matrix is worked out on the server, handed to the composition as a
 * prop like everything else, and drawn as one SVG path — no request, no decode,
 * nothing to wait for.
 */

export type QrMatrix = {
  /** Modules per side, including the quiet zone this adds. */
  size: number;
  /** Row-major, one entry per module. True is a dark module. */
  dark: readonly boolean[];
};

/**
 * The quiet zone the specification asks for, in modules.
 *
 * Carried in the matrix rather than left to the layout, because a code with a
 * dark module against the edge of its own plate is a code a phone struggles to
 * find, and a video frame gives the scanner one look at it from across a room.
 */
const QUIET_ZONE = 2;

export function qrMatrix(target: string): QrMatrix {
  // Medium correction, the same level the table card uses, so a code read off a
  // screen and a code read off paper are the same code.
  const { modules } = create(target, { errorCorrectionLevel: "M" });
  const size = modules.size + QUIET_ZONE * 2;

  const dark: boolean[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const inner =
        row >= QUIET_ZONE &&
        col >= QUIET_ZONE &&
        row < size - QUIET_ZONE &&
        col < size - QUIET_ZONE;
      dark.push(inner ? modules.get(row - QUIET_ZONE, col - QUIET_ZONE) === 1 : false);
    }
  }

  return { size, dark };
}

/**
 * The dark modules as one SVG path, in module units.
 *
 * One path rather than a rectangle per module: a 33-module code is over a
 * thousand elements, and the composition is re-rendered for every one of the
 * frames the exporter captures.
 */
export function qrMatrixPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.dark[row * matrix.size + col]) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }
  return parts.join("");
}
