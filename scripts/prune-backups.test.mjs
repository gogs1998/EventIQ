import { describe, expect, it } from "vitest";
import { expiredBackupKeys } from "./prune-backups.mjs";

describe("expiredBackupKeys", () => {
  const today = new Date("2026-10-19T03:15:00Z");

  it("keeps today and the twenty-nine days before it", () => {
    const keys = expiredBackupKeys(today, 30);
    expect(keys[0]).toBe("backups/2026-09-19.sql");
    expect(keys).not.toContain("backups/2026-09-20.sql");
    expect(keys).not.toContain("backups/2026-10-19.sql");
  });

  it("reaches a fortnight past the window, so missed nights still catch up", () => {
    const keys = expiredBackupKeys(today, 30);
    expect(keys).toHaveLength(14);
    expect(keys.at(-1)).toBe("backups/2026-09-06.sql");
  });

  it("names exact backup keys and nothing a pattern could widen", () => {
    for (const key of expiredBackupKeys(today, 30)) {
      expect(key).toMatch(/^backups\/\d{4}-\d{2}-\d{2}\.sql$/);
    }
  });

  it("works in UTC, as the backup names its files", () => {
    const lateEvening = new Date("2026-10-19T23:59:59+00:00");
    const earlyMorning = new Date("2026-10-20T00:30:00+01:00"); // still the 19th in UTC
    expect(expiredBackupKeys(lateEvening)).toEqual(expiredBackupKeys(earlyMorning));
  });

  it("crosses a month and a year boundary", () => {
    expect(expiredBackupKeys(new Date("2027-01-05T03:00:00Z"), 30)[0]).toBe("backups/2026-12-06.sql");
  });

  it("refuses a retention that is not a whole number of days", () => {
    expect(() => expiredBackupKeys(today, 0)).toThrow();
    expect(() => expiredBackupKeys(today, 2.5)).toThrow();
    expect(() => expiredBackupKeys(today, Number.NaN)).toThrow();
  });
});
