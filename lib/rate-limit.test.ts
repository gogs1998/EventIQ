import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMPORT_LOOKUPS_PER_MINUTE, callerKey } from "@/lib/rate-limit";
import { FETCHES_PER_HOUR, withinFetchBudget } from "@/lib/record-import";

const requestWith = (headers: Record<string, string>) =>
  new Request("https://eventiq.win/api/import-record", { method: "POST", headers });

describe("callerKey", () => {
  /**
   * Cloudflare sets CF-Connecting-IP itself on every request that reaches the
   * Worker, so it is the one address here the caller cannot choose. Preferring a
   * header the caller writes would make the limit opt-out.
   */
  it("prefers the address the edge sets over anything the caller sends", () => {
    expect(
      callerKey(
        requestWith({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to the first forwarded address when there is no edge one", () => {
    expect(callerKey(requestWith({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }))).toBe(
      "198.51.100.1",
    );
  });

  it("puts everything it cannot attribute in one bucket rather than letting it past", () => {
    expect(callerKey(requestWith({}))).toBe("unattributed");
    expect(callerKey(requestWith({ "cf-connecting-ip": "  " }))).toBe("unattributed");
  });
});

describe("the allowance", () => {
  it("is loose enough for a promoter working down a card by hand", () => {
    expect(IMPORT_LOOKUPS_PER_MINUTE).toBeGreaterThanOrEqual(5);
    expect(IMPORT_LOOKUPS_PER_MINUTE).toBeLessThanOrEqual(60);
  });

  /**
   * The binding enforces the number and the constant documents it, which is
   * exactly the arrangement that let PBKDF2's iteration count drift away from
   * what production was actually running. So they are asserted to agree.
   */
  it("says the same thing as the binding that enforces it", () => {
    const config = JSON.parse(
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(
        /^\s*\/\/.*$/gm,
        "",
      ),
    ) as { ratelimits: { name: string; simple: { limit: number; period: number } }[] };

    const limiter = config.ratelimits.find((entry) => entry.name === "IMPORT_LOOKUPS");
    expect(limiter?.simple).toEqual({ limit: IMPORT_LOOKUPS_PER_MINUTE, period: 60 });
  });
});

/**
 * The per-address limiter counts per Cloudflare location, so a caller spread
 * across several gets more than their share of it. This is the bound that does
 * not depend on telling callers apart, and it is the one that actually caps how
 * many rows the open endpoint can put in D1.
 */
describe("the hourly fetch budget", () => {
  it("lets a promoter get through two full cards' worth of fighters", () => {
    expect(withinFetchBudget(0)).toBe(true);
    expect(withinFetchBudget(60)).toBe(true);
    expect(FETCHES_PER_HOUR).toBeGreaterThanOrEqual(60);
  });

  it("refuses once the hour's allowance is spent, rather than at some point after", () => {
    expect(withinFetchBudget(FETCHES_PER_HOUR - 1)).toBe(true);
    expect(withinFetchBudget(FETCHES_PER_HOUR)).toBe(false);
    expect(withinFetchBudget(FETCHES_PER_HOUR + 5000)).toBe(false);
  });
});
