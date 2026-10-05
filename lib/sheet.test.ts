import { describe, expect, it } from "vitest";
import { parseSheet, sanitiseRows, type SheetBout } from "@/lib/sheet";

/**
 * The shapes a matchmaking sheet actually arrives in.
 *
 * Every input below is written the way a promoter writes one rather than the way
 * a parser would like one: brackets round a gym on one line and a comma on the
 * next, a weight on some and nothing on others, a spreadsheet's tabs, a caption
 * off a poster. The point of the parser is that all of them land on the same
 * card, so the point of these is that none of the shapes quietly stops working
 * when the next one is added.
 *
 * The other half of what is checked here is the rule the preview depends on: a
 * field nothing on the line stated is named in `assumed`. A default that arrives
 * silently is a weight the matchmaker never agreed to, printed on a programme.
 */

const only = (text: string): SheetBout => {
  const { bouts, problems } = parseSheet(text);
  expect(problems).toEqual([]);
  expect(bouts).toHaveLength(1);
  return bouts[0];
};

/**
 * The six-bout card the owner entered by hand, written the way it came: a
 * poster caption, a line with nothing but two surnames, a spreadsheet row, and
 * three in between.
 */
const BUDO_SHEET = [
  "Neil McLay (Urban Guerrillas) v Declan Lowe (Crowning Glory) - MMA 80kg 3x3",
  "McLay vs Lowe",
  "1. Enes Oner, Urban Guerrillas vs Cole Snee, Dundee MMA, K1, 63kg",
  "2. Rhona Kidd (Griphouse) vs Marta Nowak (Dinky Ninjas) — Women's MMA 57kg",
  "3. Aiden Roche v Kacper Zielinski - Muay Thai 66kg 3x2 C Class",
  "4. Sam Threlfall, Higher Level vs Owen Pryce, Bryn Athletic, Boxing, 71kg, 3x3",
].join("\n");

describe("a poster caption", () => {
  it("reads the gyms out of the brackets and the grading off the tail", () => {
    const bout = only("Neil McLay (Urban Guerrillas) v Declan Lowe (Crowning Glory) - MMA 80kg 3x3");

    expect(bout.red).toEqual({ name: "Neil McLay", gym: "Urban Guerrillas" });
    expect(bout.blue).toEqual({ name: "Declan Lowe", gym: "Crowning Glory" });
    expect(bout).toMatchObject({
      discipline: "MMA",
      weightKg: 80,
      rounds: 3,
      roundMinutes: 3,
      assumed: [],
    });
  });

  it("takes an em dash between the names and the grading as readily as a hyphen", () => {
    const bout = only("Rhona Kidd (Griphouse) vs Marta Nowak (Dinky Ninjas) — Women's MMA 57kg");

    expect(bout.womens).toBe(true);
    expect(bout.weightKg).toBe(57);
    expect(bout.blue.gym).toBe("Dinky Ninjas");
  });
});

describe("two surnames and nothing else", () => {
  /**
   * The commonest line on a sheet that is still being matched. It has to become
   * a bout — the names are the running order — and every other field has to be
   * marked as something nobody said.
   */
  it("becomes a bout that admits what it does not know", () => {
    const bout = only("McLay vs Lowe");

    expect(bout.red).toEqual({ name: "McLay", gym: "" });
    expect(bout.blue).toEqual({ name: "Lowe", gym: "" });
    expect(bout.assumed).toEqual(["discipline", "weight", "rounds"]);
    expect(bout).toMatchObject({ discipline: "MMA", weightKg: 70, rounds: 3, roundMinutes: 3 });
  });
});

describe("commas", () => {
  it("reads name, gym on each side and the grading after the blue corner", () => {
    const bout = only("1. Enes Oner, Urban Guerrillas vs Cole Snee, Dundee MMA, K1, 63kg");

    expect(bout.red).toEqual({ name: "Enes Oner", gym: "Urban Guerrillas" });
    expect(bout.blue).toEqual({ name: "Cole Snee", gym: "Dundee MMA" });
    expect(bout.discipline).toBe("K1");
    expect(bout.weightKg).toBe(63);
  });

  /**
   * The case the whole-cell rule exists for. "Dundee MMA" is a gym with the name
   * of a discipline inside it, and a parser matching words rather than cells
   * would put the bout on as MMA and drop the gym.
   */
  it("does not read a gym as a discipline because a discipline is part of its name", () => {
    const bout = only("Enes Oner, Urban Guerrillas vs Cole Snee, Dundee MMA, K1, 63kg");

    expect(bout.blue.gym).toBe("Dundee MMA");
    expect(bout.discipline).toBe("K1");
  });
});

