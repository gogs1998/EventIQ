import { describe, expect, it } from "vitest";
import { parseProfileUrl, recordDiff, type ImportedTape } from "@/lib/fighter-import";

describe("parseProfileUrl", () => {
  it("reads a Sherdog fighter link", () => {
    const ref = parseProfileUrl("https://www.sherdog.com/fighter/Owen-Pryce-123456");
    expect(ref?.source).toBe("sherdog");
    expect(ref?.slug).toBe("Owen-Pryce-123456");
  });

  it("reads a Tapology fighter link", () => {
    const ref = parseProfileUrl("https://www.tapology.com/fightcenter/fighters/owen-pryce");
    expect(ref?.source).toBe("tapology");
    expect(ref?.slug).toBe("owen-pryce");
  });

  it("copes with a link pasted without the scheme", () => {
    expect(parseProfileUrl("sherdog.com/fighter/Owen-Pryce-123456")?.source).toBe("sherdog");
  });

  it("copes without the www", () => {
    expect(parseProfileUrl("https://sherdog.com/fighter/Owen-Pryce-1")?.source).toBe("sherdog");
  });

  it("ignores query strings and fragments when reading the slug", () => {
    const ref = parseProfileUrl("https://www.sherdog.com/fighter/Owen-Pryce-1?tab=x#bio");
    expect(ref?.slug).toBe("Owen-Pryce-1");
  });

  it("rejects the right site but the wrong kind of page", () => {
    expect(parseProfileUrl("https://www.sherdog.com/events/Some-Event-99")).toBeNull();
  });

  it("rejects an unrelated host", () => {
    expect(parseProfileUrl("https://example.com/fighter/Owen-Pryce-1")).toBeNull();
  });

  it("rejects nonsense rather than guessing", () => {
    expect(parseProfileUrl("my record is 2-1")).toBeNull();
    expect(parseProfileUrl("")).toBeNull();
    expect(parseProfileUrl("   ")).toBeNull();
  });

  it("does not mistake a lookalike domain for the real one", () => {
    expect(parseProfileUrl("https://notsherdog.com/fighter/Owen-Pryce-1")).toBeNull();
    expect(parseProfileUrl("https://sherdog.com.evil.test/fighter/Owen-Pryce-1")).toBeNull();
  });
});

/**
 * The cache row is the thing being protected. /api/import-record takes no token
 * and writes a row per distinct URL, so anything the caller can vary freely and
 * we key on is an unbounded number of rows in D1 and an unbounded number of
 * requests to somebody else's website. One fighter has to be one key.
 */
describe("the cache key", () => {
  const key = (input: string) => parseProfileUrl(input)?.cacheKey;

  it("resolves two links differing only by query string to one cache key", () => {
    expect(key("https://www.sherdog.com/fighter/Owen-Pryce-1?bust=1")).toBe(
      key("https://www.sherdog.com/fighter/Owen-Pryce-1?bust=2"),
    );
    expect(key("https://www.sherdog.com/fighter/Owen-Pryce-1")).toBe(
      key("https://www.sherdog.com/fighter/Owen-Pryce-1?utm_source=whatsapp#bio"),
    );
  });

  it("takes no notice of the www, the casing or a trailing path", () => {
    const canonical = key("https://www.sherdog.com/fighter/Owen-Pryce-1");
    expect(key("sherdog.com/fighter/Owen-Pryce-1")).toBe(canonical);
    expect(key("https://WWW.SHERDOG.COM/fighter/owen-pryce-1")).toBe(canonical);
    expect(key("https://www.sherdog.com/fighter/Owen-Pryce-1/fights")).toBe(canonical);
  });

  it("keeps two different fighters apart", () => {
    expect(key("https://www.sherdog.com/fighter/Owen-Pryce-1")).not.toBe(
      key("https://www.sherdog.com/fighter/Owen-Pryce-2"),
    );
    expect(key("https://www.sherdog.com/fighter/Owen-Pryce-1")).not.toBe(
      key("https://www.tapology.com/fightcenter/fighters/Owen-Pryce-1"),
    );
  });

  it("fetches one address per fighter, whatever was pasted", () => {
    expect(parseProfileUrl("sherdog.com/fighter/Owen-Pryce-1?bust=9")?.url).toBe(
      "https://www.sherdog.com/fighter/Owen-Pryce-1",
    );
  });
});

/**
 * The promoter's paste box writes to somebody else's profile — a fighter on
 * their card who has not answered — so it never simply saves. The diff is what
 * it shows first, and it is the same function that decides what gets written, so
 * the confirmation and the write cannot disagree.
 *
 * The rule underneath all of it is the fighter's side's rule read from the other
 * end: an import fills blanks. Anything a person typed wins over anything a page
 * said, because amateur records go stale and the person is the one who knows.
 */
describe("recordDiff", () => {
  const tape: ImportedTape & { name?: string } = {
    source: "sherdog",
    name: "Owen Pryce",
    age: 24,
    hometown: "Wrexham",
    record: { w: 4, l: 1, d: 0 },
    notCovered: [],
  };

  const fills = (rows: ReturnType<typeof recordDiff>) =>
    rows.filter((row) => row.fills).map((row) => row.key);

  it("fills every box the card has left empty", () => {
    expect(fills(recordDiff({ name: "Owen Pryce" }, tape))).toEqual(["record", "age", "hometown"]);
  });

  it("leaves an answer the card already carries exactly where it is", () => {
    const rows = recordDiff(
      { name: "O Pryce", age: 25, hometown: "Rhosllanerchrugog", record: { w: 2, l: 2, d: 0 } },
      tape,
    );
    expect(fills(rows)).toEqual([]);
    // Still shown, so the promoter can see the two disagree and decide for
    // themselves rather than finding out on the night.
    expect(rows.map((row) => row.key)).toEqual(["name", "record", "age", "hometown"]);
    expect(rows.find((row) => row.key === "age")).toMatchObject({ from: "25", to: "24" });
  });

  it("says nothing about a box the page has nothing for", () => {
    const bare: ImportedTape = { source: "sherdog", notCovered: [] };
    expect(recordDiff({ name: "Owen Pryce" }, bare)).toEqual([]);
  });

  it("prints a record the way the card does", () => {
    const drawn = { ...tape, record: { w: 4, l: 1, d: 2 } };
    expect(recordDiff({}, tape).find((row) => row.key === "record")?.to).toBe("4-1");
    expect(recordDiff({}, drawn).find((row) => row.key === "record")?.to).toBe("4-1-2");
  });

  /** A box of spaces is an empty box, the same as everywhere else here. */
  it("treats whitespace as nothing rather than as an answer", () => {
    expect(fills(recordDiff({ name: "   ", hometown: " " }, tape))).toContain("name");
    expect(fills(recordDiff({ name: "   ", hometown: " " }, tape))).toContain("hometown");
  });
});
