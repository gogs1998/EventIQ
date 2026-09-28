"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "@/db/schema";
import { attempt, done, refuse, type ActionResult } from "@/lib/action-result";
import { newId } from "@/lib/auth";
import { ACTION_ERRORS, GYM_TO_CONFIRM } from "@/lib/copy";
import { getDb, getMedia, type Db } from "@/lib/db";
import {
  fightersNamedAny,
  matchableName,
  newInviteValues,
  uniqueFighterId,
  type FighterMatch,
} from "@/lib/db/queries";
import { requestRenderQuietly } from "@/lib/db/render-jobs";
import { bothCornersAreOnePerson, resolveCorner, type CornerResolution } from "@/lib/fighter-match";
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-type";
import { logError } from "@/lib/log";
import { mediaKeyOf } from "@/lib/portrait";
import {
  MAX_SHEET_BOUTS,
  MAX_SHEET_LENGTH,
  parseSheet,
  sanitiseRows,
  type SheetBout,
  type SheetProblem,
  type SheetRow,
} from "@/lib/sheet";
import { currentPromoter, type Promoter } from "@/lib/session";
import { loadOwnedCard, type OwnedCard } from "@/lib/visibility";

/**
 * Putting a whole running order on in one go.
 *
 * Its own file because it is its own subject: a sheet is read, shown back, and
 * only then written, and the read is a pure function in lib/sheet.ts that never
 * touches a database. What is here is the three things that have to talk to one
 * — who the names already are, what gets written, and the photographs the
 * promoter crops off a poster.
 *
 * **It goes through the same rule `addBout` does and never around it.** The
 * matching in lib/fighter-match.ts exists because two people with one name is
 * ordinary in this sport and merging them publishes one fighter's record beside
 * the other's name. A bulk path that quietly minted thirty new fighters would be
 * that rule given away by the fastest door in the product — which is exactly the
 * shape of the hole section 14 keeps recording. So every corner on the sheet is
 * looked up again here, resolved by the same function, and the whole import is
 * refused while any one of them is unanswered.
 *
 * **Nothing is written until the preview is confirmed.** `previewSheet` reads
 * and answers; `importSheet` writes. The promoter corrects every field in
 * between, so what comes back is typing rather than a parse and is read as
 * `unknown` accordingly.
 */

type Owned = { promoter: Promoter; card: OwnedCard };

/**
 * The show and the promoter who owns it, or the sentence to show instead.
 *
 * The same shape as the other "use server" files and, as there, not shared
 * between them: everything a server module exports is an endpoint. The rule is
 * `loadOwnedCard` in lib/visibility.ts, so this is one call rather than a fifth
 * copy of the where clause.
 */
async function ownedEvent(db: Db, slug: string): Promise<ActionResult<Owned>> {
  const promoter = await currentPromoter();
  if (!promoter) return refuse(ACTION_ERRORS.signedOut);

  const card = await loadOwnedCard(db, slug, promoter.id);
  if (!card) return refuse(ACTION_ERRORS.noSuchShow);

  return done({ promoter, card });
}

// ------------------------------------------------------------------ preview

/** A corner as the preview draws it: what the line said, and who else is called that. */
export type PreviewCorner = {
  name: string;
  gym: string;
  /** Fighters of this promoter's own cards under this name. Usually none. */
  candidates: FighterMatch[];
};

export type PreviewBout = Omit<SheetBout, "red" | "blue"> & {
  red: PreviewCorner;
  blue: PreviewCorner;
};

export type SheetPreview = {
  bouts: PreviewBout[];
  problems: SheetProblem[];
  /** What the first bout of the import will be numbered, for the preview to show. */
  nextNumber: number;
};

/**
 * Reads the paste and answers with what it would put on, having asked about
 * every name.
 *
 * Read-only, and behind the same ownership check as every write on this show,
 * because it is an endpoint like the rest: without `loadOwnedCard` a paste of
 * thirty names would be a way to ask whose roster they are on, thirty at a time.
 *
 * The lookup is one query for the whole sheet rather than one per corner. A
 * fifteen-bout card is thirty names, and thirty round trips to D1 is the
 * difference between a preview that appears and one a promoter waits through.
 */
