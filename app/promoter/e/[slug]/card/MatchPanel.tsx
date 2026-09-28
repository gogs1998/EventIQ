"use client";

import type { FighterLookup } from "@/app/promoter/actions";
import { FIGHTER_MATCH } from "@/lib/copy";
import { NEW_FIGHTER } from "@/lib/fighter-match";
import { formatEventDateShort } from "@/lib/tape";

/**
 * The panel under a corner whose name is already on one of this promoter's
 * cards.
 *
 * It is a question, not a notification, and nothing is chosen for the promoter:
 * two people with one name is ordinary in this sport, so the write holds the
 * bout until one of these is answered rather than merging on a guess. The
 * reasoning is in lib/fighter-match.ts.
 *
 * The cross-promotion case draws no candidate at all. All it can say is that the
 * name is known here — the gym, the record and the promotion belong to a card
 * this promoter cannot see, and the way to settle it is to let the fighter
 * confirm from the link this show sends them.
 *
 * Its own file because there are two doors onto the card now. The form asks one
 * bout at a time and the sheet asks thirty at once, and the question a promoter
 * is answering has to be the same question either way — a second copy of this
 * markup is a second place for the wording, the ordering and the "different
 * person" option to drift apart.
 */
export function MatchPanel({
  group,
  name,
  lookup,
  looking = false,
  choice,
  onChoose,
}: {
  /** The radio group's name. Unique per corner on the page, so a row may prefix it. */
  group: string;
  /** The name as it stands in the box, which is what the question is about. */
  name: string;
  lookup: FighterLookup | null;
  looking?: boolean;
  choice: string;
  onChoose: (choice: string) => void;
}) {
  if (looking && !lookup) {
    return <p className="text-ash-dim mt-1 text-xs">{FIGHTER_MATCH.looking}</p>;
  }

  if (!lookup) return null;

  if (!lookup.candidates.length) {
    return lookup.elsewhere ? (
      <p className="border-hairline text-ash mt-1 border p-3 text-xs leading-relaxed">
        {FIGHTER_MATCH.elsewhere}
      </p>
    ) : null;
  }

  return (
    <div
      role="group"
      aria-label={FIGHTER_MATCH.heading(name)}
      className="border-gold/40 bg-gold/5 mt-1 border p-3"
    >
      <p className="display text-chalk text-sm">{FIGHTER_MATCH.heading(name)}</p>
      <p className="text-ash mt-1.5 text-xs leading-relaxed">{FIGHTER_MATCH.body}</p>

      <div className="mt-3 grid gap-2">
        {lookup.candidates.map((candidate) => (
          <label key={candidate.id} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={group}
              value={candidate.id}
              checked={choice === candidate.id}
              onChange={() => onChoose(candidate.id)}
              className="accent-chalk mt-0.5 h-4 w-4"
            />
            <span className="text-xs leading-relaxed">
              <span className="text-chalk">{FIGHTER_MATCH.same}</span>
              <span className="text-ash">
                {" — "}
                {candidate.gym}
                {". "}
                {/* Never a 0-0-0 where nobody has given a record: that is the
                    isDebut rule, said in a panel a promoter reads. */}
                {candidate.record
                  ? `${candidate.record.w}-${candidate.record.l}-${candidate.record.d}`
                  : FIGHTER_MATCH.noRecord}
                {". "}
                {candidate.lastShow
                  ? FIGHTER_MATCH.lastShow(
                      candidate.lastShow.name,
                      formatEventDateShort(candidate.lastShow.date),
                    )
                  : FIGHTER_MATCH.noShow}
                .
              </span>
            </span>
          </label>
        ))}

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            name={group}
            value={NEW_FIGHTER}
            checked={choice === NEW_FIGHTER}
            onChange={() => onChoose(NEW_FIGHTER)}
            className="accent-chalk mt-0.5 h-4 w-4"
          />
          <span className="text-chalk text-xs leading-relaxed">{FIGHTER_MATCH.different}</span>
        </label>
      </div>
    </div>
  );
}
