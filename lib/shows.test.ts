import { describe, expect, it } from "vitest";
import {
  groupByCity,
  inCity,
  pageNumber,
  pageOf,
  partitionShows,
  showsHref,
  whenFilter,
  type ShowListing,
} from "@/lib/shows";

/**
 * The ordering rule for the public list, held to a fixed `today`.
 *
 * Nothing in lib/shows.ts reads a clock, which is what makes this a unit test
 * rather than a thing that passes until a Tuesday. The boundary — a show dated
 * today — is the case worth pinning: it is upcoming, because the afternoon of
 * the show is when the card is read hardest.
 */

const TODAY = "2026-09-28";

function show(over: Partial<ShowListing> & { slug: string; date: string }): ShowListing {
  return {
    name: over.slug,
    venue: "Town Hall",
    city: "Grangemouth",
    promoter: "Cage County Promotions",
    bouts: 12,
    ...over,
  };
}

const CARD = [
  show({ slug: "later", date: "2026-12-05", city: "Falkirk" }),
  show({ slug: "long-ago", date: "2025-02-01", city: "Falkirk" }),
  show({ slug: "today", date: TODAY }),
  show({ slug: "soon", date: "2026-10-10", city: "Stirling" }),
  show({ slug: "last-month", date: "2026-08-15" }),
];

describe("partitionShows", () => {
  it("puts what is still to come first, soonest first", () => {
    const { upcoming } = partitionShows(CARD, TODAY);
    expect(upcoming.map((one) => one.slug)).toEqual(["today", "soon", "later"]);
  });

  it("puts what has run behind it, most recent first", () => {
    const { past } = partitionShows(CARD, TODAY);
    expect(past.map((one) => one.slug)).toEqual(["last-month", "long-ago"]);
  });

  /** The boundary, written down: a card being scanned tonight is not history. */
  it("counts the day of the show itself as upcoming", () => {
    const one = [show({ slug: "tonight", date: TODAY })];
    expect(partitionShows(one, TODAY).upcoming).toHaveLength(1);
    expect(partitionShows(one, TODAY).past).toEqual([]);
    // And the morning after it has run.
    expect(partitionShows(one, "2026-09-29").past).toHaveLength(1);
  });

  it("does not disturb the list it was handed", () => {
    const given = [...CARD];
    partitionShows(given, TODAY);
    expect(given.map((one) => one.slug)).toEqual(CARD.map((one) => one.slug));
  });

  /** Two shows on one night have to come out in the same order every load. */
  it("settles a shared date by name rather than by luck", () => {
    const pair = [
      show({ slug: "b", name: "Budo 80", date: "2026-11-14" }),
      show({ slug: "a", name: "Apex 4", date: "2026-11-14" }),
    ];
    expect(partitionShows(pair, TODAY).upcoming.map((one) => one.name)).toEqual([
      "Apex 4",
      "Budo 80",
    ]);
    // And the same pair, reversed, in the half that runs the other way.
    expect(partitionShows(pair, "2026-12-01").past.map((one) => one.name)).toEqual([
      "Budo 80",
      "Apex 4",
    ]);
  });

  it("has two empty halves and no opinion about an empty list", () => {
    expect(partitionShows([], TODAY)).toEqual({ upcoming: [], past: [] });
  });
});

describe("groupByCity", () => {
  it("counts the shows in each city, busiest first", () => {
    expect(groupByCity(CARD)).toEqual([
      { city: "Falkirk", shows: 2 },
      { city: "Grangemouth", shows: 2 },
      { city: "Stirling", shows: 1 },
    ]);
  });

  /** A promoter typing their own venue's town is not typing its capitals. */
  it("treats one town typed two ways as one place, and keeps what was typed first", () => {
    const typed = [
      show({ slug: "one", date: "2026-10-01", city: "Grangemouth" }),
      show({ slug: "two", date: "2026-10-02", city: " grangemouth " }),
    ];
    expect(groupByCity(typed)).toEqual([{ city: "Grangemouth", shows: 2 }]);
  });

  it("says nothing at all about an empty list", () => {
    expect(groupByCity([])).toEqual([]);
  });
});

describe("inCity", () => {
  it("is every show where no city was asked for", () => {
    expect(inCity(CARD, undefined)).toHaveLength(CARD.length);
    expect(inCity(CARD, "  ")).toHaveLength(CARD.length);
  });

  it("matches however the reader typed it", () => {
    for (const typed of ["Falkirk", "falkirk", " FALKIRK "]) {
      expect(inCity(CARD, typed).map((one) => one.slug)).toEqual(["later", "long-ago"]);
    }
  });

  it("is empty for a city with nothing published in it", () => {
    expect(inCity(CARD, "Aberdeen")).toEqual([]);
  });
});

describe("whenFilter", () => {
  it("reads the two values it knows", () => {
    expect(whenFilter("upcoming")).toBe("upcoming");
    expect(whenFilter("past")).toBe("past");
  });

  /** A mistyped filter shows the page, not a boundary. */
  it("is null for anything else", () => {
    for (const value of [undefined, null, "", "UPCOMING", "next", "1"]) {
      expect(whenFilter(value)).toBeNull();
    }
  });
});

describe("pageNumber and pageOf", () => {
  it("reads a page number and falls back to the first page", () => {
    expect(pageNumber("2")).toBe(2);
    for (const value of [undefined, null, "", "0", "-3", "two", "1.5"]) {
      expect(pageNumber(value)).toBe(1);
    }
  });

  it("cuts the list and says whether there is more behind it", () => {
    const items = Array.from({ length: 7 }, (_, n) => n);
    expect(pageOf(items, 1, 3)).toEqual({ items: [0, 1, 2], hasMore: true });
    expect(pageOf(items, 3, 3)).toEqual({ items: [6], hasMore: false });
    expect(pageOf(items, 4, 3)).toEqual({ items: [], hasMore: false });
  });

  it("says there is no more where the list ends exactly on the boundary", () => {
    expect(pageOf([0, 1, 2], 1, 3)).toEqual({ items: [0, 1, 2], hasMore: false });
  });
});

describe("showsHref", () => {
  it("is the bare page with nothing set", () => {
    expect(showsHref({})).toBe("/shows");
    expect(showsHref({ city: null, when: null, page: 1 })).toBe("/shows");
  });

  it("carries every filter that is set, so a link cannot drop one", () => {
    expect(showsHref({ city: "Falkirk", when: "past", page: 2 })).toBe(
      "/shows?city=Falkirk&when=past&page=2",
    );
  });

  it("escapes a city with a space in it", () => {
    expect(showsHref({ city: "Newcastle upon Tyne" })).toBe(
      "/shows?city=Newcastle+upon+Tyne",
    );
  });
});
