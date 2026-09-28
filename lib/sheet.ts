import type { Discipline } from "@/lib/types";

/**
 * A matchmaking sheet, read as a running order.
 *
 * A promoter already has the card written down before they ever open this
 * product: a WhatsApp message, a column in a spreadsheet, the text under an
 * Instagram poster. Typing it again, a bout at a time, is the single dullest
 * thing the card editor asks anybody to do, and the owner did exactly that by
 * hand for a real six-bout card last week. This turns the paste into a preview.
 *
 * Two rules run through all of it.
 *
 * **It never invents a discipline, a weight or a format it did not read.** Where
 * a line says nothing, a default goes on the bout — the same defaults `addBout`
 * puts on a bout entered by hand, so the two paths agree — and the field is
 * named in `assumed` so the preview can say out loud that the value was not on
 * the sheet. A promoter who skims a preview full of confidently wrong weights
 * publishes a card with confidently wrong weights on it, and a bout at a weight
 * nobody agreed to is the one thing on here a matchmaker would be held to.
 *
 * **A line it cannot read is kept, not dropped.** Silence is not evidence, and a
 * parser that quietly bins the two lines it did not understand hands back a
 * fourteen-bout card that reads as complete. Every line either becomes a bout or
 * becomes a problem carrying its own text and its line number, and the preview
 * shows both.
 *
 * Nothing here reads a database or a request, which is what lets every shape a
 * real sheet arrives in be a test rather than a thing somebody tries once in a
 * browser.
 */

/** The defaults `addBout` already puts on a bout that arrives without them. */
export const SHEET_DEFAULTS = {
  discipline: "MMA",
  weightKg: 70,
  rounds: 3,
  roundMinutes: 3,
} as const;

/** A field that carries a default because the line said nothing about it. */
export type SheetAssumption = "discipline" | "weight" | "rounds";

export type SheetCorner = {
  name: string;
  /** Empty where the line gave none. `GYM_TO_CONFIRM` is the write's business. */
  gym: string;
};

export type SheetBout = {
  /** 1-based, counting every line in the paste including the blank ones. */
  line: number;
  red: SheetCorner;
  blue: SheetCorner;
  discipline: Discipline;
  weightKg: number;
  classLabel: string;
  womens: boolean;
  rounds: number;
  roundMinutes: number;
  /** What was defaulted rather than read. Never a guess presented as a fact. */
  assumed: SheetAssumption[];
};

/**
 * Why a line did not become a bout. The sentence shown is in lib/copy.ts; what
 * is recorded here is which of the two things went wrong, so the copy can be
 * held to the tone rules in one place.
 */
export type SheetProblemReason =
  /** Nothing on the line reads as two corners. A heading, a note, a stray line. */
  | "noCorners"
  /** A separator with nothing on one side of it: "Lowe vs", "vs McLay". */
  | "emptyCorner";

export type SheetProblem = { line: number; text: string; reason: SheetProblemReason };

export type Sheet = { bouts: SheetBout[]; problems: SheetProblem[] };

/** How long a name and a gym may be, matching what `addBout` stores. */
const NAME_MAX = 60;
const GRADE_MAX = 30;

/**
 * The separator, in the shapes sheets actually write it, longest first.
 *
 * `vs` and `versus` are tried before a bare `v` for one reason: a gym called
 * "Team V" sitting at the end of the red corner would otherwise be read as the
 * separator and take half the fighter's line with it. Hyphens are in the
 * character class because `-v-` is written that way on posters.
 */
const VERSUS_LONG = /(?:[\s\-–—]+|^)(?:vs|versus)\.?(?:[\s\-–—]+|$)/i;
const VERSUS_SHORT = /[\s\-–—]+v\.?[\s\-–—]+/i;

/** A bout number at the head of the line, with or without its punctuation. */
const LEAD_NUMBER = /^\s*(?:bout\s*)?\d{1,2}\s*[.):\-–—]?[ \t]+/i;

