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

describe("wrangler.jsonc", () => {
  it("has no repeated key at any level, because only the last one would deploy", () => {
    expect(duplicateKeys(readFileSync("wrangler.jsonc", "utf8"))).toEqual([]);
  });

  it("would have caught the two vars blocks", () => {
    expect(duplicateKeys('{ "vars": { "A": 1 }, "d1": [], "vars": { "B": 2 } }')).toEqual(["vars"]);
    expect(duplicateKeys('{ "env": { "staging": { "vars": {} } }, "vars": {} }')).toEqual([]);
  });
});
