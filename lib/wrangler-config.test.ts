import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * wrangler.jsonc is JSON with comments, and JSON tolerates a repeated key by
 * keeping the last one. Twice now a merge has left two "vars" blocks in it,
 * and both times only the second would have deployed — the showcase slug
 * silently gone from production (bugs 35 and 43). This parses the file the
 * strict way and refuses a repeated key at any level.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function duplicateKeys(source: string): string[] {
  const found: string[] = [];
  const stack: Set<string>[] = [];
  let i = 0;
  const text = stripComments(source);
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const str = text.slice(i + 1, j);
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k += 1;
      if (text[k] === ":" && stack.length) {
        const keys = stack[stack.length - 1];
        if (keys.has(str)) found.push(str);
        keys.add(str);
      }
      i = j + 1;
      continue;
    }
    if (ch === "{") stack.push(new Set());
    if (ch === "}") stack.pop();
    i += 1;
  }
  return found;
}

const SOURCE = readFileSync("wrangler.jsonc", "utf8");

type Config = {
  vars: Record<string, string>;
  ratelimits: { name: string }[];
  env: Record<string, { vars: Record<string, string>; ratelimits: { name: string }[] }>;
};

const config = JSON.parse(stripComments(SOURCE)) as Config;

describe("wrangler.jsonc", () => {
  it("has no repeated key at any level, because only the last one would deploy", () => {
    expect(duplicateKeys(SOURCE)).toEqual([]);
  });

  it("would have caught the two vars blocks", () => {
    expect(duplicateKeys('{ "vars": { "A": 1 }, "d1": [], "vars": { "B": 2 } }')).toEqual(["vars"]);
    expect(duplicateKeys('{ "env": { "staging": { "vars": {} } }, "vars": {} }')).toEqual([]);
  });

  /**
   * Wrangler does not inherit `vars` or `ratelimits` into a named environment,
   * which is deliberate — an environment must not end up silently pointed at
   * production's database by a line left out. The cost is that every one of
   * them has to be written twice, and an absent var is a *supported* state
   * rather than a crash: bug 43 went out with `SHOWCASE_SLUG` missing and
   * nothing anywhere said so. So the two copies are held together here instead
   * of by somebody remembering.
   */
  for (const [name, environment] of Object.entries(config.env)) {
    it(`gives ${name} every var production has, because an absent one fails quietly`, () => {
      expect(Object.keys(environment.vars).sort()).toEqual(Object.keys(config.vars).sort());
    });

    it(`gives ${name} every limiter production has`, () => {
      expect(environment.ratelimits.map((limit) => limit.name).sort()).toEqual(
        config.ratelimits.map((limit) => limit.name).sort(),
      );
    });
  }

  /**
   * The binding names the app asks for by hand. `readVar` and `readSecret` in
   * lib/db are typed on them and `within` in lib/rate-limit.ts indexes the env
   * with them, so a name changed here and not there is a variable that reads as
   * unset and a limiter that refuses in production — neither of which looks
   * like a mistake from the outside.
   */
  it("declares the vars and the limiters the app reads by name", () => {
    expect(Object.keys(config.vars).sort()).toEqual(
      ["EVENTIQ_ENV", "SHOWCASE_SLUG", "STYLISED_PORTRAITS"].sort(),
    );
    expect(config.ratelimits.map((limit) => limit.name).sort()).toEqual(
      ["IMPORT_LOOKUPS", "LOGIN_ATTEMPTS", "TRACK_WRITES"].sort(),
    );
  });
});
