import { describe, expect, it } from "vitest";
import { parseRange, rangeHeaders } from "./range";

describe("parseRange", () => {
  it("serves the whole object when nothing or nothing usable is asked for", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });

  it("answers Safari's two-byte probe with two bytes", () => {
    expect(parseRange("bytes=0-1", 100)).toEqual({ offset: 0, length: 2 });
  });

  it("reads an open-ended range to the end", () => {
    expect(parseRange("bytes=40-", 100)).toEqual({ offset: 40, length: 60 });
  });

  it("clamps an end past the object", () => {
    expect(parseRange("bytes=90-500", 100)).toEqual({ offset: 90, length: 10 });
  });

  it("reads a suffix from the end, clamped to the object", () => {
    expect(parseRange("bytes=-10", 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange("bytes=-500", 100)).toEqual({ offset: 0, length: 100 });
  });

  it("refuses a range that starts past the end or runs backwards", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=9-3", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
  });
});

describe("rangeHeaders", () => {
  it("says ranges are accepted on a whole answer", () => {
    expect(rangeHeaders(null, 100)).toEqual({ "accept-ranges": "bytes", "content-length": "100" });
  });

  it("names the slice on a partial one", () => {
    expect(rangeHeaders({ offset: 0, length: 2 }, 100)).toMatchObject({
      "content-length": "2",
      "content-range": "bytes 0-1/100",
    });
  });
});
