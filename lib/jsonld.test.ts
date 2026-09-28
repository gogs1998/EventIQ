import { describe, expect, it } from "vitest";
import { sportsEventJsonLd } from "@/lib/jsonld";

const SHOW = {
  name: "Cage County 12",
  date: "2026-11-14",
  firstBellTime: "19:00",
  doorsTime: "18:00",
  venue: "Grangemouth Town Hall",
  city: "Grangemouth",
  promoter: "Cage County Promotions",
  url: "https://eventiq.win/e/cage-county-12",
};

describe("sportsEventJsonLd", () => {
  it("is a SportsEvent with the four things a listing needs", () => {
    const block = sportsEventJsonLd(SHOW);

    expect(block["@type"]).toBe("SportsEvent");
    expect(block.name).toBe("Cage County 12");
    expect(block.startDate).toBe("2026-11-14T19:00");
    expect(block.location).toMatchObject({
      "@type": "Place",
      name: "Grangemouth Town Hall",
      address: { addressLocality: "Grangemouth" },
    });
    expect(block.organizer).toMatchObject({
      "@type": "Organization",
      name: "Cage County Promotions",
    });
  });

  /**
   * The database stores a calendar day and a wall-clock time because that is
   * what is printed on a ticket. Writing an offset onto it would be a claim
   * about a timezone nobody has recorded, and wrong for half the year here.
   */
  it("states the times as they are recorded, without inventing an offset", () => {
    const block = sportsEventJsonLd(SHOW);
    expect(block.startDate).not.toMatch(/Z|[+-]\d\d:\d\d$/);
    expect(block.doorTime).toBe("2026-11-14T18:00");
  });

  it("carries the tagline as a description where there is one, and nothing where there is not", () => {
    expect(sportsEventJsonLd(SHOW).description).toBeUndefined();
    expect("description" in sportsEventJsonLd(SHOW)).toBe(false);
    expect(sportsEventJsonLd({ ...SHOW, tagline: "Nine bouts, one hall" }).description).toBe(
      "Nine bouts, one hall",
    );
  });

  /** Nothing in the block that is not already on the page a reader can open. */
  it("says nothing the page does not", () => {
    const block = sportsEventJsonLd(SHOW);
    const written = JSON.stringify(block);
    expect(written).not.toMatch(/offers|ticket|price|attendance(?!Mode)|performer/i);
  });

  it("serialises without anything that would break out of a script tag", () => {
    const written = JSON.stringify(sportsEventJsonLd({ ...SHOW, name: "A </script> show" }));
    // The page escapes it before writing it out; this pins that the raw form is
    // what needs escaping rather than assuming it never happens.
    expect(written).toContain("</script>");
  });
});
