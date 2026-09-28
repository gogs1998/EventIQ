import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { environmentFrom, wranglerEnvArgs } from "./environments.mjs";

/**
 * There are two places this runs, and a script has to be able to say which.
 *
 * Six scripts carried `const DATABASE = "eventiq"` after this module was
 * written to take those names off them — `retention`, `analytics:rollup`,
 * `r2:orphans`, `render-key`, `db:migrate-invites` and `promoter`. Three of
 * those delete rows with `--apply` and two of them mint credentials, and every
 * one of them accepted `--env staging` without complaint and then wrote to
 * production. The flag was ignored rather than refused, which is the one way of
 * being wrong that nothing reports.
 *
 * So the names are asserted to live here and nowhere else. A script that wants
 * a database takes it from `environmentFrom`, which stops on a name it does not
 * know rather than falling back to production.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A complete string literal naming a database or a bucket, either environment. */
const NAMED = /(["'])eventiq(-media)?(-staging)?\1/;

describe("environmentFrom", () => {
  it("means production when nothing says otherwise", () => {
    expect(environmentFrom(["node", "x.mjs"], fails).database).toBe("eventiq");
  });

  it("means staging when --env says so", () => {
    const target = environmentFrom(["node", "x.mjs", "--env", "staging"], fails);
    expect(target).toMatchObject({
      name: "staging",
      database: "eventiq-staging",
      bucket: "eventiq-media-staging",
    });
  });

  /** A typo and a shell that lost an argument both otherwise mean production. */
  it("stops on a name it does not know rather than falling back", () => {
    let said = "";
    environmentFrom(["node", "x.mjs", "--env", "stagign"], (message) => {
      said = message;
    });
    expect(said).toContain("stagign");
  });

  it("tells wrangler about an environment only where there is one to name", () => {
    expect(wranglerEnvArgs("production")).toEqual([]);
    expect(wranglerEnvArgs("staging")).toEqual(["--env", "staging"]);
  });

  function fails(message) {
    throw new Error(message);
  }
});

describe("every script that reaches Cloudflare", () => {
  const scripts = readdirSync(HERE)
    .filter((file) => /\.(mjs|ts)$/.test(file) && !file.endsWith(".test.mjs"))
    .filter((file) => file !== "environments.mjs");

  it("has some scripts to check, so this cannot pass by finding nothing", () => {
    expect(scripts.length).toBeGreaterThan(10);
  });

  for (const file of scripts) {
    it(`takes the database and the bucket from environments.mjs, not from ${file}`, () => {
      const lines = readFileSync(path.join(HERE, file), "utf8").split(/\r?\n/);
      const named = lines
        .map((line, at) => ({ line: line.trim(), at: at + 1 }))
        .filter(({ line }) => NAMED.test(line));
      expect(named, `${file} names a database or a bucket itself`).toEqual([]);
    });
  }
});
