import { describe, expect, it } from "vitest";
import { event, fighters, sponsors } from "@/data/event";
import type { Card } from "@/lib/card";
import {
  DONE_AT,
  boutReadiness,
  chaseList,
  daysUntilShow,
  eventProgress,
  inviteStatus,
  nudgeMessage,
  sponsorInventory,
  type Invites,
} from "@/lib/promoter";
import { seedInviteFor } from "@/lib/seed";
import type { Invite } from "@/lib/types";

/**
 * The fixture is the seed, so testing the derivations against it is testing them
 * against what really goes into the database. Loading from D1 is covered
 * separately; what matters here is the logic on top.
 */
const card: Card = { event, fighters, sponsors };

const NOW = Date.UTC(2026, 9, 31);

const invites: Invites = Object.fromEntries(
  Object.values(fighters).map((fighter): [string, Invite] => {
    const seeded = seedInviteFor(fighter, NOW);
    return [
      fighter.id,
      {
        fighterId: fighter.id,
        token: `token-${fighter.id}`,
        sentAt: seeded.sentAt,
        lastOpenedAt: seeded.lastOpenedAt,
        submittedAt: seeded.submittedAt,
      },
    ];
  }),
);

describe("daysUntilShow", () => {
  it("counts from the real clock rather than a pinned date", () => {
    expect(daysUntilShow(event.date, new Date("2026-10-31T09:00:00Z"))).toBe(14);
    expect(daysUntilShow(event.date, new Date("2026-11-14T23:00:00Z"))).toBe(0);
  });
});

describe("inviteStatus", () => {
  it("reads the timestamps rather than guessing from the profile", () => {
    expect(inviteStatus(undefined)).toBe("not-sent");
    expect(inviteStatus({ fighterId: "f", token: "t" })).toBe("not-sent");
    expect(inviteStatus({ fighterId: "f", token: "t", sentAt: 1 })).toBe("sent");
    expect(inviteStatus({ fighterId: "f", token: "t", sentAt: 1, lastOpenedAt: 2 })).toBe("opened");
    expect(
      inviteStatus({ fighterId: "f", token: "t", sentAt: 1, lastOpenedAt: 2, submittedAt: 3 }),
    ).toBe("submitted");
  });

  it("does not call a fighter finished just because they looked", () => {
    expect(inviteStatus({ fighterId: "f", token: "t", sentAt: 1, lastOpenedAt: 2 })).not.toBe(
      "submitted",
    );
  });
});

describe("seedInviteFor", () => {
  it("does not read a promoter-supplied record as the fighter opening the link", () => {
    // Dominic Rees has a record and nothing else. That came off the entry form.
    const seeded = seedInviteFor(fighters["dominic-rees"], NOW);
    expect(seeded.status).toBe("sent");
    expect(seeded.lastOpenedAt).toBeUndefined();
  });

  it("reads a field only the fighter could have given as them opening it", () => {
    // Haider Ali's Instagram handle is not on anybody's entry form.
    expect(seedInviteFor(fighters["haider-ali"], NOW).status).toBe("opened");
  });

  it("marks a finished profile submitted", () => {
    expect(seedInviteFor(fighters["callum-reeves"], NOW).status).toBe("submitted");
  });

  it("keeps the promoter's own overrides", () => {
    expect(seedInviteFor(fighters["sam-whitlock"], NOW).status).toBe("not-sent");
    expect(seedInviteFor(fighters["chloe-baines"], NOW).status).toBe("opened");
  });

  it("leaves most of an untouched undercard unopened, or the list means nothing", () => {
    const statuses = chaseList(card, invites).map((row) => row.status);
    expect(statuses.filter((s) => s === "sent").length).toBeGreaterThan(
      statuses.filter((s) => s === "opened").length,
    );
  });
});

describe("chaseList", () => {
  const rows = chaseList(card, invites);

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

describe("eventProgress", () => {
  it("counts both corners of every bout", () => {
    expect(eventProgress(card, invites).total).toBe(30);
  });

  it("reports a partly finished card rather than a finished one", () => {
    const { percent, done, total } = eventProgress(card, invites);
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(total);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
  });
});

describe("boutReadiness", () => {
  const bouts = boutReadiness(card, invites);

  it("covers every bout, main event first", () => {
    expect(bouts).toHaveLength(15);
    expect(bouts[0].bout.number).toBe(15);
  });

  it("flags the bout where only one fighter answered", () => {
    // Bout 11 is Farrukh, who filled it in, against Baines, who sent nothing.
    expect(bouts.find((b) => b.bout.number === 11)?.state).toBe("lopsided");
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
    const { sold, unsold } = sponsorInventory(card);
    expect(sold.length + unsold.length).toBe(15);
    expect(sold.length).toBeGreaterThan(0);
    expect(unsold.length).toBeGreaterThan(0);
  });
});

describe("nudgeMessage", () => {
  const rows = chaseList(card, invites);

  it("names the opponent and links to that fighter's own invite", () => {
    const row = rows[0];
    const message = nudgeMessage(row, event, "https://eventiq.win");
    expect(message).toContain(row.opponent.name);
    expect(message).toContain(`https://eventiq.win/f/${row.invite!.token}`);
  });

  it("only claims the opponent has sent theirs when that is true", () => {
    for (const row of rows) {
      const message = nudgeMessage(row, event, "https://eventiq.win");
      if (row.behind.length < 2) {
        expect(message).not.toContain("has already sent");
      }
    }
  });

  it("never guesses at the opponent's gender", () => {
    for (const row of rows) {
      expect(nudgeMessage(row, event, "https://eventiq.win")).not.toMatch(/\b(his|her|he|she)\b/i);
    }
  });

  it("uses the competitive line where the opponent really is ahead", () => {
    const ahead = rows.find((row) => row.behind.length >= 2);
    expect(ahead).toBeDefined();
    expect(nudgeMessage(ahead!, event, "https://x")).toContain("has already sent");
  });
});
