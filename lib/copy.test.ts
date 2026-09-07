import { describe, expect, it } from "vitest";
import {
  EMPTY_CARD_EDITOR,
  EMPTY_DASHBOARD,
  EMPTY_PROGRAMME,
  RENDER_AGAIN,
  RENDER_SECTION,
  RENDER_STATE_COPY,
  boutCountLabel,
  chaseNote,
  programmeLinkNote,
  renderCountLabel,
  sponsorNote,
  sponsorTapNote,
  tableCardNote,
  tapeForEveryBout,
} from "@/lib/copy";

/**
 * A show can be published before its running order goes in, so every one of
 * these is a sentence a real promoter can reach on their first afternoon with
 * the product. The crash that used to happen there is fixed; what these cover is
 * the copy, which went on interpolating the count and told the reader there was
 * "a tale of the tape for all 0 bouts" and to tap one of them.
 *
 * The rule is that no zero-bout string may state a count of bouts or fighters,
 * and none of them may invite the reader to do something to a bout that is not
 * there.
 */

const EMPTY_STRINGS = [
  programmeLinkNote(0),
  tapeForEveryBout(0),
  chaseNote(0, 0),
  sponsorNote(0, 0),
  tableCardNote(0),
  sponsorTapNote(0),
  boutCountLabel(0),
  EMPTY_PROGRAMME.heading,
  EMPTY_PROGRAMME.body,
  EMPTY_PROGRAMME.promoter,
  EMPTY_DASHBOARD.heading,
  EMPTY_DASHBOARD.body,
  EMPTY_CARD_EDITOR,
  renderCountLabel(0, 0),
];

/**
 * The video panel. Rendering happens on somebody else's machine, on its own
 * schedule, and it sometimes does not work — all three ordinary, none of them
 * the promoter's doing. These are held to the same tone rules as everything
 * above, plus two of their own: nothing here promises when a video will be
 * ready, and nothing suggests that a bout in trouble has lost the video it
 * already had.
 */
const RENDER_STRINGS = [
  RENDER_SECTION.heading,
  RENDER_SECTION.body,
  RENDER_AGAIN,
  ...Object.values(RENDER_STATE_COPY).flatMap((state) => [state.label, state.note]),
];

