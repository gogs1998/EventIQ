/**
 * Stands in for `next/navigation`.
 *
 * `redirect()` throws in the real framework too — it is control flow rather than
 * an error, which is why `createEvent` keeps it outside the wrapper that turns
 * everything else into an ActionResult. Here it throws something a test can
 * catch and read the address off, so "the show was created and we went to it"
 * can be asserted rather than assumed.
 */

export class Redirected extends Error {
  constructor(readonly url: string) {
    super(`Redirected to ${url}`);
  }
}

export class NotFound extends Error {}

export function redirect(url: string): never {
  throw new Redirected(url);
}

export function notFound(): never {
  throw new NotFound();
}

/** The address of a redirect, or null where the call did not redirect. */
export async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof Redirected) return error.url;
    throw error;
  }
}