describe("a spreadsheet paste", () => {
  const SPREADSHEET = [
    "No\tRed\tGym\tBlue\tGym\tDiscipline\tWeight\tFormat",
    "1\tNeil McLay\tUrban Guerrillas\tDeclan Lowe\tCrowning Glory\tMMA\t80\t3x3",
    "2\tEnes Oner\tUrban Guerrillas\tCole Snee\tDundee MMA\tK1\t63\t3x3",
    "3\tAiden Roche\tShugyo\tKacper Zielinski\tMTC\tMuay Thai\t66\t3x2",
  ].join("\r\n");

  it("skips the column headings rather than reporting them as a bad line", () => {
    const { bouts, problems } = parseSheet(SPREADSHEET);

    expect(problems).toEqual([]);
    expect(bouts).toHaveLength(3);
  });

  it("reads the columns with no separator between the corners", () => {
    const { bouts } = parseSheet(SPREADSHEET);

    expect(bouts[0].red).toEqual({ name: "Neil McLay", gym: "Urban Guerrillas" });
    expect(bouts[0].blue).toEqual({ name: "Declan Lowe", gym: "Crowning Glory" });
    expect(bouts[2]).toMatchObject({ discipline: "MUAY_THAI", weightKg: 66, roundMinutes: 2 });
  });

  it("counts the lines from the top of the paste, headings included", () => {
    const { bouts } = parseSheet(SPREADSHEET);

    expect(bouts.map((bout) => bout.line)).toEqual([2, 3, 4]);
  });

  it("still takes a tabbed sheet that does put a v between the corners", () => {
    const bout = only("Neil McLay\tUrban Guerrillas\tv\tDeclan Lowe\tCrowning Glory\tMMA\t80kg");

    expect(bout.red).toEqual({ name: "Neil McLay", gym: "Urban Guerrillas" });
    expect(bout.blue).toEqual({ name: "Declan Lowe", gym: "Crowning Glory" });
    expect(bout.weightKg).toBe(80);
  });
});

describe("what the sheet did not say", () => {
  it("names the weight as assumed where the line carries only a discipline", () => {
    const bout = only("Aiden Roche v Kacper Zielinski - Muay Thai");

    expect(bout.discipline).toBe("MUAY_THAI");
    expect(bout.assumed).toEqual(["weight", "rounds"]);
  });

  it("names the discipline as assumed where the line carries only a weight", () => {
    const bout = only("Aiden Roche v Kacper Zielinski - 66kg");

    expect(bout.weightKg).toBe(66);
    expect(bout.assumed).toEqual(["discipline", "rounds"]);
  });

  /** Three rounds said, the length of them not. Only the half that was read counts. */
  it("takes the round count without inventing a length that was not given", () => {
    const bout = only("Aiden Roche v Kacper Zielinski - MMA 66kg 5 rounds");

    expect(bout).toMatchObject({ rounds: 5, roundMinutes: 3, assumed: ["minutes"] });
  });
});

describe("the separator", () => {
  it.each([
    ["Neil McLay v Declan Lowe", "Neil McLay", "Declan Lowe"],
    ["Neil McLay vs Declan Lowe", "Neil McLay", "Declan Lowe"],
    ["Neil McLay vs. Declan Lowe", "Neil McLay", "Declan Lowe"],
    ["Neil McLay VERSUS Declan Lowe", "Neil McLay", "Declan Lowe"],
    ["Neil McLay -v- Declan Lowe", "Neil McLay", "Declan Lowe"],
    ["Neil McLay V Declan Lowe", "Neil McLay", "Declan Lowe"],
  ])("reads %s", (line, red, blue) => {
    const bout = only(line);
    expect([bout.red.name, bout.blue.name]).toEqual([red, blue]);
  });

  /**
   * A gym ending in a lone V. `vs` is looked for before a bare `v` precisely so
   * this line does not lose half the red corner to the separator.
   */
  it("prefers the vs it can see to a v inside the red corner", () => {
    const bout = only("Neil McLay, Team V vs Declan Lowe, Crowning Glory");

    expect(bout.red).toEqual({ name: "Neil McLay", gym: "Team V" });
    expect(bout.blue).toEqual({ name: "Declan Lowe", gym: "Crowning Glory" });
  });

  it("does not find a separator inside a hyphenated name", () => {
    const bout = only("Jean-Vincent Boileau vs Declan Lowe");

    expect(bout.red.name).toBe("Jean-Vincent Boileau");
  });
});

