/**
 * The pure half of the `qrcode` dependency.
 *
 * The package's own entry point pulls in a PNG encoder, a terminal renderer and
 * `fs` behind them, none of which a composition that draws its own rectangles
 * has any use for. `lib/core/qrcode.js` is the encoder on its own — a text
 * string in, a bit matrix out, no I/O and no canvas — which is what makes it
 * safe to call synchronously while React is rendering a frame.
 *
 * Declared here because @types/qrcode types the entry point and not this path.
 * The shape is only what lib/qr.ts uses; widen it if something else needs more.
 */
declare module "qrcode/lib/core/qrcode.js" {
  export type QrBitMatrix = {
    size: number;
    /** One byte per module, low bit set where the module is dark. */
    data: Uint8Array;
  };

  export function create(
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H"; version?: number },
  ): { modules: QrBitMatrix };

  const core: { create: typeof create };
  export default core;
}
