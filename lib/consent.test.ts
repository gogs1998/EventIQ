import { describe, expect, it } from "vitest";
import {
  CONSENT_STRINGS,
  CONSENT_TEXT,
  CONSENT_VERSION,
  MINIMUM_AGE,
  RETENTION_DAYS,
  clearedFighterColumns,
  consentGate,
  flagOn,
  hasConsented,
  oldEnough,
} from "@/lib/consent";
import { EMPTY_DRAFT } from "@/lib/questionnaire";

/**
 * The questionnaire publishes photographs, ages and hometowns of real amateur
 * fighters and sells sponsorship beside them. What may be written before the box
 * is ticked is therefore not a UI decision, and none of it is checked by eye:
 * the gate is here, the wording is here, and both are held to the same rules the
 * rest of the product's copy is.
 */

const draft = (over: Partial<typeof EMPTY_DRAFT> = {}) => ({ ...EMPTY_DRAFT, ...over });

describe("consentGate", () => {
  it("writes nothing at all before the box is ticked", () => {
    expect(consentGate({}, draft({ age: "24", bio: "Two years at Bryn." }))).toBe("refuse");
  });

  it("writes the consent on its own when the tick arrives", () => {
    expect(consentGate({}, draft({ consented: true, age: "24" }))).toBe("record");
  });

  it("writes the draft once the invite carries a consent", () => {
    expect(consentGate({ consentedAt: 1 }, draft({ age: "24" }))).toBe("allow");
  });

  /**
   * The order is the point. A tick from somebody too young to give it is not a
   * consent, and a gate that stored the age first and refused afterwards would
   * have kept the one field it should never have taken.
   */
  it("refuses a fighter under the minimum age, tick or no tick", () => {
    for (const record of [{}, { consentedAt: 1 }]) {
      expect(consentGate(record, draft({ age: "17", consented: true }))).toBe("under-age");
      expect(consentGate(record, draft({ age: "17" }))).toBe("under-age");
    }
  });

  it("lets a fighter exactly at the minimum through", () => {
    expect(consentGate({ consentedAt: 1 }, draft({ age: String(MINIMUM_AGE) }))).toBe("allow");
  });

  /** Silence is not evidence, here as everywhere else in this codebase. */
  it("does not read a blank age as too young", () => {
    expect(consentGate({ consentedAt: 1 }, draft({ age: "" }))).toBe("allow");
    expect(consentGate({}, draft({ age: "" }))).toBe("refuse");
    expect(oldEnough(undefined)).toBeUndefined();
  });

  it("treats a withdrawn consent as no consent", () => {
    expect(hasConsented({ consentedAt: 1, revokedAt: 2 })).toBe(false);
    expect(consentGate({ consentedAt: 1, revokedAt: 2 }, draft({ age: "24" }))).toBe("refuse");
  });
});

describe("the consent wording", () => {
  it("carries a version that can be quoted back", () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * The four things a fighter has to be told before they tick anything: what is
   * taken, everywhere it is shown, how long it is kept, and how to take it back.
   * A notice missing one of them is the notice this whole piece of work exists to
   * replace.
   */
  it("says what is collected, where it goes, for how long and how to stop it", () => {
    const all = CONSENT_STRINGS.join(" ").toLowerCase();
    expect(all).toContain("photograph");
    expect(all).toContain("programme");
    expect(all).toContain("video");
    expect(all).toContain("dashboard");
    expect(all).toContain("sponsors");
    expect(all).toContain(`${RETENTION_DAYS} days`);
    expect(all).toContain("remove my details");
  });

  it("puts the agreement itself beside the tick", () => {
    expect(CONSENT_TEXT.tick.toLowerCase()).toContain("i agree");
    expect(CONSENT_TEXT.tick.toLowerCase()).toContain("photograph");
  });

  /** The same rules the rest of the product's copy is held to. */
  it("keeps the established tone", () => {
    for (const line of CONSENT_STRINGS) {
      expect(line).not.toMatch(/\b(he|she|him|her|hers|his|himself|herself)\b/i);
      expect(line).not.toMatch(/\bfault\b|\bblame\b|\bsorry\b/i);
      expect(line).not.toMatch(/you haven'?t|hasn'?t|you have not|failed|should have/i);
      expect(line).not.toMatch(/organiz|customiz|color\b|!/i);
      expect(line).not.toMatch(/\b(seconds?|minutes?|hours?)\b/i);
      expect(line.trim()).toBe(line);
      expect(line).not.toMatch(/undefined|NaN|TODO/);
    }
  });

  /**
   * A notice that says it has been checked by a lawyer when it has not is worse
   * than no notice, and it is the easiest sentence in the world to add later.
   */
  it("claims no legal review and no guarantee", () => {
    for (const line of CONSENT_STRINGS) {
      expect(line).not.toMatch(/lawyer|solicitor|legally|guarantee|compliant|GDPR/i);
    }
  });
});

describe("clearedFighterColumns", () => {
  it("clears every field the questionnaire collects", () => {
    const cleared = clearedFighterColumns(1000);
    for (const column of [
      "nickname",
      "hometown",
      "age",
      "heightCm",
      "reachCm",
      "stance",
      "photo",
      "cutout",
      "stylised",
      "instagram",
      "recordW",
      "recordL",
      "recordD",
      "finishKo",
      "finishSub",
      "walkoutTitle",
      "walkoutArtist",
      "bio",
      "styleTags",
    ]) {
      expect(cleared).toHaveProperty(column, null);
    }
  });

  /**
   * The name and the gym are the promoter's running order, not the fighter's
   * answers. Clearing them would leave a gap on a published card where somebody
   * is still walking out, and the removal copy says so rather than promising
   * everything and quietly keeping two fields.
   */
  it("leaves the running order alone", () => {
    const cleared: Record<string, unknown> = { ...clearedFighterColumns(1000) };
    expect(cleared).not.toHaveProperty("name");
    expect(cleared).not.toHaveProperty("gym");
  });

  it("moves updatedAt, so the bout's video is stale the moment it runs", () => {
    expect(clearedFighterColumns(1000).updatedAt).toBe(1000);
  });
});

describe("flagOn", () => {
  it("is off unless somebody said otherwise", () => {
    for (const value of [undefined, null, "", " ", "off", "no", "false", "0", "maybe"]) {
      expect(flagOn(value)).toBe(false);
    }
  });

  it("accepts the shapes an operator actually writes", () => {
    for (const value of ["1", "on", "true", "yes", "ON", " True "]) {
      expect(flagOn(value)).toBe(true);
    }
  });
});