/**
 * Where the card is called rather than matched. Stripped so the line underneath
 * still parses; which bout is the main event is decided by the order toggle in
 * the preview, not by a word on a line, because plenty of sheets carry neither.
 */
const BILLING_LABEL = /^\s*(?:co[-\s]?main(?:\s*event)?|main\s*event)\s*[:\-–—]?\s*/i;

/**
 * Lines that are structure rather than a bout. Kept deliberately short: anything
 * not on this list that cannot be read becomes a problem the promoter sees,
 * which is the safe direction to be wrong in.
 */
const HEADING =
  /^(?:running\s*order|fight\s*card|the\s*card|card|bouts?|fights?|amateur|professional|main\s*card|prelims?|undercard)\s*[:\-–—]?\s*$/i;

/** Column names off a spreadsheet's first row, which are not a bout either. */
const HEADER_WORD =
  /^(?:no\.?|#|num(?:ber)?|bout|fight|red(?:\s*corner)?|blue(?:\s*corner)?|corner|fighter\s*[ab12]?|opponent|name|gym|club|team|discipline|sport|style|weight(?:\s*\(?kg\)?)?|kg|class|grade|rounds?|format|time|notes?)$/i;

const DISCIPLINE_WORDS: Record<string, Discipline> = {
  mma: "MMA",
  "m.m.a": "MMA",
  cage: "MMA",
  boxing: "BOXING",
  box: "BOXING",
  boxe: "BOXING",
  "muay thai": "MUAY_THAI",
  muaythai: "MUAY_THAI",
  thai: "MUAY_THAI",
  mt: "MUAY_THAI",
  k1: "K1",
  "k-1": "K1",
  kickboxing: "K1",
  kickbox: "K1",
  grappling: "GRAPPLING",
  grapple: "GRAPPLING",
  bjj: "GRAPPLING",
  "no-gi": "GRAPPLING",
  nogi: "GRAPPLING",
  submission: "GRAPPLING",
};

/**
 * Grades as promoters write them, whole-cell only.
 *
 * Whole-cell matters more here than anywhere else in this file. "C CLASS" is a
 * grade and "Dundee MMA" is a gym that happens to contain the name of a
 * discipline, and the only thing telling them apart is that one is the entire
 * cell and the other is a word inside one.
 */
const GRADE =
  /^(?:[a-e]\s*[-\s]?\s*class|class\s*[a-e]|amateur|semi[-\s]?pro(?:fessional)?|professional|pro|novice|open|elite|junior|senior|masters?|interim|title)$/i;

const WOMENS = /^(?:women'?s?|female|ladies|w)$/i;

/** `80kg`, `80 kg`, `80.5kg`, or a bare number inside a plausible fighting weight. */
const WEIGHT = /^(\d{2,3}(?:\.\d)?)\s*(kgs?|k)?$/i;
const WEIGHT_MIN_KG = 30;
const WEIGHT_MAX_KG = 200;

/** `3x3`, `3 x 3`, `3x3mins`, `3 X 2 min`. */
const ROUNDS_BY_MINUTES = /^(\d)\s*[x×]\s*(\d)\s*(?:min(?:ute)?s?)?$/i;
/** `3 rounds`, `5 rds`. Minutes stay defaulted, and say so. */
const ROUNDS_ONLY = /^(\d)\s*(?:rounds?|rds?)$/i;

type Attributes = {
  discipline?: Discipline;
  weightKg?: number;
  rounds?: number;
  roundMinutes?: number;
  classLabel?: string;
  womens?: boolean;
};

/**
 * One cell read as something other than a name or a gym, or null where it is
 * neither and therefore falls through to being the gym.
 *
 * A cell that is several attributes with spaces between them — "MMA 80kg 3x3",
 * the tail a poster caption puts after a dash — is only taken that way when
 * *every* word in it is accounted for. One unreadable word and the whole cell is
 * a gym again, which is what keeps "Dundee MMA" out of the discipline column.
 *
 * The scan takes two words before one, because half of what is written in that
 * tail is two words long — "Muay Thai", "C Class", "5 rounds" — and a scan that
 * only ever looked at single words would fail the cell on the first of them and
 * file the whole grading under gym.
 */
function readAttributes(cell: string): Attributes | null {
  const single = readOneAttribute(cell);
  if (single) return single;

  const words = cell.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  const merged: Attributes = {};
  for (let at = 0; at < words.length;) {
    const pair = at + 1 < words.length ? readOneAttribute(`${words[at]} ${words[at + 1]}`) : null;
    if (pair) {
      Object.assign(merged, pair);
      at += 2;
      continue;
    }
    const one = readOneAttribute(words[at]);
    if (!one) return null;
    Object.assign(merged, one);
    at += 1;
  }
  return merged;
}

function readOneAttribute(cell: string): Attributes | null {
  const text = cell.trim();
  if (!text) return null;

  const discipline = DISCIPLINE_WORDS[text.toLowerCase()];
  if (discipline) return { discipline };

  if (WOMENS.test(text)) return { womens: true };
  if (GRADE.test(text)) return { classLabel: text.slice(0, GRADE_MAX) };

  const format = ROUNDS_BY_MINUTES.exec(text);
  if (format) return { rounds: Number(format[1]), roundMinutes: Number(format[2]) };

  const rounds = ROUNDS_ONLY.exec(text);
  if (rounds) return { rounds: Number(rounds[1]) };

  const weight = WEIGHT.exec(text);
  if (weight) {
    // A bare number is only a weight inside a range a person could fight at.
    // Without that, the `3` of a three-round bout typed in its own column would
    // put a bout on the card at three kilos.
    const kg = Math.round(Number(weight[1]) * 10) / 10;
    if (kg >= WEIGHT_MIN_KG && kg <= WEIGHT_MAX_KG) return { weightKg: kg };
  }

  return null;
}

/** Trimmed, inner whitespace collapsed, and short enough for the column. */
function tidy(value: string, max: number): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’\s]+|["'“”‘’\s.,;:\-–—]+$/g, "")
    .trim()
    .slice(0, max);
}

/** A name has to have a letter in it; a run of digits is a column, not a person. */
function isName(value: string): boolean {
  return /\p{L}/u.test(value);
}

/** `Name (Gym)`, which is how a poster caption writes it. */
function takeBracketedGym(side: string): { rest: string; gym: string | null } {
  const bracketed = /\(([^)]{1,60})\)/.exec(side);
  if (!bracketed) return { rest: side, gym: null };
  return {
    rest: `${side.slice(0, bracketed.index)} ${side.slice(bracketed.index + bracketed[0].length)}`,
    gym: tidy(bracketed[1], NAME_MAX),
  };
}

