import { describe, expect, it } from "vitest";
import { fighters } from "@/data/event";
import {
  DONE_AT,
  boutReadiness,
  chaseList,
  daysUntilShow,
  eventProgress,
  inviteFor,
  nudgeMessage,
  sponsorInventory,
} from "@/lib/promoter";

describe("daysUntilShow", () => {
  it("puts the demo two weeks out, which is when this matters", () => {
    expect(daysUntilShow()).toBe(14);
  });
});

describe("chaseList", () => {
  const rows = chaseList();

  it("only lists fighters who are not finished", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.score < DONE_AT)).toBe(true);
  });

  it("leads with the top of the card, because a hole there costs most", () => {
    const numbers = rows.map((row) => row.bout.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  });

  it("gives every row the opponent, so the promoter can see the mismatch", () => {
    for (const row of rows) {
      expect(row.opponent.id).not.toBe(row.fighter.id);
    }
  });
});

describe("inviteFor", () => {
  it("does not read a promoter-supplied record as the fighter opening the link", () => {
    // Dominic Rees has a record and nothing else. That came off the entry form.
    expect(inviteFor(fighters["dominic-rees"]).status).toBe("sent");
    expect(inviteFor(fighters["dominic-rees"]).lastOpenedAt).toBeUndefined();
  });

  it("reads a field only the fighter could have given as them opening it", () => {
    // Haider Ali's Instagram handle is not on anybody's entry form.
    expect(inviteFor(fighters["haider-ali"]).status).toBe("opened");
  });

  it("marks a finished profile submitted", () => {
    expect(inviteFor(fighters["callum-reeves"]).status).toBe("submitted");
  });

  it("keeps the promoter's own overrides", () => {
    expect(inviteFor(fighters["sam-whitlock"]).status).toBe("not-sent");
    expect(inviteFor(fighters["chloe-baines"]).status).toBe("opened");
  });

  it("leaves most of an untouched undercard unopened, or the list means nothing", () => {
    const statuses = chaseList().map((row) => inviteFor(row.fighter).status);
    expect(statuses.filter((s) => s === "sent").length).toBeGreaterThan(
      statuses.filter((s) => s === "opened").length,
    );
  });
});

describe("eventProgress", () => {
  it("counts both corners of every bout", () => {
    const { total } = eventProgress();
    expect(total).toBe(30);
  });

  it("reports a partly finished card rather than a finished one", () => {
    const { percent, done, total } = eventProgress();
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(total);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
  });
});

describe("boutReadiness", () => {
  const bouts = boutReadiness();

  it("covers every bout, main event first", () => {
    expect(bouts).toHaveLength(15);
    expect(bouts[0].bout.number).toBe(15);
  });

  it("flags the bout where only one fighter answered", () => {
    // Bout 11 is Farrukh, who filled it in, against Baines, who sent nothing.
    const bout11 = bouts.find((b) => b.bout.number === 11);
    expect(bout11?.state).toBe("lopsided");
  });

  it("marks the main event ready", () => {
    expect(bouts.find((b) => b.bout.number === 15)?.state).toBe("ready");
  });

  it("marks an untouched opener empty", () => {
    expect(bouts.find((b) => b.bout.number === 1)?.state).toBe("empty");
  });
});

describe("sponsorInventory", () => {
  it("splits sold from unsold bout slots", () => {
    const { sold, unsold } = sponsorInventory();
    expect(sold.length + unsold.length).toBe(15);
    expect(sold.length).toBeGreaterThan(0);
    expect(unsold.length).toBeGreaterThan(0);
  });
});

describe("nudgeMessage", () => {
  const rows = chaseList();

  it("names the opponent and includes a link", () => {
    const row = rows[0];
    const message = nudgeMessage(row, "https://eventiq.win");
    expect(message).toContain(row.opponent.name);
    expect(message).toContain("https://eventiq.win/f/demo");
  });

  it("only claims the opponent has sent theirs when that is true", () => {
    for (const row of rows) {
      const message = nudgeMessage(row, "https://eventiq.win");
      if (row.behind.length < 2) {
        expect(message).not.toContain("has already sent");
      }
    }
  });

  it("never guesses at the opponent's gender", () => {
    for (const row of rows) {
      const message = nudgeMessage(row, "https://eventiq.win");
      expect(message).not.toMatch(/\b(his|her|he|she)\b/i);
    }
  });

  it("uses the competitive line where the opponent really is ahead", () => {
    const ahead = rows.find((row) => row.behind.length >= 2);
    expect(ahead).toBeDefined();
    expect(nudgeMessage(ahead!, "https://x")).toContain("has already sent");
  });
});
