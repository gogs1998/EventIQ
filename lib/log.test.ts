import { describe, expect, it } from "vitest";
import { errorPayload } from "@/lib/log";

/**
 * The shape is the whole point of the file, so it is the thing under test. A
 * dashboard filter written against `event` or `promoterId` stops working the
 * moment somebody renames a key, and that is not a failure anybody notices until
 * they are looking for a failure.
 */

describe("errorPayload", () => {
  it("carries the context and the error in stable keys", () => {
    const payload = errorPayload(
      { event: "addBout", route: "/promoter/e/cage-county-12/card", promoterId: "pr_1" },
      new Error("D1_ERROR: no such table"),
    );

    expect(payload.level).toBe("error");
    expect(payload.event).toBe("addBout");
    expect(payload.route).toBe("/promoter/e/cage-county-12/card");
    expect(payload.promoterId).toBe("pr_1");
    expect(payload.message).toBe("D1_ERROR: no such table");
    expect(payload.stack).toContain("Error");
    expect(Number.isNaN(Date.parse(payload.at))).toBe(false);
  });

  it("leaves out what it was not told, rather than logging undefined", () => {
    const payload = errorPayload({ event: "health" }, new Error("nope"));
    expect(Object.keys(payload)).not.toContain("promoterId");
    expect(Object.keys(payload)).not.toContain("eventId");
  });

  it("survives being handed something that is not an Error", () => {
    expect(errorPayload({ event: "x" }, "plain string").message).toBe("plain string");
    expect(errorPayload({ event: "x" }, { code: 7 }).message).toBe('{"code":7}');
    expect(errorPayload({ event: "x" }, undefined).message).toBe("Unknown error");

    // A circular object is what a thrown response or a binding tends to be.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorPayload({ event: "x" }, circular).message).toBe("Unknown error");
  });

  it("has no stack where there was none to take", () => {
    expect(errorPayload({ event: "x" }, "no stack here").stack).toBeUndefined();
  });
});
