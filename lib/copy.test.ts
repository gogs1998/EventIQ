import { describe, expect, it } from "vitest";
import {
  ACTION_ERRORS,
  APP_ERROR,
  boutCountLabel,
  boutsOffLabel,
  chaseNote,
  EMPTY_CARD_EDITOR,
  EMPTY_DASHBOARD,
  EMPTY_PROGRAMME,
  fewerLossesEdge,
  NOT_FOUND,
  PAGE_ERROR,
  PROGRAMME_NOT_FOUND,
  programmeLinkNote,
  RENDER_AGAIN,
  RENDER_SECTION,
  RENDER_STATE_COPY,
  SHOW_NOT_FOUND,
  sponsorNote,
  sponsorTapNote,
  tableCardNote,
  tapeForEveryBout,
  winsEdge,
  renderCountLabel,
  WITHDRAWN,
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
];

const WITHDRAWN_STRINGS = Object.values(WITHDRAWN);

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
 * The record row's edge is read out with both fighters standing in the room, so
 * it says the size of the gap and nothing about the fighter on the other side of
 * it. The row only asks for one where there genuinely is one, so neither of
 * these is ever handed a nought.
 */
describe("the record edge", () => {
  it("agrees with itself about one and several", () => {
    expect(winsEdge(1)).toBe("+1 win");
    expect(winsEdge(7)).toBe("+7 wins");
    expect(fewerLossesEdge(1)).toBe("1 fewer loss");
    expect(fewerLossesEdge(2)).toBe("2 fewer losses");
  });

  it("states the gap without characterising the other fighter", () => {
    for (const line of [winsEdge(3), fewerLossesEdge(3)]) {
      expect(line).not.toMatch(/loser|worse|weak|only|just|!/i);
      expect(line).not.toMatch(/organiz|customiz|color\b/i);
      expect(line.trim()).toBe(line);
    }
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

/**
 * The error copy, held to the same rules and to two more.
 *
 * An error message is where "never shame a promoter or a fighter" is hardest to
 * keep, because the shortest way to say what happened is usually to say what
 * somebody did. It is also the copy nobody reads by eye: a promoter sees these
 * on a bad afternoon and a fighter sees them once, in a car park, and neither of
 * them is going to report that the wording was off.
 *
 * The gendered-pronoun rule is the same one the nudge message is held to
 * (HANDOVER bug 10). It caught "has already sent his" on a card with four
 * women's bouts, and an error message naming a fighter is exactly where it would
 * come back.
 */

const ERROR_STRINGS = [
  PAGE_ERROR.heading,
  PAGE_ERROR.body,
  PAGE_ERROR.retry,
  APP_ERROR.heading,
  APP_ERROR.body,
  APP_ERROR.retry,
  NOT_FOUND.heading,
  NOT_FOUND.body,
  NOT_FOUND.action,
  PROGRAMME_NOT_FOUND.heading,
  PROGRAMME_NOT_FOUND.body,
  SHOW_NOT_FOUND.heading,
  SHOW_NOT_FOUND.body,
  SHOW_NOT_FOUND.action,
  ...Object.values(ACTION_ERRORS),
];

describe("the error copy", () => {
  it("never uses a gendered pronoun", () => {
    for (const line of ERROR_STRINGS) {
      expect(line).not.toMatch(/\b(he|she|him|her|hers|his|himself|herself)\b/i);
    }
  });

  /**
   * Nothing here may hand the reader the blame. "You" is allowed — "you have
   * been signed out" is the plainest way to say it — but not attached to a
   * verdict on what they did.
   */
  it("never tells the reader whose fault it is", () => {
    for (const line of ERROR_STRINGS) {
      expect(line).not.toMatch(/\bfault\b|\bblame\b|\bsorry\b/i);
      expect(line).not.toMatch(/\byou (broke|failed|forgot|should)\b/i);
      expect(line).not.toMatch(/\binvalid\b|\billegal\b|\bincorrect\b|\bbad\b|\bmust not\b/i);
    }
  });

  /** The same three rules the nudge message and the zero-bout strings are held to. */
  it("keeps the established tone", () => {
    for (const line of ERROR_STRINGS) {
      expect(line).not.toMatch(/\bpaper\b|\bprint(ed|s)? programme/i);
      expect(line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      expect(line).not.toMatch(/organiz|customiz|color\b|!/i);
    }
  });

  /**
   * The underlying failure never reaches the screen. A promoter can do nothing
   * with "D1_ERROR", and naming a table or a binding on a page a spectator can
   * reach tells them about the inside of the application.
   */
  it("never names what actually broke", () => {
    for (const line of ERROR_STRINGS) {
      expect(line).not.toMatch(/D1|R2|SQL|sqlite|drizzle|token|cookie|binding|500|stack/i);
    }
  });

  it("reads as a sentence, not as a placeholder", () => {
    for (const line of ERROR_STRINGS) {
      expect(line.trim()).toBe(line);
      expect(line.length).toBeGreaterThan(4);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });
});

describe("the boundaries and the not-found pages", () => {
  it("say what to do next rather than only what happened", () => {
    expect(PAGE_ERROR.retry).toContain("Try again");
    expect(APP_ERROR.retry).toContain("Reload");
    expect(NOT_FOUND.action).toContain("Back");
    expect(SHOW_NOT_FOUND.action).toContain("Back");
  });

  /**
   * The programme's version has no way back, deliberately: a spectator holding a
   * link to an unpublished show has nowhere of ours to be sent, and sending them
   * to EventIQ's own pages from the promoter's programme is the branding rule in
   * lib/masthead.ts read backwards.
   */
  it("does not tell a spectator the promoter has done something wrong", () => {
    expect(PROGRAMME_NOT_FOUND.body).not.toMatch(/promoter has|they have not|has not been/i);
    expect(PROGRAMME_NOT_FOUND.body).toContain("not be published yet");
    expect(PROGRAMME_NOT_FOUND).not.toHaveProperty("action");
  });
});

describe("the action refusals", () => {
  /**
   * A show that is not this promoter's and one that does not exist answer with
   * the same sentence, so guessing another promoter's slug tells you nothing.
   * That property is in the action; this is the half of it that is copy.
   */
  it("says nothing about a show the promoter cannot see", () => {
    expect(ACTION_ERRORS.noSuchShow).not.toMatch(/another|someone else|belongs to|exist/i);
  });

  it("tells a signed-out promoter what to do about it", () => {
    expect(ACTION_ERRORS.signedOut).toContain("Sign in again");
  });

  /** The rule these exist to explain, said as a reason rather than as a refusal. */
  it("explains why a show name has to make an address", () => {
    expect(ACTION_ERRORS.showNameNeedsCharacters).toContain("because");
    expect(ACTION_ERRORS.showNameNeedsCharacters).toContain("address");
  });

  /** A fighter's typing is never in doubt, whatever the save did. */
  it("promises the fighter their answers are still there", () => {
    expect(ACTION_ERRORS.profileNotSaved).toContain("still on the page");
    expect(ACTION_ERRORS.profileNotSubmitted).toContain("still here");
    expect(ACTION_ERRORS.autosaveOffline).toContain("try again as you type");
  });
});

/**
 * The withdrawal copy.
 *
 * Withdrawals happen on every amateur card and none of them are the product's
 * business, so these lines are held to the same rules as everything else plus
 * one of their own: nothing here may read as a fault, and nothing may name or
 * characterise the fighter who came off. A promoter marking a bout off on the
 * morning of the show is doing the right thing, and the screen should not make
 * it feel like an admission.
 */
describe("the withdrawal copy", () => {
  it("keeps the established tone", () => {
    for (const line of WITHDRAWN_STRINGS) {
      expect(line).not.toMatch(/\bpaper\b|\bprint(ed|s)? programme/i);
      expect(line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      expect(line).not.toMatch(/organiz|customiz|color\b|!/i);
      expect(line.trim()).toBe(line);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  it("never uses a gendered pronoun or blames anybody", () => {
    for (const line of WITHDRAWN_STRINGS) {
      expect(line).not.toMatch(/\b(he|she|him|her|hers|his|himself|herself)\b/i);
      expect(line).not.toMatch(/\bfault\b|\bblame\b|\bsorry\b|\bcancelled\b/i);
      expect(line).not.toMatch(/pulled out|dropped out|no.show|let (you|us) down/i);
    }
  });

  /**
   * The reason a promoter would otherwise delete the bout, said out loud: the
   * sponsor placement was sold and the bout's figures are keyed on its number.
   */
  it("says what a withdrawal keeps", () => {
    expect(WITHDRAWN.editorNote).toContain("number");
    expect(WITHDRAWN.editorNote).toContain("sponsor");
    expect(WITHDRAWN.editorNote).toContain("can go back on");
  });

  /** The rest of the card is fine, and a spectator should be told that plainly. */
  it("tells a spectator the rest of the card is unchanged", () => {
    expect(WITHDRAWN.note).toContain("rest of the running order");
  });
});

describe("boutsOffLabel", () => {
  it("counts what has come off", () => {
    expect(boutsOffLabel(1)).toBe("1 off");
    expect(boutsOffLabel(3)).toBe("3 off");
  });

  /**
   * The zero-bout rule, in the one place it would be easiest to forget: most
   * cards lose nobody, and "0 off" on a card where nothing has happened is a
   * withdrawal on the promoter's screen that has not happened.
   */
  it("says nothing at all where nothing has come off", () => {
    expect(boutsOffLabel(0)).toBeNull();
    expect(boutsOffLabel(-1)).toBeNull();
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
