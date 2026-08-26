import { describe, expect, it } from "vitest";
import { mastheadFor } from "@/lib/masthead";

describe("mastheadFor", () => {
  it("brands the pages EventIQ is selling from", () => {
    expect(mastheadFor("/")).toBe("full");
    expect(mastheadFor("/about-the-importer")).toBe("full");
  });

  it("leaves the promoter's product to the promoter", () => {
    expect(mastheadFor("/e/cage-county-12")).toBe("none");
    expect(mastheadFor("/e/cage-county-12/f/marcus-reeves")).toBe("none");
    expect(mastheadFor("/e/cage-county-12/qr")).toBe("none");
    expect(mastheadFor("/qr")).toBe("none");
  });

  it("leaves the questionnaire alone", () => {
    expect(mastheadFor("/f/aG9sZA")).toBe("none");
    expect(mastheadFor("/f/demo")).toBe("none");
  });

  /**
   * The capture surface is screenshotted 480 times per bout. A header on it is not
   * a design mistake, it is a header in the video.
   */
  it("paints nothing onto the render stage", () => {
    expect(mastheadFor("/render/cage-county-12/15")).toBe("none");
  });

  it("gives the promoter's own tool a modest one", () => {
    expect(mastheadFor("/promoter")).toBe("modest");
    expect(mastheadFor("/promoter/login")).toBe("modest");
    expect(mastheadFor("/promoter/e/cage-county-12")).toBe("modest");
    expect(mastheadFor("/promoter/e/cage-county-12/card")).toBe("modest");
  });

  /**
   * Prefixes have to match whole segments. `/e` standing for the programme must
   * never quietly swallow a marketing page that happens to start with an e.
   */
  it("matches segments rather than characters", () => {
    expect(mastheadFor("/events")).toBe("full");
    expect(mastheadFor("/eventiq")).toBe("full");
    expect(mastheadFor("/features")).toBe("full");
    expect(mastheadFor("/qr-codes-explained")).toBe("full");
    expect(mastheadFor("/promoters")).toBe("full");
  });

  it("does not change its mind over a trailing slash", () => {
    expect(mastheadFor("/e/cage-county-12/")).toBe("none");
    expect(mastheadFor("/promoter/")).toBe("modest");
    expect(mastheadFor("/")).toBe("full");
  });
});
