import { describe, expect, it } from "vitest";
import { parseProfileUrl } from "@/lib/fighter-import";

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