export async function previewSheet(
  slug: string,
  text: string,
): Promise<ActionResult<SheetPreview>> {
  return attempt(
    { event: "previewSheet", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async (): Promise<ActionResult<SheetPreview>> => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;

      const { bouts, problems } = parseSheet(String(text ?? "").slice(0, MAX_SHEET_LENGTH));
      if (bouts.length > MAX_SHEET_BOUTS) return refuse(ACTION_ERRORS.sheetTooLong);

      const named = await fightersNamedAny(
        db,
        bouts.flatMap((bout) => [bout.red.name, bout.blue.name]),
        card.promoterId,
      );
      const candidatesFor = (name: string) => named.get(matchableName(name).toLowerCase()) ?? [];

      return done({
        bouts: bouts.map((bout) => ({
          ...bout,
          red: { ...bout.red, candidates: candidatesFor(bout.red.name) },
          blue: { ...bout.blue, candidates: candidatesFor(bout.blue.name) },
        })),
        problems,
        nextNumber: nextBoutNumber(card),
      });
    },
  );
}

// ------------------------------------------------------------------- import

/** Where a bout landed, in the order the rows were submitted, for the poster step. */
export type ImportedBout = { number: number; redId: string; blueId: string };

function nextBoutNumber(card: OwnedCard): number {
  // Off the card the ownership check has already loaded, rather than a second
  // query for a number sitting in it.
  return Math.max(0, ...card.event.bouts.map((bout) => bout.number)) + 1;
}

/**
 * Writes the whole sheet, or none of it.
 *
 * One `db.batch`, which D1 runs as a single transaction, for the same reason
 * `addBout` uses one: a card half-entered leaves fighters with no bout and no
 * invite, invisible on every screen because everything here is derived from the
 * running order, and still in the table when somebody next counts. At fifteen
 * bouts that failure is fifteen times the mess.
 *
 * The ids on the submitted rows are not trusted. Candidates are looked up again
 * against the names as they now stand, and a choice naming somebody who is no
 * longer offered for that name is refused rather than reinterpreted — the same
 * `stale` rule as `addBout`, and for the same reason: quietly minting would lose
 * the promoter's answer and quietly reusing would give away the whole point of
 * asking.
 *
 * `mainEventFirst` is the toggle from the preview and nothing else decides it.
 * Sheets are written both ways round, a word on a line is not reliable evidence,
 * and getting it wrong turns the card upside down — the opener becomes the bout
 * the promoter shows a sponsor.
 */
