import { describe, expect, it } from "vitest";
import { event, fighters, sponsors } from "@/data/event";
import { daysUntilShow } from "@/lib/promoter";
import { buildSeed, seedInviteFor, showDateFor } from "@/lib/seed";

const seed = () =>
  buildSeed({
    event,
    fighters,
    sponsors,
    passwordHash: "not-a-real-hash",
    renderedBouts: [15, 14],
    now: 1_700_000_000_000,
  });

function tablesIn(sql: string, verb: "INSERT INTO" | "DELETE FROM"): Set<string> {
  const pattern = new RegExp(`${verb} (\\w+)`, "g");
  return new Set([...sql.matchAll(pattern)].map((match) => match[1]));
}

describe("buildSeed", () => {
  it("clears every table it writes to", () => {
    // Re-seeding has to work. This started as a real failure: fighters were
    // inserted but never deleted, so the second `npm run db:reset` died on a
    // primary key collision and left the database half rebuilt.
    const { sql } = seed();
    const written = tablesIn(sql, "INSERT INTO");
    const cleared = tablesIn(sql, "DELETE FROM");
    expect([...written].filter((table) => !cleared.has(table))).toEqual([]);
  });

  it("clears in an order the foreign keys allow", () => {
    const { sql } = seed();
    const order = [...sql.matchAll(/DELETE FROM (\w+)/g)].map((match) => match[1]);
    const before = (table: string) => order.indexOf(table);

    expect(before("bouts")).toBeLessThan(before("fighters"));
    expect(before("invites")).toBeLessThan(before("fighters"));
    expect(before("fighter_sponsors")).toBeLessThan(before("fighters"));
    expect(before("bouts")).toBeLessThan(before("events"));
    expect(before("events")).toBeLessThan(before("promoters"));
    expect(before("sponsors")).toBeLessThan(before("promoters"));
  });

  it("gives every fighter on the card an invite with its own token", () => {
    const { sql, inviteLinks } = seed();
    const onCard = new Set(event.bouts.flatMap((bout) => [bout.redId, bout.blueId]));

    expect(inviteLinks).toHaveLength(onCard.size);
    expect(new Set(inviteLinks.map((link) => link.token)).size).toBe(onCard.size);
    for (const link of inviteLinks) expect(sql).toContain(`'${link.token}'`);
  });

  it("seeds nobody who is not on the card", () => {
    const { sql } = seed();
    const onCard = new Set(event.bouts.flatMap((bout) => [bout.redId, bout.blueId]));
    for (const fighter of Object.values(fighters)) {
      if (!onCard.has(fighter.id)) expect(sql).not.toContain(`'${fighter.id}'`);
    }
  });

  it("escapes quotes rather than breaking the statement", () => {
    const { sql } = buildSeed({
      event: { ...event, name: "O'Brien's Fight Night" },
      fighters,
      sponsors,
      passwordHash: "x",
      renderedBouts: [],
      now: 0,
    });
    expect(sql).toContain("'O''Brien''s Fight Night'");
  });

  it("stores no record for a fighter who has not given one", () => {
    // A seeded 0 would put a veteran on screen as a debutant, which is the one
    // mistake this product cannot make in front of a room that knows better.
    const blank = Object.values(fighters).find((fighter) => !fighter.record);
    expect(blank).toBeDefined();
    const { sql } = seed();
    const line = sql
      .split("\n")
      .find((statement) => statement.startsWith("INSERT INTO fighters") && statement.includes(`'${blank!.id}'`));
    expect(line).toBeDefined();
    expect(line).toMatch(/NULL, NULL, NULL/);
  });
});

describe("showDateFor", () => {
  // A fortnight of seed days, so the answer is checked from every weekday rather
  // than from whichever one the suite happens to run on.
  const seedDays = Array.from({ length: 14 }, (_, i) => Date.UTC(2026, 7, 26) + i * 86_400_000);

  it("puts the demo show close enough to sell the chase list", () => {
    for (const now of seedDays) {
      const days = daysUntilShow(showDateFor(now), new Date(now));
      expect(days).toBeGreaterThanOrEqual(11);
      expect(days).toBeLessThanOrEqual(17);
    }
  });

  it("runs the card on a Saturday, like a fight card", () => {
    for (const now of seedDays) {
      expect(new Date(`${showDateFor(now)}T00:00:00Z`).getUTCDay()).toBe(6);
    }
  });

  it("dates the seeded event from the seed rather than from the fixture", () => {
    const { sql } = seed();
    expect(sql).toContain(`'${showDateFor(1_700_000_000_000)}'`);
    expect(sql).not.toContain(`'${event.date}'`);
  });
});

describe("seedInviteFor", () => {
  const now = 1_700_000_000_000;

  it("does not treat promoter-entered detail as the fighter having replied", () => {
    // Record, age and hometown all come off the promoter's own entry form.
    const promoterOnly = { id: "x", name: "A Fighter", gym: "A Gym", age: 24, record: { w: 3, l: 1, d: 0 } };
    expect(seedInviteFor(promoterOnly, now).status).toBe("sent");
  });

  it("counts a nickname as the fighter having been there", () => {
    const theirs = { id: "x", name: "A Fighter", gym: "A Gym", nickname: "The Answer" };
    const invite = seedInviteFor(theirs, now);
    expect(invite.status).toBe("opened");
    expect(invite.lastOpenedAt).toBeLessThan(now);
  });

  it("never dates an open before the invite was sent", () => {
    for (const fighter of Object.values(fighters)) {
      const invite = seedInviteFor(fighter, now);
      if (invite.lastOpenedAt) expect(invite.sentAt).toBeLessThanOrEqual(invite.lastOpenedAt);
      if (invite.submittedAt) expect(invite.lastOpenedAt).toBeLessThanOrEqual(invite.submittedAt);
    }
  });
});
