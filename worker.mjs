/**
 * The Worker's entry: OpenNext's, with the video routes' Content-Length kept on
 * the way out. lib/fixed-length.ts says why it has to happen here rather than
 * in the routes.
 *
 * Plain JavaScript because .open-next/ only exists after a build, and a
 * TypeScript import of it would fail to typecheck on a clean checkout. wrangler
 * bundles this file, TypeScript import included; nothing else imports it.
 */
import openNext from "./.open-next/worker.js";
import { VIDEO_ROUTES, withStatedLength } from "./lib/fixed-length.ts";

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

const worker = {
  async fetch(request, env, ctx) {
    const response = await openNext.fetch(request, env, ctx);
    return VIDEO_ROUTES.test(new URL(request.url).pathname)
      ? withStatedLength(response)
      : response;
  },
};

export default worker;
