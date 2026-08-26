import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    // The renderer and the cutout step are plain Node rather than TypeScript,
    // because they run outside the Worker and outside the bundler. Their pure
    // parts still earn tests, so the suite reaches them where they live rather
    // than a copy of them being kept under lib/ to be testable.
    include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});
