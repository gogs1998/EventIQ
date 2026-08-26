import { defineConfig } from "drizzle-kit";

/**
 * Generates SQL migrations from db/schema.ts.
 *
 * Deliberately not configured with credentials to push directly at a remote
 * database. Migrations are files, they get reviewed, and they are applied by
 * `wrangler d1 migrations apply`, which keeps a record of what ran. A tool that
 * silently reshapes production from a developer's laptop is not wanted here.
 */
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
});
