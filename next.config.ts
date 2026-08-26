import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge would otherwise be burned into every captured frame
  // by the mp4 exporter, which screenshots the running dev server.
  devIndicators: false,
  images: {
    // Cloudflare's image resizing is bound separately, and every asset this app
    // serves is already optimised by scripts/prepare-assets.mjs.
    unoptimized: true,
  },
};

export default nextConfig;

// Gives `next dev` the same D1 and R2 bindings the Worker gets, backed by the
// local Miniflare state under .wrangler. Without this the dev server has no
// database at all and every page falls over on its first query.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
