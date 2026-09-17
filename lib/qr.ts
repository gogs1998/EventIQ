import { create } from "qrcode";

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
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.dark[row * matrix.size + col]) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }
  return parts.join("");
}
