import * as schema from "@/db/schema";
import { secretDigest } from "@/lib/auth";
import { newInviteValues } from "@/lib/db/queries";
import { currentPlatform, execWrites, type Db } from "./platform";

/**
 * Cards to run the rules against.
 *
 * Deliberately plain: two promoters, a draft and a published show, and as many
 * bouts as the test asks for. The interesting data is in the seed and in the
 * demo card; what these tests need is the shape a rule sees — whose show it is,
 * whether it is published, and who is on it.
 *
 * Everything goes in through `execWrites`, which is what keeps the suite quick,
 * and which is also why a fifteen-bout card can be planted as one statement per
 * table: with no parameters there is no hundred-parameter limit to work around.
 * The SQL still comes out of drizzle and therefore out of db/schema.ts, so a
 * column renamed there breaks these fixtures rather than being quietly missed.
 */

type Write = { toSQL: () => { sql: string; params: unknown[] } };

async function plant(writes: Write[]): Promise<void> {
  await execWrites(currentPlatform().d1, writes);
}

export type PlantedShow = {
  eventId: string;
  slug: string;
  promoterId: string;
  /** Fighter ids in running order: red and blue of bout 1, then bout 2, and so on. */
  fighterIds: string[];
  /** The link each fighter was sent, by fighter id. */
  tokens: Record<string, string>;
};

export async function plantPromoters(
  db: Db,
  promoters: readonly { id: string; name: string }[],
): Promise<void> {
  const now = Date.now();
  await plant([
    db
      .insert(schema.promoters)
      .values(promoters.map(({ id, name }) => ({ id, slug: id, name, createdAt: now }))),
  ]);
}

export async function plantShow(
  db: Db,
  options: {
    promoterId: string;
    slug: string;
    published: boolean;
    /** Bouts, each with two fighters and two invites. Fifteen is a full card. */
    bouts?: number;
    date?: string;
    now?: number;
  },
): Promise<PlantedShow> {
  const { promoterId, slug, published, bouts = 1, date = "2026-11-14" } = options;
  const now = options.now ?? Date.now();
  const eventId = `ev_${slug}`;

  const fighterIds: string[] = [];
  const fighterRows: (typeof schema.fighters.$inferInsert)[] = [];
  const boutRows: (typeof schema.bouts.$inferInsert)[] = [];

  for (let number = 1; number <= bouts; number += 1) {
    const corners = [`${slug}-${number}-red`, `${slug}-${number}-blue`];
    for (const id of corners) {
      fighterIds.push(id);
      fighterRows.push({
        id,
        name: id,
        gym: "Bryn Athletic",
        // A stored path so `/media` has something of this fighter's to be asked
        // about; the object itself is nobody's business here.
        photo: `/media/fighters/${id}.jpg`,
        createdAt: now,
        updatedAt: now,
      });
    }
    boutRows.push({
      id: `bo_${slug}_${number}`,
      eventId,
      number,
      discipline: "MMA",
      weightKg: 70,
      rounds: 3,
      roundMinutes: 3,
      redId: corners[0],
      blueId: corners[1],
    });
  }

  const tokens: Record<string, string> = {};
  const inviteRows: (typeof schema.invites.$inferInsert)[] = [];
  for (const fighterId of fighterIds) {
    // Through the same function the card editor and the seed use, so the rows
    // carry a sealed token rather than a shape only the tests know about.
    const { token, values } = await newInviteValues(eventId, fighterId, now);
    tokens[fighterId] = token;
    inviteRows.push(values);
  }

  // Parents first: a bout cannot point at a fighter who is not there yet.
  await plant([
    db.insert(schema.events).values({
      id: eventId,
      promoterId,
      slug,
      name: slug,
      date,
      doorsTime: "18:00",
      firstBellTime: "19:00",
      venue: "Town Hall",
      city: "Grangemouth",
      published,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(schema.fighters).values(fighterRows),
    db.insert(schema.bouts).values(boutRows),
    db.insert(schema.invites).values(inviteRows),
  ]);

  return { eventId, slug, promoterId, fighterIds, tokens };
}

export async function plantSponsor(
  db: Db,
  options: { id: string; promoterId: string; markKey?: string },
): Promise<string> {
  await plant([
    db.insert(schema.sponsors).values({
      id: options.id,
      promoterId: options.promoterId,
      name: options.id,
      markKey: options.markKey ?? null,
      createdAt: Date.now(),
    }),
  ]);
  return options.id;
}

/** A render key as `npm run render-key` mints one: the digest, never the key. */
export async function plantRenderKey(
  db: Db,
  options: {
    id: string;
    key: string;
    promoterId?: string | null;
    expiresAt?: number | null;
    revokedAt?: number | null;
  },
): Promise<void> {
  await plant([
    db.insert(schema.renderKeys).values({
      id: options.id,
      promoterId: options.promoterId ?? null,
      digest: await secretDigest(options.key),
      createdAt: Date.now(),
      expiresAt: options.expiresAt ?? null,
      revokedAt: options.revokedAt ?? null,
    }),
  ]);
}