export async function importSheet(
  slug: string,
  input: unknown,
  mainEventFirst: boolean,
): Promise<ActionResult<{ bouts: ImportedBout[] }>> {
  return attempt(
    { event: "importSheet", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.notSaved,
    async (): Promise<ActionResult<{ bouts: ImportedBout[] }>> => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;

      const rows = sanitiseRows(input);
      if (!rows.length) return refuse(ACTION_ERRORS.sheetNothingToAdd);
      if (rows.length > MAX_SHEET_BOUTS) return refuse(ACTION_ERRORS.sheetTooLong);
      if (rows.some((row) => !row.red.name || !row.blue.name)) {
        return refuse(ACTION_ERRORS.boutNeedsBothCorners);
      }

      const named = await fightersNamedAny(
        db,
        rows.flatMap((row) => [row.red.name, row.blue.name]),
        card.promoterId,
      );
      const resolve = (corner: SheetRow["red"]): CornerResolution =>
        resolveCorner(corner.match, named.get(matchableName(corner.name).toLowerCase()) ?? []);

      const resolved = rows.map((row) => [resolve(row.red), resolve(row.blue)] as const);
      const flat = resolved.flat();

      // Refused rather than guessed at, in both directions and for the whole
      // sheet rather than row by row. A partial import with the answered bouts
      // on and the rest missing is a running order a promoter has to reconcile
      // against the sheet by eye, which is the job this was meant to take away.
      if (flat.some((one) => one.kind === "stale")) return refuse(ACTION_ERRORS.matchOutOfDate);
      if (flat.some((one) => one.kind === "ask")) {
        return refuse(ACTION_ERRORS.sheetCornerNeedsAnAnswer);
      }
      if (resolved.some(([red, blue]) => bothCornersAreOnePerson(red, blue))) {
        return refuse(ACTION_ERRORS.bothCornersOneFighter);
      }

      // `invites_event_fighter` is unique, so a fighter confirmed onto a card
      // they are already on — or confirmed twice within the one paste — would
      // fail the batch and be reported as a save that did not land. Both are
      // real refusals with a reason instead.
      const alreadyOn = new Set(card.event.bouts.flatMap((bout) => [bout.redId, bout.blueId]));
      const confirmed = new Set<string>();
      for (const one of flat) {
        if (one.kind !== "reuse") continue;
        if (alreadyOn.has(one.fighterId)) return refuse(ACTION_ERRORS.cornerAlreadyOnCard);
        if (confirmed.has(one.fighterId)) return refuse(ACTION_ERRORS.sheetCornerTwice);
        confirmed.add(one.fighterId);
      }

      // The toggle, applied once and here. The rows keep their submitted order
      // in what comes back, because the browser holds the poster crops against
      // that order and has no idea which end the promoter said was the top.
      const order = rows.map((_, at) => at);
      if (mainEventFirst) order.reverse();

      const now = Date.now();
      const first = nextBoutNumber(card);
      const writes: BatchItem<"sqlite">[] = [];
      const landed: ImportedBout[] = new Array(rows.length);
      const minted: string[] = [];

      for (const [position, at] of order.entries()) {
        const row = rows[at];
        const number = first + position;
        const corners = [row.red, row.blue] as const;
        const ids: string[] = [];

        for (const [side, corner] of corners.entries()) {
          const decided = resolved[at][side];
          if (decided.kind === "reuse") {
            // Nothing is written to the fighter. The row is what that person
            // sent last time and the promoter has confirmed who they are, not
            // edited their profile. Their new link is what asks them to change
            // anything.
            ids.push(decided.fighterId);
            writes.push(
              db
                .insert(schema.invites)
                .values((await newInviteValues(card.eventId, decided.fighterId, now)).values),
            );
            continue;
          }

          // Chosen before the batch rather than inside it: an id has to be
          // unique against rows that already exist, and a batch is a list of
          // writes with nothing read back between them. `minted` carries every
          // id this one call has settled on but not yet written, which on a
          // sheet is the card where two namesakes are matched against each
          // other on different bouts.
          const id = await uniqueFighterId(db, corner.name, minted);
          minted.push(id);
          ids.push(id);
          writes.push(
            db.insert(schema.fighters).values({
              id,
              name: corner.name,
              gym: corner.gym || GYM_TO_CONFIRM,
              createdAt: now,
              updatedAt: now,
            }),
            // Through newInviteValues so the token is sealed rather than stored
            // in the clear, and so a fourth place that issues one cannot forget.
            db.insert(schema.invites).values((await newInviteValues(card.eventId, id, now)).values),
          );
        }

        writes.push(
          db.insert(schema.bouts).values({
            id: newId("bo"),
            eventId: card.eventId,
            number,
            discipline: row.discipline,
            weightKg: row.weightKg,
            classLabel: row.classLabel || null,
            womens: row.womens,
            rounds: row.rounds,
            roundMinutes: row.roundMinutes,
            redId: ids[0],
            blueId: ids[1],
          }),
        );

        landed[at] = { number, redId: ids[0], blueId: ids[1] };
      }

      await db.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

      await requestRenderQuietly(
        db,
        card.eventId,
        landed.map((bout) => bout.number),
        { event: "importSheet", route: `/promoter/e/${slug}/card` },
      );

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return done({ bouts: landed });
    },
  );
}

// ------------------------------------------------------------------ posters

/** The same ceiling the fighter's own photograph has, for the same reason. */
const MAX_POSTER_BYTES = 4 * 1024 * 1024;

/**
 * Stores a photograph the promoter has cropped off a poster, onto a fighter on
 * this card.
 *
 * **The bytes decide what this is, never the declared type.** It is the same
 * rule as `uploadPhoto`, written out again rather than shared because it is the
 * third door onto the bucket and the one added last — which is precisely the
 * case section 6b warns about, somebody later trusting the file picker's
 * `accept` attribute. The crop is made by a canvas in the promoter's browser and
 * arrives as a JPEG; that canvas is on the far side of the trust boundary and is
 * a convenience, not a control.
 *
 * **The consent rule is untouched.** A photograph on a fighter's row is not a
 * consent — consent is per invite and taken when the fighter opens their link
 * and submits (section 6g), and nothing here writes one. The poster is the
 * promoter's own artwork of a bout they have made, the questionnaire shows the
 * fighter what is on their card the moment they open it, and the removal control
 * on that form takes it off. The copy beside this control says all three so the
 * promoter knows whose photograph they are supplying and who is asked about it.
 *
 * The key carries a random suffix so a replaced photograph gets a new URL, and
 * the cutout and the stylised portrait go with the old one, exactly as
 * `uploadPhoto` does it: both are derived from one particular picture and left
 * behind they would put a different face in the video.
 */
