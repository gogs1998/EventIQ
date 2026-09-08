import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COPY,
  ACTION_ERRORS,
  APP_ERROR,
  boutCountLabel,
  boutsOffLabel,
  chaseNote,
  EMPTY_CARD_EDITOR,
  EMPTY_DASHBOARD,
  EMPTY_PROGRAMME,
  fewerLossesEdge,
  NO_SHOWCASE,
  NOT_FOUND,
  PAGE_ERROR,
  PROGRAMME_NOT_FOUND,
  RESET_COPY,
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
  RECORD_IMPORT,
  WITHDRAWN,
} from "@/lib/copy";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";

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
  NO_SHOWCASE.heading,
  NO_SHOWCASE.body,
  NO_SHOWCASE.action,
];

const WITHDRAWN_STRINGS = Object.values(WITHDRAWN);

const IMPORT_STRINGS = Object.values(RECORD_IMPORT);

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
 * The shop window with nothing in it. This stopped being a fresh-database
 * curiosity when the demo became one named show: an instance with SHOWCASE_SLUG
 * unset, or pointed at a show that is still a draft, has a pitch to make and no
 * card to open, and the pitch is still true without one.
 */
describe("the pitch with no showcase", () => {
  it("says what is missing and what would fill it", () => {
    expect(NO_SHOWCASE.body).toContain("SHOWCASE_SLUG");
    expect(NO_SHOWCASE.body).toContain("published show");
    expect(NO_SHOWCASE.action).toContain("sign in");
  });

  /**
   * It is read by whoever is standing the instance up, and there is no promoter
   * yet to have got anything wrong. It reports a state.
   */
  it("does not read as a fault", () => {
    for (const line of [NO_SHOWCASE.heading, NO_SHOWCASE.body, NO_SHOWCASE.action]) {
      expect(line).not.toMatch(/\bfault\b|\berror\b|\bmissing show\b|\bnobody has\b/i);
      expect(line).not.toMatch(/\b(he|she|him|her|his)\b/i);
    }
  });

  /** It replaces the card, not the argument, so it must not restate the pitch. */
  it("keeps to what it is for", () => {
    expect(NO_SHOWCASE.body.length).toBeLessThan(300);
    expect(NO_SHOWCASE.heading).not.toMatch(/EventIQ/);
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

/**
 * The card editor's record importer.
 *
 * This is the promoter filling in the fighters who never replied, which makes it
 * the copy most likely to slip into saying so. The rule the whole product keeps
 * is that a blank profile is a state and not a fault, and it applies to what is
 * said *about* a fighter as much as to what is said to one.
 */
describe("the record importer copy", () => {
  it("keeps the established tone", () => {
    for (const line of IMPORT_STRINGS) {
      expect(line).not.toMatch(/\bpaper\b|\bprint(ed|s)? programme/i);
      expect(line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      expect(line).not.toMatch(/organiz|customiz|color\b|!/i);
      expect(line.trim()).toBe(line);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  it("never says a fighter has not answered", () => {
    for (const line of IMPORT_STRINGS) {
      expect(line).not.toMatch(/\b(he|she|him|her|hers|his|himself|herself)\b/i);
      expect(line).not.toMatch(/ignor|never repl|has not sent|lazy|chase them/i);
    }
  });

  /**
   * The one thing it must not do is present an imported number as a fact.
   * Amateur records go stale, and a programme that misstates one in front of a
   * room that knows better is worse than one that says nothing.
   */
  it("says the numbers are the promoter's to confirm", () => {
    expect(RECORD_IMPORT.caution).toMatch(/out of date/i);
    expect(RECORD_IMPORT.caution).toMatch(/confirm/i);
    expect(RECORD_IMPORT.blurb).toMatch(/before anything is saved/i);
  });

  /** Anything a person typed wins, and the box says so before it is pressed. */
  it("promises to fill only what is empty", () => {
    expect(RECORD_IMPORT.blurb).toMatch(/only the boxes that are still empty/i);
    expect(RECORD_IMPORT.kept).toMatch(/already on the card/i);
  });

  /** A bad link is told what a good one looks like, never just that it failed. */
  it("shows what a working link looks like", () => {
    expect(RECORD_IMPORT.notAProfile).toContain("sherdog.com/fighter/");
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

/**
 * The account copy: changing a password, and setting one from a link an operator
 * minted. Held to every rule the error copy is held to, with one carve-out that
 * is written down rather than left as a gap.
 *
 * The carve-out is duration. Nothing else in the product may say how long
 * anything takes, because those were promises about a machine or about the
 * promoter's afternoon and none of them were ours to make. How long a reset link
 * lasts is different in kind: it is a fact about a credential the reader is
 * holding, and there is no other way for them to find it out.
 */

/** The only two lines allowed to name a duration, and the reason is above. */
const DURATION_ALLOWED = [RESET_COPY.life, RESET_COPY.deadBody];

const ACCOUNT_STRINGS = [...Object.values(ACCOUNT_COPY), ...Object.values(RESET_COPY)];

describe("the account copy", () => {
  it("never uses a gendered pronoun", () => {
    for (const line of ACCOUNT_STRINGS) {
      expect(line).not.toMatch(/(he|she|him|her|hers|his|himself|herself)/i);
    }
  });

  /**
   * Forgetting a password is not a lapse and a wrong one is a typo before it is
   * anything else. This is the copy where "never shame the promoter" is easiest
   * to drop, because the shortest way to say what happened is to say what they
   * did.
   */
  it("never tells the promoter whose fault it is", () => {
    for (const line of ACCOUNT_STRINGS) {
      expect(line).not.toMatch(/fault|blame|sorry/i);
      expect(line).not.toMatch(/you (broke|failed|forgot|should)/i);
      expect(line).not.toMatch(/invalid|illegal|incorrect|bad|must not/i);
      expect(line).not.toMatch(/weak|too simple|not strong/i);
    }
  });

  it("keeps the established tone", () => {
    for (const line of ACCOUNT_STRINGS) {
      expect(line).not.toMatch(/paper|print(ed|s)? programme/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      expect(line).not.toMatch(/organiz|customiz|color|!/i);
      expect(line.trim()).toBe(line);
      expect(line.length).toBeGreaterThan(4);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  it("states a duration only where it is a fact the reader needs", () => {
    for (const line of ACCOUNT_STRINGS) {
      if (DURATION_ALLOWED.includes(line)) continue;
      expect(line).not.toMatch(/(seconds?|minutes?|hours?)/i);
    }
    for (const line of DURATION_ALLOWED) expect(line).toContain("half an hour");
  });

  /** The same rule as the rest: what went wrong never names the inside of this. */
  it("never names what actually broke", () => {
    for (const line of ACCOUNT_STRINGS) {
      expect(line).not.toMatch(/D1|R2|SQL|sqlite|drizzle|token|cookie|binding|500|stack|hash/i);
    }
  });
});

describe("what the password rules say", () => {
  /**
   * A policy that says twelve and enforces ten is a refusal the promoter cannot
   * act on, and the two live in different files. This is the join.
   */
  it("agrees with the length the action enforces", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(ACCOUNT_COPY.hint).toContain("Twelve characters");
    expect(ACCOUNT_COPY.tooShort).toContain("twelve characters");
  });

  it("says length is all that is asked, rather than implying hidden rules", () => {
    expect(ACCOUNT_COPY.hint).toMatch(/nothing else is asked/i);
  });
});

describe("what changing a password says it does", () => {
  /**
   * The revocation is the reason the column exists, and a promoter who does not
   * know it happened will not understand why their phone is asking them to sign
   * in again. Both pages have to say so.
   */
  it("tells the promoter the other devices are signed out", () => {
    expect(ACCOUNT_COPY.body).toMatch(/signs out everywhere else/i);
    expect(ACCOUNT_COPY.changed).toMatch(/signed out/i);
    expect(RESET_COPY.body).toMatch(/signs out everywhere/i);
  });

  /** And that the browser they are standing in front of is not one of them. */
  it("says this browser stays signed in", () => {
    expect(ACCOUNT_COPY.body).toContain("This browser stays signed in");
  });

  /**
   * A link that expired and one somebody has already spent answer alike, because
   * the holder does the same thing about either: ask for another.
   */
  it("says what to do about a link that will not open", () => {
    expect(RESET_COPY.deadBody).toMatch(/make another|another/i);
    expect(RESET_COPY.deadBody).not.toMatch(/expired at|already used by/i);
  });
});
