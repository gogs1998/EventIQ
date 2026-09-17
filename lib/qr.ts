import { create } from "qrcode/lib/core/qrcode.js";

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