/**
 * One side of the separator, broken into cells.
 *
 * Tabs win where there are any, because a spreadsheet paste puts a gym with a
 * comma in it inside one cell and splitting on the comma would cut it in half.
 * Everything is then split again on a spaced dash, which is the separator a
 * poster caption uses between the names and the grading.
 */
function cellsOf(side: string, tabbed: boolean): string[] {
  return (tabbed ? side.split("\t") : side.split(","))
    .flatMap((cell) => cell.split(/\s+[-–—]\s+/))
    .map((cell) => cell.trim())
    .filter(Boolean);
}

type Side = { corner: SheetCorner; attributes: Attributes };

function readSide(side: string, tabbed: boolean): Side | null {
  const { rest, gym: bracketed } = takeBracketedGym(side);
  const cells = cellsOf(rest, tabbed);
  if (!cells.length) return null;

  const name = tidy(cells[0], NAME_MAX);
  if (!isName(name)) return null;

  const attributes: Attributes = {};
  let gym = bracketed ?? "";
  for (const cell of cells.slice(1)) {
    const read = readAttributes(cell);
    if (read) {
      Object.assign(attributes, read);
      continue;
    }
    // The first cell that is nothing else is the gym. Anything after it is
    // dropped rather than guessed at — a sheet with a coach and a hometown in
    // it has no column here to put them in, and the promoter can see both in
    // the line the preview shows beside the row.
    if (!gym) gym = tidy(cell, NAME_MAX);
  }

  return { corner: { name, gym }, attributes };
}

