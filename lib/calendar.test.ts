import { describe, expect, it } from "vitest";
import { isCalendarDate, londonToday } from "@/lib/calendar";

describe("isCalendarDate", () => {
  it("takes a day that exists", () => {
    expect(isCalendarDate("2026-11-14")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it("refuses a day that has the shape and does not exist", () => {
    for (const text of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-10", "2026-04-31"]) {
      expect(isCalendarDate(text)).toBe(false);
    }
  });

  it("refuses anything that is not the shape", () => {
    for (const text of ["14/11/2026", "2026-1-4", "", "2026-11-14T00:00"]) {
      expect(isCalendarDate(text)).toBe(false);
    }
  });
});

describe("londonToday", () => {
  it("is the UK's date, an hour ahead of UTC in summer", () => {
    expect(londonToday(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(londonToday(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-01");
  });

  it("is UTC's date in winter", () => {
    expect(londonToday(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });
});