describe("the zero-bout copy", () => {
  it("never counts nothing", () => {
    for (const line of EMPTY_STRINGS) {
      expect(line).not.toMatch(/\b0\b/);
      expect(line).not.toMatch(/\bno\s+0\b/i);
    }
  });

  it("never asks the reader to tap a bout that is not there", () => {
    for (const line of EMPTY_STRINGS) {
      expect(line.toLowerCase()).not.toContain("tap any bout");
    }
  });

  /** The same three rules the nudge message is held to. */
  it("keeps the established tone", () => {
    for (const line of EMPTY_STRINGS) {
      expect(line).not.toMatch(/\bpaper\b|\bprint(ed|s)? programme/i);
      expect(line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      // American spellings and exclamation marks both read as somebody else's product.
      expect(line).not.toMatch(/organiz|customiz|color\b|!/i);
    }
  });

  it("reads as a sentence, not as a placeholder", () => {
    for (const line of EMPTY_STRINGS) {
      expect(line.trim()).toBe(line);
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });
});

describe("boutCountLabel", () => {
  it("says what is there", () => {
    expect(boutCountLabel(15)).toBe("15 bouts");
    expect(boutCountLabel(1)).toBe("1 bout");
  });

  it("says there is nothing there rather than heading a running order 0 BOUTS", () => {
    expect(boutCountLabel(0)).toBe("No bouts yet");
    expect(boutCountLabel(-1)).toBe("No bouts yet");
  });
});

describe("programmeLinkNote", () => {
  it("invites the tap only where there is something to tap", () => {
    expect(programmeLinkNote(15)).toContain("Tap any bout");
    expect(programmeLinkNote(0)).toBe("The running order is not up yet.");
  });
});

describe("tapeForEveryBout", () => {
  it("counts the bouts on a card that has them", () => {
    expect(tapeForEveryBout(15)).toBe("a tale of the tape for all 15 bouts");
  });

  it("drops the count rather than promising nothing", () => {
    expect(tapeForEveryBout(0)).toBe("a tale of the tape for every bout on it");
  });
});

describe("chaseNote", () => {
  it("counts who is outstanding out of who is on the card", () => {
    expect(chaseNote(21, 30)).toContain("21 of the 30 fighters");
  });

  it("does not report nobody out of nobody", () => {
    expect(chaseNote(0, 0)).not.toMatch(/\d/);
    expect(chaseNote(0, 0)).toContain("no running order");
  });
});

describe("sponsorNote", () => {
  it("splits sold from unsold", () => {
    expect(sponsorNote(4, 15)).toBe("4 of the 15 bout slots sold, 11 still available");
  });

  it("describes the slot rather than counting it on an empty card", () => {
    expect(sponsorNote(0, 0)).toContain("ready to sell");
    expect(sponsorNote(0, 0)).not.toMatch(/\d/);
  });
});

describe("tableCardNote", () => {
  it("counts the bouts on the printed card where it can", () => {
    expect(tableCardNote(15)).toContain("All 15 bouts.");
  });

  /**
   * The card is printed today and read at the venue, so with no running order in
   * yet it promises the whole card rather than counting what is on it now.
   */
  it("promises the running order rather than counting it", () => {
    expect(tableCardNote(0)).toContain("The whole running order.");
    expect(tableCardNote(0)).toContain("tale of the tape");
  });
});

describe("sponsorTapNote", () => {
  it("agrees with itself about one sponsor and several", () => {
    expect(sponsorTapNote(1)).toBe("Across 1 sponsor");
    expect(sponsorTapNote(4)).toBe("Across 4 sponsors");
  });

  it("says nothing has been tapped rather than counting across none", () => {
    expect(sponsorTapNote(0)).toBe("No sponsor has been tapped yet");
  });
});

/**
 * `/f/demo` already handled this well — "Nothing to preview yet … has no bouts
 * on it yet, so there is no fighter to open the form as." The two empty states
 * added here are held to the same register: what the state is, and what fills
 * it.
 */
describe("the empty states", () => {
  it("says what would be there and what puts it there", () => {
    expect(EMPTY_PROGRAMME.body).toContain("running order");
    expect(EMPTY_PROGRAMME.body).toContain("tale of the tape");
    expect(EMPTY_DASHBOARD.body).toContain("running order");
    expect(EMPTY_DASHBOARD.body).toContain("invite link");
    expect(EMPTY_CARD_EDITOR).toContain("Add the first bout");
  });

  it("does not tell a spectator whose fault the empty card is", () => {
    expect(EMPTY_PROGRAMME.body).not.toMatch(/promoter|they have not|has not been/i);
  });
});

describe("the video panel", () => {
  it("keeps the established tone", () => {
    for (const line of RENDER_STRINGS) {
      expect(line).not.toMatch(/\bpaper\b|\bprint(ed|s)? programme/i);
      expect(line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      expect(line).not.toMatch(/organiz|customiz|color\b|!/i);
      expect(line.trim()).toBe(line);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  /**
   * Every state here is either a machine's schedule or a machine's failure, and
   * a promoter can do nothing about either. The one that would be easiest to get
   * wrong is the one where a render stopped: "your video failed" is a sentence
   * about somebody's fault, and it is not theirs.
   */
  it("never puts a machine's trouble on the promoter", () => {
    for (const line of RENDER_STRINGS) {
      expect(line).not.toMatch(/\byou(r)?\b/i);
      expect(line).not.toMatch(/error|broken|invalid|wrong/i);
    }
  });

  /** Nothing here can promise when a laptop or an hourly job will get to it. */
  it("does not promise when anything will be ready", () => {
    for (const line of RENDER_STRINGS) {
      expect(line).not.toMatch(/\bsoon\b|\bshortly\b|\bjust\b|\bquick(ly)?\b/i);
    }
  });

  /**
   * The thing a promoter most needs to know, and the reason the schema separates
   * the job from the video: a bout in trouble is still playing what it was
   * playing.
   */
  it("says the programme keeps the video it has", () => {
    expect(RENDER_STATE_COPY.failed.note).toMatch(/still there/i);
    expect(RENDER_STATE_COPY.stale.note).toMatch(/still plays/i);
    expect(RENDER_SECTION.body).toMatch(/stays there/i);
  });

  it("counts the videos that are of the card as it stands", () => {
    expect(renderCountLabel(4, 15)).toBe("4 of 15 up to date");
    expect(renderCountLabel(0, 0)).toBe("No bouts yet");
  });
});
