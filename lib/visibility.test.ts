import { describe, expect, it } from "vitest";
import { visibleTo } from "@/lib/visibility";

const live = { published: true, promoterId: "cage-county" };
const draft = { published: false, promoterId: "cage-county" };

/**
 * The rule used to live inline in one page, which is how three other routes came
 * to be missing it: the printable table card had no publish check at all, and
 * both generateMetadata functions described any card that loaded. Every public
 * route now goes through loadVisibleCard, and this is the whole of what it
 * decides.
 */
describe("visibleTo", () => {
  it("lets anybody read a published show", () => {
    expect(visibleTo(live, null)).toBe(true);
    expect(visibleTo(live, "somebody-else")).toBe(true);
  });

  it("keeps a draft show to the promoter who owns it", () => {
    expect(visibleTo(draft, "cage-county")).toBe(true);
  });

  it("shows a draft to nobody else, signed in or not", () => {
    expect(visibleTo(draft, null)).toBe(false);
    expect(visibleTo(draft, undefined)).toBe(false);
    expect(visibleTo(draft, "another-promoter")).toBe(false);
  });

  it("does not treat an absent viewer as an absent owner", () => {
    expect(visibleTo({ published: false, promoterId: "" }, "")).toBe(false);
    expect(visibleTo({ published: false, promoterId: "" }, null)).toBe(false);
  });
});
