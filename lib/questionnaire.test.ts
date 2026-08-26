import { describe, expect, it } from "vitest";
import {
  allowedSponsorIds,
  draftFromFighter,
  fighterFromDraft,
  EMPTY_DRAFT,
  sanitiseDraft,
} from "@/lib/questionnaire";
import { isDebut } from "@/lib/tape";
import type { Fighter } from "@/lib/types";

const base: Fighter = { id: "f1", name: "Owen Pryce", gym: "Bryn Athletic" };

describe("fighterFromDraft", () => {
  it("leaves an untouched form with no record at all", () => {
    const fighter = fighterFromDraft(base, EMPTY_DRAFT);
    expect(fighter.record).toBeUndefined();
    // The bug this guards: a blank form defaulting to 0-0-0 would announce every
    // fighter who never replied as making their debut.
    expect(isDebut(fighter)).toBe(false);
  });

  it("treats an explicit nought as a debut", () => {
    const fighter = fighterFromDraft(base, { ...EMPTY_DRAFT, w: "0", l: "0", d: "0" });
    expect(fighter.record).toEqual({ w: 0, l: 0, d: 0 });
    expect(isDebut(fighter)).toBe(true);
  });

  it("fills the other two boxes when only one is answered", () => {
    expect(fighterFromDraft(base, { ...EMPTY_DRAFT, w: "3" }).record).toEqual({ w: 3, l: 0, d: 0 });
  });

  it("strips the at sign off an Instagram handle", () => {
    expect(fighterFromDraft(base, { ...EMPTY_DRAFT, instagram: "@owen" }).instagram).toBe("owen");
  });
});

describe("draftFromFighter", () => {
  it("gives a returning fighter their details back rather than a blank form", () => {
    const returning: Fighter = {
      ...base,
      nickname: "The Welsh Dragon",
      record: { w: 2, l: 1, d: 0 },
      heightCm: 174,
      styleTags: ["Boxing"],
    };

    const draft = draftFromFighter(returning);
    expect(draft.nickname).toBe("The Welsh Dragon");
    expect(draft.w).toBe("2");
    expect(draft.heightCm).toBe("174");
    expect(draft.styleTags).toEqual(["Boxing"]);
  });

  it("round trips without inventing a record for someone who has none", () => {
    expect(fighterFromDraft(base, draftFromFighter(base)).record).toBeUndefined();
  });
});

describe("sanitiseDraft", () => {
  it("refuses a photo path we did not write", () => {
    expect(sanitiseDraft({ photo: "https://example.com/anything.jpg" }).photo).toBeUndefined();
    expect(sanitiseDraft({ photo: "/media/fighters/f1-abc.jpg" }).photo).toBe(
      "/media/fighters/f1-abc.jpg",
    );
  });

  it("drops a number outside anything a person could be", () => {
    expect(sanitiseDraft({ heightCm: "900" }).heightCm).toBe("");
    expect(sanitiseDraft({ age: "-3" }).age).toBe("");
    expect(sanitiseDraft({ heightCm: "174" }).heightCm).toBe("174");
  });

  it("caps the story rather than rejecting it, because losing what they wrote is worse", () => {
    expect(sanitiseDraft({ bio: "x".repeat(5000) }).bio.length).toBe(600);
  });

  it("only accepts style tags from the list and never more than three", () => {
    const draft = sanitiseDraft({ styleTags: ["Boxing", "Nonsense", "Judo", "Wrestling", "Pressure"] });
    expect(draft.styleTags).toEqual(["Boxing", "Judo", "Wrestling"]);
  });

  it("only accepts a stance we offer", () => {
    expect(sanitiseDraft({ stance: "Sideways" }).stance).toBe("");
    expect(sanitiseDraft({ stance: "Southpaw" }).stance).toBe("Southpaw");
  });

  it("copes with a body that is not a draft at all", () => {
    expect(sanitiseDraft(null).nickname).toBe("");
    expect(sanitiseDraft({ styleTags: "Boxing" }).styleTags).toEqual([]);
  });
});

/**
 * sanitiseDraft has no idea which sponsors exist, so a sponsor id it lets
 * through used to reach the join table and be refused there by the foreign key —
 * after the fighter's real sponsors had already been deleted. The check moved in
 * front of the write, and the write became one transaction.
 */
describe("allowedSponsorIds", () => {
  const book = ["sp_mouthguards", "sp_fightiq", "sp_eventiq"];

  it("keeps the order the fighter picked them in, because the order was sold", () => {
    expect(allowedSponsorIds(["sp_eventiq", "sp_mouthguards"], book)).toEqual([
      "sp_eventiq",
      "sp_mouthguards",
    ]);
  });

  it("drops a sponsor that is not in this promoter's book", () => {
    expect(allowedSponsorIds(["sp_mouthguards", "sp_somebody-elses"], book)).toEqual([
      "sp_mouthguards",
    ]);
    expect(allowedSponsorIds(["sp_nothing"], book)).toEqual([]);
  });

  it("drops a repeat, which the join table's key would refuse", () => {
    expect(allowedSponsorIds(["sp_fightiq", "sp_fightiq"], book)).toEqual(["sp_fightiq"]);
  });

  it("has nothing to allow where there is no book yet", () => {
    expect(allowedSponsorIds(["sp_fightiq"], [])).toEqual([]);
  });
});