describe("lines that are not bouts", () => {
  it("keeps an unreadable line with the number it was on", () => {
    const { bouts, problems } = parseSheet(
      ["Neil McLay v Declan Lowe", "TBC - opponent still to be confirmed", "Enes Oner v Cole Snee"].join("\n"),
    );

    expect(bouts).toHaveLength(2);
    expect(problems).toEqual([
      { line: 2, text: "TBC - opponent still to be confirmed", reason: "noCorners" },
    ]);
  });

  it("reports a separator with nothing on one side of it", () => {
    const { bouts, problems } = parseSheet("Declan Lowe vs");

    expect(bouts).toEqual([]);
    expect(problems).toEqual([{ line: 1, text: "Declan Lowe vs", reason: "emptyCorner" }]);
  });

  it("passes over a heading and the blank lines around it without complaint", () => {
    const { bouts, problems } = parseSheet("RUNNING ORDER\n\nNeil McLay v Declan Lowe\n\n");

    expect(problems).toEqual([]);
    expect(bouts.map((bout) => bout.line)).toEqual([3]);
  });

  it("strips the billing off a line that carries it, and leaves the bout", () => {
    const bout = only("MAIN EVENT: Neil McLay (Urban Guerrillas) v Declan Lowe - MMA 80kg");

    expect(bout.red.name).toBe("Neil McLay");
    expect(bout.weightKg).toBe(80);
  });

  it("takes nothing at all from an empty paste", () => {
    expect(parseSheet("")).toEqual({ bouts: [], problems: [] });
    expect(parseSheet("   \n\n\t\n")).toEqual({ bouts: [], problems: [] });
  });
});

describe("the six-bout card, as it was written down", () => {
  it("reads every line", () => {
    const { bouts, problems } = parseSheet(BUDO_SHEET);

    expect(problems).toEqual([]);
    expect(bouts).toHaveLength(6);
    expect(bouts.map((bout) => `${bout.red.name} v ${bout.blue.name}`)).toEqual([
      "Neil McLay v Declan Lowe",
      "McLay v Lowe",
      "Enes Oner v Cole Snee",
      "Rhona Kidd v Marta Nowak",
      "Aiden Roche v Kacper Zielinski",
      "Sam Threlfall v Owen Pryce",
    ]);
  });

  it("keeps the disciplines the card actually mixes", () => {
    const { bouts } = parseSheet(BUDO_SHEET);

    expect(bouts.map((bout) => bout.discipline)).toEqual([
      "MMA",
      "MMA",
      "K1",
      "MMA",
      "MUAY_THAI",
      "BOXING",
    ]);
    // Only the second line said nothing, and it is the only one carrying a
    // discipline nobody wrote down.
    expect(bouts.filter((bout) => bout.assumed.includes("discipline"))).toHaveLength(1);
  });

  it("keeps the catchweights and the grade written beside one of them", () => {
    const { bouts } = parseSheet(BUDO_SHEET);

    expect(bouts.map((bout) => bout.weightKg)).toEqual([80, 70, 63, 57, 66, 71]);
    expect(bouts[4]).toMatchObject({ classLabel: "C Class", rounds: 3, roundMinutes: 2 });
    expect(bouts[3].womens).toBe(true);
  });

  it("leaves the order alone, because which end the main event is on is a question", () => {
    const { bouts } = parseSheet(BUDO_SHEET);

    expect(bouts.map((bout) => bout.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("what a name is allowed to be", () => {
  it("drops the quotes a nickname arrives in without losing the name around it", () => {
    const bout = only('"Neil McLay" v Declan Lowe');
    expect(bout.red.name).toBe("Neil McLay");
  });

  it("collapses the spacing a copy and paste leaves behind", () => {
    const bout = only("  Neil   McLay   v   Declan  Lowe  ");
    expect(bout.red.name).toBe("Neil McLay");
    expect(bout.blue.name).toBe("Declan Lowe");
  });

  it("holds a name to the length the card stores", () => {
    const bout = only(`${"A".repeat(90)} v Declan Lowe`);
    expect(bout.red.name).toHaveLength(60);
  });

  it("refuses a corner that is a number rather than a person", () => {
    const { problems } = parseSheet("12 v 14");
    expect(problems).toHaveLength(1);
  });
});

describe("the rows the promoter sends back", () => {
  /**
   * The namesake question beside a corner was asked about the name as it stood
   * in the box. Stripping its full stop on the way in matched a different string
   * and refused the sheet as out of date with nothing on screen to change.
   */
  it("keeps a corrected name as it was typed, spacing aside", () => {
    const [row] = sanitiseRows([
      { red: { name: "  Jay  Smith Jr. ", gym: "Leith" }, blue: { name: "Dre Osei", gym: "" } },
    ]);
    expect(row.red.name).toBe("Jay Smith Jr.");
    expect(row.blue.name).toBe("Dre Osei");
  });
});
