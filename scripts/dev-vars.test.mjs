import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { devVars } from "./dev-vars.mjs";

/**
 * The file is hand-edited on whatever machine the operator has, so the parser
 * has to read it however that machine saved it.
 */
describe("devVars", () => {
  const write = (body) => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "eventiq-devvars-")), ".dev.vars");
    writeFileSync(file, body);
    return file;
  };

  it("reads a file with Unix line endings", () => {
    expect(devVars(write("A=1\nB = two\n# comment\nC='quoted'\n"))).toEqual({ A: "1", B: "two", C: "quoted" });
  });

  it("reads a file with Windows line endings the same way", () => {
    expect(devVars(write("A=1\r\nB = two\r\n# comment\r\nC='quoted'\r\n"))).toEqual({ A: "1", B: "two", C: "quoted" });
  });

  it("is empty for a missing file", () => {
    expect(devVars(path.join(tmpdir(), "does-not-exist", ".dev.vars"))).toEqual({});
  });
});
