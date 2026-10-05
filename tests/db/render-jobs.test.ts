import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
  enqueueRender,
  loadBoutFingerprints,
  renderJobId,
  requestRenderQuietly,
} from "@/lib/db/render-jobs";
import { plantPromoters, plantShow } from "./fixtures";
import { testDatabase } from "./harness";

/**
 * The queue, and the limit that made it fail silently.
 *
 * `enqueueRender` inserts a row per video. D1 binds at most a hundred parameters
 * to a statement and a row here is nine of them, so a fifteen-bout card in one
 * insert is refused outright — which is exactly what happened: a fighter's
 * submission on the full demo card queued nothing and said so only in the log.
 * Nothing in a pure test can see that, because the limit is the database's.
 */

const platform = testDatabase();

async function fullCard(bouts = 15) {
  const db = platform().db;
  await plantPromoters(db, [{ id: "pr_cage", name: "Cage County" }]);
  const show = await plantShow(db, {
    promoterId: "pr_cage",
    slug: "cage-county-12",
    published: true,
    bouts,
  });
  return { db, show };
}

const jobsOf = (db: ReturnType<typeof platform>["db"], eventId: string) =>
  db
    .select()
    .from(schema.renderJobs)
    .where(eq(schema.renderJobs.eventId, eventId))
    .orderBy(schema.renderJobs.boutNumber, schema.renderJobs.template, schema.renderJobs.corner);

/** The bout numbers with the duplicates collapsed: a bout is four rows now. */
const boutsOf = (rows: readonly { boutNumber: number }[]) => [
  ...new Set(rows.map((row) => row.boutNumber)),
];

