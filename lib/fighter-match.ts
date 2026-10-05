import type { FighterMatch } from "@/lib/db/queries";

/**
 * Whether a name a promoter has just typed is somebody already here.
 *
 * Fighters are global rows and bouts are per event (HANDOVER section 19 item
 * 11), so the same person coming back on the promoter's next card *can* be the
 * same row — and that is the whole retention hook: their profile, their
 * photograph and their record are already there, so the second show asks them to
 * confirm rather than to start again.
 *
 * The rule this file exists to hold is the opposite one. **Two people with one
 * name is ordinary in this sport**, and merging them is not a tidy-up that can
 * be undone later: it puts one fighter's record, hometown and photograph beside
 * the other's name on a published programme and in a video. So a match is never
 * acted on by the software. It is offered, and a bout is refused until somebody
 * who knows the two people has said which it is.
 *
 * Nothing here reads a database, so every branch of it is testable — which
 * matters more than usual, because the wrong branch is a decision nobody would
 * notice until a fighter opened the card.
 */

/** What the promoter chose where they said this is not the person offered. */
export const NEW_FIGHTER = "new";

export type CornerResolution =
  /** Mint a fresh id and row, exactly as a card with no namesake on it does. */
  | { kind: "mint" }
  /** Reuse this existing row: same person, new bout, new invite. */
  | { kind: "reuse"; fighterId: string }
  /** A match was offered and nothing was said about it. The bout waits. */
  | { kind: "ask"; candidates: readonly FighterMatch[] }
  /**
   * A choice naming somebody who is not among the fighters offered for this
   * name. That is a form whose name box moved after the panel was drawn, and it
   * is refused rather than reinterpreted: quietly minting would lose the
   * promoter's answer, and quietly reusing would be this file's whole point
   * given away by a stale hidden field.
   */
  | { kind: "stale" };

/**
 * What to do about one corner, given what the promoter chose and who is
 * actually offered for the name as it now stands.
 *
 * `candidates` is recomputed on the server from the typed name rather than
 * carried on the form, so the decision below is made against the truth at write
 * time and a caller posting straight at the action gets the same treatment as
 * the card editor.
 */
export function resolveCorner(
  choice: string | null | undefined,
  candidates: readonly FighterMatch[],
): CornerResolution {
  const chosen = (choice ?? "").trim();

  // Nobody of that name on this promoter's cards: the ordinary path, and the
  // one every bout took before any of this existed. A stray choice left on a
  // form whose name has since changed is stale rather than silently ignored.
  if (!candidates.length) return chosen && chosen !== NEW_FIGHTER ? { kind: "stale" } : { kind: "mint" };

  if (!chosen) return { kind: "ask", candidates };
  if (chosen === NEW_FIGHTER) return { kind: "mint" };

  return candidates.some((candidate) => candidate.id === chosen)
    ? { kind: "reuse", fighterId: chosen }
    : { kind: "stale" };
}

/**
 * Whether the two corners have come out as one person.
 *
 * Reachable two ways — the same existing fighter confirmed in both corners, and
 * a promoter typing one name into both boxes — and it is nonsense either way.
 * Worth its own check because the row it would write is not obviously wrong: a
 * bout whose red and blue are the same id renders, and reads as somebody
 * fighting themselves.
 */
export function bothCornersAreOnePerson(red: CornerResolution, blue: CornerResolution): boolean {
  return red.kind === "reuse" && blue.kind === "reuse" && red.fighterId === blue.fighterId;
}

/**
 * The strings `lower(name)` could return for a stored name whose fully lowered
 * form is `key`.
 *
 * SQLite's `lower()` folds A–Z and nothing else, so a stored "Łukasz Nowak"
 * lowers to "Łukasz nowak" and never equals the "łukasz nowak" a promoter's
 * lowered input becomes: a returning fighter with a non-ASCII capital was minted
 * again without the namesake question ever being asked. The index is on
 * `lower(name)`, so rather than give it up the query asks for the forms the name
 * is realistically stored in — as typed in lower case, capitalised word by word,
 * and in capitals — each folded the way SQLite folds them. A name in plain ASCII
 * gives one form, so the parameter count only grows for the names that need it.
 */
export function sqliteLowerForms(key: string): string[] {
  const asciiLower = (value: string) => value.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const capitalised = key.replace(
    /(^|[\s\-'’])(\p{Ll})/gu,
    (_, before: string, letter: string) => before + letter.toUpperCase(),
  );
  return [...new Set([key, capitalised, key.toUpperCase()].map(asciiLower))];
}
