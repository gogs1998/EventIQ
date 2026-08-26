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
