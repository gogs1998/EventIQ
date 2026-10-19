/**
 * The two byte-shuffling helpers every Workers AI image call needs.
 *
 * Shared by the stylised portrait and the tidied photograph, which are the two
 * places a fighter's photograph goes to a model. Here rather than in either
 * action file because a "use server" file may only export actions.
 */

/**
 * The whole of a byte stream.
 *
 * Read through a reader rather than handed to `new Response(...)`, because the
 * Workers stream type and the DOM one this app also compiles against are not the
 * same declaration and will not assign to each other. The shape below is all
 * either of them needs to satisfy.
 */
export async function collect(stream: {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
}): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** Base64 without blowing the stack on a few hundred kilobytes at a time. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