/**
 * A spreadsheet whose columns carry the two names without a `v` between them.
 *
 * Only ever tried on a tabbed line. On a line of prose the same heuristic would
 * read "Neil McLay Urban Guerrillas" as two fighters, and a bout invented out of
 * one man is worse than a line the promoter is asked about.
 */
function readColumns(
  cells: string[],
): { red: SheetCorner; blue: SheetCorner; attributes: Attributes } | null {
  const attributes: Attributes = {};
  const rest: string[] = [];
  for (const cell of cells) {
    const read = readAttributes(cell);
    if (read) Object.assign(attributes, read);
    else rest.push(cell);
  }

  const named = rest.map((cell) => tidy(cell, NAME_MAX)).filter(isName);
  if (named.length >= 4) {
    return {
      red: { name: named[0], gym: named[1] },
      blue: { name: named[2], gym: named[3] },
      attributes,
    };
  }
  if (named.length === 2) {
    return { red: { name: named[0], gym: "" }, blue: { name: named[1], gym: "" }, attributes };
  }
  // Three is genuinely ambiguous — a gym belonging to one corner or the other —
  // and guessing gets a gym printed against the wrong fighter on the programme.
  return null;
}

function boutFrom(line: number, red: SheetCorner, blue: SheetCorner, read: Attributes): SheetBout {
  const assumed: SheetAssumption[] = [];
  if (read.discipline === undefined) assumed.push("discipline");
  if (read.weightKg === undefined) assumed.push("weight");
  if (read.rounds === undefined && read.roundMinutes === undefined) assumed.push("rounds");

  return {
    line,
    red,
    blue,
    discipline: read.discipline ?? SHEET_DEFAULTS.discipline,
    weightKg: read.weightKg ?? SHEET_DEFAULTS.weightKg,
    classLabel: read.classLabel ?? "",
    womens: read.womens ?? false,
    rounds: read.rounds ?? SHEET_DEFAULTS.rounds,
    roundMinutes: read.roundMinutes ?? SHEET_DEFAULTS.roundMinutes,
    assumed,
  };
}

/** Whether a line is a spreadsheet's column headings rather than a bout. */
function isHeaderRow(cells: string[]): boolean {
  return cells.length >= 2 && cells.every((cell) => HEADER_WORD.test(cell.trim()));
}

/**
 * The paste, read as a running order.
 *
 * Order is kept exactly as it arrived and every bout carries the line it came
 * from. Which end of the sheet the main event is on is not decided here: sheets
 * are written both ways round and nothing in the text reliably says which, so it
 * is a question the preview asks and the import answers.
 */
export function parseSheet(text: string): Sheet {
  const bouts: SheetBout[] = [];
  const problems: SheetProblem[] = [];

  const lines = text.split(/\r\n|\r|\n/);
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (HEADING.test(trimmed)) continue;

    const tabbed = raw.includes("\t");
    const stripped = raw.replace(LEAD_NUMBER, "").replace(BILLING_LABEL, "");
    if (!stripped.trim()) continue;

    if (tabbed && isHeaderRow(cellsOf(stripped, true))) continue;

    const separator = VERSUS_LONG.exec(stripped) ?? VERSUS_SHORT.exec(stripped);
    if (!separator) {
      const columns = tabbed ? readColumns(cellsOf(stripped, true)) : null;
      if (columns) {
        bouts.push(boutFrom(line, columns.red, columns.blue, columns.attributes));
        continue;
      }
      problems.push({ line, text: trimmed, reason: "noCorners" });
      continue;
    }

    const red = readSide(stripped.slice(0, separator.index), tabbed);
    const blue = readSide(stripped.slice(separator.index + separator[0].length), tabbed);
    if (!red || !blue) {
      problems.push({ line, text: trimmed, reason: "emptyCorner" });
      continue;
    }

    bouts.push(boutFrom(line, red.corner, blue.corner, { ...red.attributes, ...blue.attributes }));
  }

  return { bouts, problems };
}