export async function setFighterPhoto(
  slug: string,
  fighterId: string,
  form: FormData,
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    { event: "setFighterPhoto", route: `/promoter/e/${slug}/card`, fighterId },
    ACTION_ERRORS.posterNotStored,
    async (): Promise<ActionResult<{ path: string }>> => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;
      const { card } = owned;

      // A fighter id is not a capability either. Without this the action would
      // put a promoter's poster crop on anybody's row in a global table.
      const onCard = card.event.bouts.some(
        (bout) => bout.redId === fighterId || bout.blueId === fighterId,
      );
      if (!onCard) return refuse(ACTION_ERRORS.notOnThisCard);

      const file = form.get("photo");
      if (!(file instanceof File)) return refuse(ACTION_ERRORS.posterNotAPhotograph);
      if (file.size > MAX_POSTER_BYTES) return refuse(ACTION_ERRORS.posterTooLarge);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentType = sniffImageType(bytes);
      if (!contentType) return refuse(ACTION_ERRORS.posterNotAPhotograph);

      const [fighter] = await db
        .select()
        .from(schema.fighters)
        .where(eq(schema.fighters.id, fighterId))
        .limit(1);
      if (!fighter) return refuse(ACTION_ERRORS.notOnThisCard);

      // A returning fighter can be confirmed onto a pasted card, and their row
      // is what they sent last time. A crop off a poster does not go over the
      // top of a photograph they agreed to and supplied themselves — that is
      // theirs to change, from their own link (section 6g). A row with no
      // photograph, or one the promoter put there, is fair game.
      if (fighter.photo && (await hasSentTheirOwn(db, fighterId))) {
        return refuse(ACTION_ERRORS.posterWouldReplace);
      }

      const suffix = crypto.randomUUID().slice(0, 8);
      const key = `fighters/${fighterId}-${suffix}.${IMAGE_EXTENSION[contentType]}`;

      const media = await getMedia();
      await media.put(key, bytes, { httpMetadata: { contentType } });

      const path = `/media/${key}`;
      const superseded = [fighter.photo, fighter.cutout, fighter.stylised]
        .map(mediaKeyOf)
        .filter((old): old is string => old !== null && old !== key);

      // After the object, so a row can never point at bytes that are not there.
      await db
        .update(schema.fighters)
        .set({ photo: path, cutout: null, stylised: null, updatedAt: Date.now() })
        .where(eq(schema.fighters.id, fighterId));

      for (const old of superseded) {
        await media
          .delete(old)
          .catch((error) =>
            logError(
              { event: "setFighterPhoto", route: `/promoter/e/${slug}/card`, fighterId },
              error,
            ),
          );
      }

      await requestRenderQuietly(db, card.eventId, "all", {
        event: "setFighterPhoto",
        route: `/promoter/e/${slug}/card`,
        fighterId,
      });

      revalidatePath(`/promoter/e/${slug}`);
      revalidatePath(`/e/${slug}`);
      return done({ path });
    },
  );
}

/**
 * Whether this fighter has ever agreed to what goes on a programme.
 *
 * A live consent on any invite of theirs. It is the only thing here that can
 * tell a photograph the fighter sent from one a promoter cropped, because the
 * column is the same column either way — and consent is what makes the
 * difference: one of them was answered for, and the other was supplied.
 */
async function hasSentTheirOwn(db: Db, fighterId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.fighterId, fighterId),
        isNotNull(schema.invites.consentedAt),
        isNull(schema.invites.revokedAt),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Keeps the poster itself, under the show it was pasted onto.
 *
 * The crops are what reach a fighter's row; this is the picture they were taken
 * from, kept so the promoter can go back to it — a second corner cropped later,
 * or a crop taken again because the first one cut somebody's head off. It is not
 * on any page a spectator can reach and it is not a fighter's photograph, so it
 * lives under its own prefix with its own rule in lib/visibility.ts rather than
 * being filed with the portraits and inheriting theirs.
 *
 * Sniffed like everything else that arrives as bytes and is served back from our
 * own origin.
 */
export async function uploadPoster(
  slug: string,
  form: FormData,
): Promise<ActionResult<{ path: string }>> {
  return attempt(
    { event: "uploadPoster", route: `/promoter/e/${slug}/card` },
    ACTION_ERRORS.posterNotStored,
    async (): Promise<ActionResult<{ path: string }>> => {
      const db = await getDb();
      const owned = await ownedEvent(db, slug);
      if (!owned.ok) return owned;

      const file = form.get("poster");
      if (!(file instanceof File)) return refuse(ACTION_ERRORS.posterNotAPhotograph);
      if (file.size > MAX_POSTER_BYTES) return refuse(ACTION_ERRORS.posterTooLarge);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const contentType = sniffImageType(bytes);
      if (!contentType) return refuse(ACTION_ERRORS.posterNotAPhotograph);

      const suffix = crypto.randomUUID().slice(0, 8);
      const key = `posters/${owned.card.eventId}/${suffix}.${IMAGE_EXTENSION[contentType]}`;

      const media = await getMedia();
      await media.put(key, bytes, { httpMetadata: { contentType } });

      return done({ path: `/media/${key}` });
    },
  );
}
