import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo ships as plain files so it can be handed to a promoter, or dropped
  // on any host, without a server to keep alive.
  output: "export",
  images: { unoptimized: true },
  // The dev overlay badge would otherwise be burned into every captured frame.
  devIndicators: false,
};

export default nextConfig;
