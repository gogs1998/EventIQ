import { describe, expect, it } from "vitest";
import { ciVerdict, deployRefusals } from "./deploy-guard.mjs";

const SHA = "6f693680a980776a7ec7caa107585e709d822cc4";
const OTHER = "32d6aef45525ea21679df0abf1729126d0c090df";

const fit = {
  branch: "main",
  deployBranch: "main",
  porcelain: "",
  head: SHA,
  upstream: SHA,
  ci: { state: "success" },
};

describe("deployRefusals", () => {
  it("lets a clean main, level with origin and green on CI, go up", () => {
    expect(deployRefusals(fit)).toEqual([]);
  });

  it("refuses outside git and says nothing else, because nothing else can be known", () => {
    const refusals = deployRefusals({ ...fit, branch: null });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/not a git checkout/);
  });

  it("refuses a side branch", () => {
    expect(deployRefusals({ ...fit, branch: "fix/ops" }).join()).toMatch(/"fix\/ops", not "main"/);
  });

  /** The branch name was the whole of the old check, and this passed it. */
  it("refuses main with an uncommitted change on it", () => {
    const refusals = deployRefusals({ ...fit, porcelain: " M lib/auth.ts\n?? scratch.sql\n" });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatch(/2 uncommitted changes/);
    expect(refusals[0]).toContain("lib/auth.ts");
  });

  it("refuses when git status could not be read rather than reading it as clean", () => {
    expect(deployRefusals({ ...fit, porcelain: null }).join()).toMatch(/git status could not be read/);
  });

  it("refuses main that is behind or ahead of origin", () => {
    expect(deployRefusals({ ...fit, upstream: OTHER }).join()).toMatch(/HEAD is 6f69368 and origin\/main is 32d6aef/);
  });

  it("refuses when origin could not be read rather than assuming it matches", () => {
    expect(deployRefusals({ ...fit, upstream: null }).join()).toMatch(/Could not compare/);
  });

  for (const [state, said] of [
    ["failure", /CI failed/],
    ["pending", /not finished/],
    ["none", /never run/],
    ["unknown", /Could not ask GitHub/],
  ]) {
    it(`refuses when CI's answer is ${state}`, () => {
      expect(deployRefusals({ ...fit, ci: { state } }).join()).toMatch(said);
    });
  }

  it("does not ask about CI when the check was skipped", () => {
    expect(deployRefusals({ ...fit, ci: null })).toEqual([]);
  });

  it("names every problem at once, so they are fixed in one pass", () => {
    const refusals = deployRefusals({
      ...fit,
      branch: "wip",
      porcelain: " M a.ts",
      upstream: OTHER,
      ci: { state: "failure" },
    });
    expect(refusals).toHaveLength(4);
  });
});

describe("ciVerdict", () => {
  it("is none when CI never ran on the commit", () => {
    expect(ciVerdict([])).toEqual({ state: "none" });
    expect(ciVerdict(undefined)).toEqual({ state: "none" });
  });

  it("is success when any run of the commit passed, a re-run after a flake included", () => {
    expect(
      ciVerdict([
        { status: "completed", conclusion: "failure", url: "a" },
        { status: "completed", conclusion: "success", url: "b" },
      ]),
    ).toEqual({ state: "success" });
  });

  it("is pending while a run is still going and none has passed", () => {
    expect(ciVerdict([{ status: "in_progress", conclusion: "", url: "u" }])).toEqual({
      state: "pending",
      detail: "u",
    });
  });

  it("is failure when every run finished and none passed", () => {
    expect(ciVerdict([{ status: "completed", conclusion: "cancelled", url: "u" }]).state).toBe("failure");
  });
});