describe("enqueueRender", () => {
  it("queues every bout of a fifteen-bout card, which one insert cannot", async () => {
    const { db, show } = await fullCard();

    // Sixty rows: a bout is the tale of the tape, the promo and a walkout per
    // corner, and they are separate jobs so that one failing leaves the others
    // alone.
    expect(await enqueueRender(db, show.eventId, "all")).toBe(60);

    const rows = await jobsOf(db, show.eventId);
    expect(boutsOf(rows)).toEqual([...Array(15)].map((_, at) => at + 1));
    expect(rows.every((row) => row.status === "queued")).toBe(true);
    expect(rows.every((row) => row.inputHash)).toBe(true);
  });

  /**
   * Every video, every time. A promoter pressing "Render again" means the bout
   * rather than part of it, and a programme offering a promo a week behind the
   * tape would be worse than one offering none.
   */
  it("queues all of a bout's videos, with a digest each", async () => {
    const { db, show } = await fullCard(2);
    expect(await enqueueRender(db, show.eventId, [2])).toBe(4);

    const rows = await jobsOf(db, show.eventId);
    expect(rows.map((row) => [row.template, row.corner])).toEqual([
      ["faceoff", ""],
      ["tape", ""],
      ["walkout", "blue"],
      ["walkout", "red"],
    ]);
    expect(new Set(rows.map((row) => row.inputHash)).size).toBe(4);
  });

  /**
   * The empty corner is what makes the upsert an upsert. Were it NULL, SQLite
   * would hold every request's row distinct from the last and a tape asked for
   * twice would be two tapes.
   */
  it("asked twice, still has one row per video", async () => {
    const { db, show } = await fullCard(1);
    await enqueueRender(db, show.eventId, [1]);
    await enqueueRender(db, show.eventId, [1], Date.now() + 1000);
    expect(await jobsOf(db, show.eventId)).toHaveLength(4);
  });

  it("addresses the rows the renderer will claim", async () => {
    const { db, show } = await fullCard(2);
    await enqueueRender(db, show.eventId, [2]);

    const rows = await jobsOf(db, show.eventId);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [
        renderJobId(show.eventId, 2, "tape"),
        renderJobId(show.eventId, 2, "faceoff"),
        renderJobId(show.eventId, 2, "walkout-red"),
        renderJobId(show.eventId, 2, "walkout-blue"),
      ].sort(),
    );
  });

  it("queues the bouts it was asked for and no others", async () => {
    const { db, show } = await fullCard(15);

    expect(await enqueueRender(db, show.eventId, [3, 7])).toBe(8);
    expect(boutsOf(await jobsOf(db, show.eventId))).toEqual([3, 7]);
  });

  it("ignores a bout number that is not on the card", async () => {
    const { db, show } = await fullCard(2);
    expect(await enqueueRender(db, show.eventId, [9])).toBe(0);
    expect(await jobsOf(db, show.eventId)).toEqual([]);
  });

  it("never asks for a walkout video for a bout that is off", async () => {
    const { db, show } = await fullCard(3);
    await db
      .update(schema.bouts)
      .set({ cancelled: true })
      .where(and(eq(schema.bouts.eventId, show.eventId), eq(schema.bouts.number, 2)));

    expect(await enqueueRender(db, show.eventId, "all")).toBe(8);
    expect(boutsOf(await jobsOf(db, show.eventId))).toEqual([1, 3]);
    // Asked for by name, it is still not queued: the fingerprints are the one
    // place that decides, so the two cannot come apart.
    expect(await enqueueRender(db, show.eventId, [2])).toBe(0);
  });

  it("does nothing for a show that is not there", async () => {
    const { db } = await fullCard(1);
    expect(await enqueueRender(db, "ev_nothing", "all")).toBe(0);
  });

  it("asked again, puts a finished bout back in the queue with the new inputs", async () => {
    const { db, show } = await fullCard(2);
    await enqueueRender(db, show.eventId, [1]);
    const before = (await jobsOf(db, show.eventId))[0];
    expect(before.template).toBe("faceoff");

    await db
      .update(schema.renderJobs)
      .set({ status: "failed", attempts: 3, error: "ffmpeg fell over", finishedAt: Date.now() })
      .where(eq(schema.renderJobs.id, before.id));
    // Something a video is made of, changed: the fighter sent a photograph.
    await db
      .update(schema.fighters)
      .set({ photo: "/media/fighters/new-one.jpg", updatedAt: Date.now() + 1 })
      .where(eq(schema.fighters.id, show.fighterIds[0]));

    expect(await enqueueRender(db, show.eventId, [1], Date.now() + 5000)).toBe(4);

    const after = (await jobsOf(db, show.eventId))[0];
    expect(after.status).toBe("queued");
    expect(after.attempts).toBe(0);
    expect(after.error).toBeNull();
    expect(after.inputHash).not.toBe(before.inputHash);
    expect(after.requestedAt).toBeGreaterThan(before.requestedAt);
  });

  it("leaves the video the programme is playing alone while it re-queues", async () => {
    const { db, show } = await fullCard(1);
    await enqueueRender(db, show.eventId, [1]);
    await db
      .update(schema.renderJobs)
      .set({ status: "done", currentR2Key: "renders/cage-county-12/1-abc.mp4" })
      .where(eq(schema.renderJobs.eventId, show.eventId));

    await enqueueRender(db, show.eventId, [1]);

    expect((await jobsOf(db, show.eventId))[0].currentR2Key).toBe(
      "renders/cage-county-12/1-abc.mp4",
    );
  });

  it("does not disturb a runner part way through the bout", async () => {
    const { db, show } = await fullCard(1);
    const now = Date.now();
    await enqueueRender(db, show.eventId, [1], now);
    await db
      .update(schema.renderJobs)
      .set({ status: "running", leaseUntil: now + 600_000, attempts: 1 })
      .where(eq(schema.renderJobs.eventId, show.eventId));

    await enqueueRender(db, show.eventId, [1], now + 1000);

    const row = (await jobsOf(db, show.eventId))[0];
    expect(row.status).toBe("running");
    expect(row.attempts).toBe(1);
  });

  it("picks the bout up again once the lease has run out", async () => {
    const { db, show } = await fullCard(1);
    const now = Date.now();
    await enqueueRender(db, show.eventId, [1], now);
    await db
      .update(schema.renderJobs)
      .set({ status: "running", leaseUntil: now + 1000 })
      .where(eq(schema.renderJobs.eventId, show.eventId));

    await enqueueRender(db, show.eventId, [1], now + 60_000);

    expect((await jobsOf(db, show.eventId))[0].status).toBe("queued");
  });

  it("hashes every bout on the card and nothing else", async () => {
    const { db, show } = await fullCard(3);
    expect(Object.keys(await loadBoutFingerprints(db, show.eventId))).toEqual(["1", "2", "3"]);
  });

  it("cannot meet a bout with a corner that is not there, because the database refuses", async () => {
    const { db, show } = await fullCard(1);

    // `boutFingerprints` skips a bout whose fighters are missing, and this is
    // why that is belt and braces rather than a case anybody has to handle: the
    // foreign key will not let a card get into that state in the first place.
    await expect(
      db.delete(schema.fighters).where(eq(schema.fighters.id, show.fighterIds[0])),
    ).rejects.toThrow();
  });
});

describe("requestRenderQuietly", () => {
  it("does not turn a queue that will not answer into a save that did not happen", async () => {
    const { db, show } = await fullCard(1);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    // The queue taken away underneath the action, which is the shape of the
    // failure this exists for: the promoter's change is already saved, so a
    // throw here would tell them it was not and have them type it again.
    await platform().d1.exec("ALTER TABLE render_jobs RENAME TO render_jobs_away;");
    try {
      await expect(
        requestRenderQuietly(db, show.eventId, "all", { event: "test", route: "/" }),
      ).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalledOnce();
    } finally {
      await platform().d1.exec("ALTER TABLE render_jobs_away RENAME TO render_jobs;");
      logged.mockRestore();
    }
  });
});