/* -------------------------------------------------------------------------
 * The preview coming back
 *
 * What the promoter presses "add" on is not what `parseSheet` produced: every
 * field on the preview is editable, and the interesting ones get edited. So the
 * rows arrive back as typing rather than as a parse, and are read here the same
 * way the fighter's draft is read in lib/questionnaire.ts — as `unknown` that
 * has to be talked into a shape, never as a payload to be trusted because a form
 * of ours drew it.
 * ---------------------------------------------------------------------- */

/** More bouts than one paste takes. A full amateur card is fifteen; this is slack. */
export const MAX_SHEET_BOUTS = 30;

/** Enough for a full card written long-hand, and short of a paste that is a file. */
export const MAX_SHEET_LENGTH = 20_000;

const ROUNDS_MAX = 12;
const ROUND_MINUTES_MAX = 15;

/** One corner as the preview sends it back: what was typed, and what was answered. */
export type SheetRowCorner = {
  name: string;
  gym: string;
  /** A fighter id, `NEW_FIGHTER`, or empty. Checked against the names again server-side. */
  match: string;
};

export type SheetRow = {
  red: SheetRowCorner;
  blue: SheetRowCorner;
  discipline: Discipline;
  weightKg: number;
  classLabel: string;
  womens: boolean;
  rounds: number;
  roundMinutes: number;
};

const DISCIPLINES: readonly Discipline[] = ["MMA", "MUAY_THAI", "BOXING", "K1", "GRAPPLING"];

function string(value: unknown, max: number): string {
  return typeof value === "string" ? tidy(value, max) : "";
}

function whole(value: unknown, fallback: number, max: number): number {
  const n = Math.round(
    Number(typeof value === "string" || typeof value === "number" ? value : NaN),
  );
  if (!Number.isFinite(n) || n < 1 || n > max) return fallback;
  return n;
}

function corner(value: unknown): SheetRowCorner {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    name: string(row.name, NAME_MAX),
    gym: string(row.gym, NAME_MAX),
    // Not tidied like a name: it is an id or a sentinel, and anything else is
    // stale by the time `resolveCorner` sees it, which is the point.
    match: typeof row.match === "string" ? row.match.slice(0, 80).trim() : "",
  };
}

/**
 * The corrected rows, read into the shape the write uses.
 *
 * Nothing here refuses: a weight nobody could fight at or a discipline that is
 * not one of ours becomes the default rather than an error, because these are
 * the boxes a promoter is typing in and a half-typed number is an ordinary thing
 * to find in one. What refuses is the action, and only about the things that
 * cannot be defaulted — a corner with no name, and a match nobody answered.
 */
export function sanitiseRows(input: unknown): SheetRow[] {
  if (!Array.isArray(input)) return [];

  return input.slice(0, MAX_SHEET_BOUTS + 1).map((value) => {
    const row = (value ?? {}) as Record<string, unknown>;
    const discipline = DISCIPLINES.find((known) => known === row.discipline);
    const weight = Math.round(Number(row.weightKg) * 10) / 10;

    return {
      red: corner(row.red),
      blue: corner(row.blue),
      discipline: discipline ?? SHEET_DEFAULTS.discipline,
      weightKg:
        Number.isFinite(weight) && weight >= WEIGHT_MIN_KG && weight <= WEIGHT_MAX_KG
          ? weight
          : SHEET_DEFAULTS.weightKg,
      classLabel: string(row.classLabel, GRADE_MAX),
      womens: row.womens === true,
      rounds: whole(row.rounds, SHEET_DEFAULTS.rounds, ROUNDS_MAX),
      roundMinutes: whole(row.roundMinutes, SHEET_DEFAULTS.roundMinutes, ROUND_MINUTES_MAX),
    };
  });
}
