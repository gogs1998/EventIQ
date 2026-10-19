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

  /** `--env=staging` used to be read as no flag at all, which is production. */
  it("means staging when --env=staging says so", () => {
    expect(environmentFrom(["node", "x.mjs", "--env=staging"], fails)).toMatchObject({
      name: "staging",
      database: "eventiq-staging",
    });
  });

  it("stops on an --env= with a name it does not know", () => {
    expect(() => environmentFrom(["node", "x.mjs", "--env=prod"], fails)).toThrow(/"prod"/);
    expect(() => environmentFrom(["node", "x.mjs", "--env="], fails)).toThrow(/no "" environment/);
  });

  it("stops on --env with nothing after it rather than meaning production", () => {
    expect(() => environmentFrom(["node", "x.mjs", "--env"], fails)).toThrow(/environment/);
  });

  for (const spelling of ["--environment", "--envstaging", "--env:staging", "--envs"]) {
    it(`stops on ${spelling}, which looks like a choice of environment and is not one`, () => {
      expect(() => environmentFrom(["node", "x.mjs", spelling, "staging"], fails)).toThrow(spelling);
    });
  }

  it("stops when two different environments are named", () => {
    expect(() =>
      environmentFrom(["node", "x.mjs", "--env", "staging", "--env=production"], fails),
    ).toThrow(/more than once/);
  });

  it("returns nothing usable when fail does not stop the process", () => {
    const target = environmentFrom(["node", "x.mjs", "--env=nope"], () => {});
    expect(target.database).toBeUndefined();
    expect(target.bucket).toBeUndefined();
  });

  it("does not take a property of Object.prototype for an environment", () => {
    expect(() => environmentFrom(["node", "x.mjs", "--env", "toString"], fails)).toThrow(/toString/);
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
