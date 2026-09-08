import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const double = (file: string) => path.join(root, "tests", "db", file);

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: { "@": root },
        },
        test: {
          name: "unit",
          // The renderer and the cutout step are plain Node rather than TypeScript,
          // because they run outside the Worker and outside the bundler. Their pure
          // parts still earn tests, so the suite reaches them where they live rather
          // than a copy of them being kept under lib/ to be testable.
          include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs"],
          environment: "node",
        },
      },
      {
        /**
         * The four modules that only exist inside a request or inside a Worker,
         * swapped for doubles over one local D1 and one cookie jar. Everything
         * else — the queries, the gate, the promoter's actions — runs exactly as
         * written. tests/db/platform.ts says why this rather than the workers
         * pool, and tests/db/bindings.ts carries a typecheck that stops the
         * lib/db double drifting from the module it stands in for.
         *
         * Regular expressions rather than the object form, because `@/lib/db` as
         * a string would also capture `@/lib/db/queries`.
         */
        resolve: {
          alias: [
            { find: /^@\/lib\/db$/, replacement: double("bindings.ts") },
            { find: /^next\/headers$/, replacement: double("next-headers.ts") },
            { find: /^next\/cache$/, replacement: double("next-cache.ts") },
            { find: /^next\/navigation$/, replacement: double("next-navigation.ts") },
            { find: /^@\//, replacement: `${root}/` },
          ],
        },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          // One file at a time, so there is one workerd running rather than one
          // per test file side by side. This machine does not have the memory
          // for the other arrangement and neither does a CI runner worth paying
          // for.
          pool: "forks",
          fileParallelism: false,
          // Starting the platform and applying the migrations is a second or so,
          // and it happens once per file rather than once per test.
          hookTimeout: 60_000,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
