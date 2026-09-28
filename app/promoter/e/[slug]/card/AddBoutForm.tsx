"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addBout, findFighters, type FighterLookup } from "@/app/promoter/actions";
import {
  DISCIPLINES,
  DISCIPLINE_NAME,
  Field,
  inputClass,
} from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";
import { BOUT_ADDED, FIGHTER_MATCH } from "@/lib/copy";
import { NEW_FIGHTER } from "@/lib/fighter-match";
import { formatEventDateShort } from "@/lib/tape";

/** Long enough for a name to be typed out, short enough to be there on the pause. */
const LOOKUP_DELAY_MS = 600;

type Corner = "red" | "blue";

/** Nothing typed yet, a lookup in flight, or what came back. */
type CornerState = { looking: boolean; lookup: FighterLookup | null; choice: string };

const EMPTY: CornerState = { looking: false, lookup: null, choice: "" };

/**
 * The panel under a corner whose name is already on one of this promoter's
 * cards.
 *
 * It is a question, not a notification, and nothing is chosen for the promoter:
 * two people with one name is ordinary in this sport, so `addBout` holds the
 * bout until one of these is answered rather than merging on a guess. The
 * reasoning is in lib/fighter-match.ts.
 *
 * The cross-promotion case draws no candidate at all. All it can say is that the
 * name is known here — the gym, the record and the promotion belong to a card
 * this promoter cannot see, and the way to settle it is to let the fighter
 * confirm from the link this show sends them.
 */
function MatchPanel({
  corner,
  name,
  state,
  onChoose,
}: {
  corner: Corner;
  name: string;
  state: CornerState;
  onChoose: (choice: string) => void;
}) {
  if (state.looking && !state.lookup) {
    return <p className="text-ash-dim mt-1 text-xs">{FIGHTER_MATCH.looking}</p>;
  }

  const lookup = state.lookup;
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
              name={`${corner}Match`}
              value={candidate.id}
              checked={state.choice === candidate.id}
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
            name={`${corner}Match`}
            value={NEW_FIGHTER}
            checked={state.choice === NEW_FIGHTER}
            onChange={() => onChoose(NEW_FIGHTER)}
            className="accent-chalk mt-0.5 h-4 w-4"
          />
          <span className="text-chalk text-xs leading-relaxed">{FIGHTER_MATCH.different}</span>
        </label>
      </div>
    </div>
  );
}

export function AddBoutForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // What went on, so a promoter working down a matchmaking sheet can see the
  // last line landed. The form clears itself on a success, which without this
  // is indistinguishable from a form that refused and said nothing.
  const [added, setAdded] = useState<string | null>(null);
  const [names, setNames] = useState<Record<Corner, string>>({ red: "", blue: "" });
  const [corners, setCorners] = useState<Record<Corner, CornerState>>({ red: EMPTY, blue: EMPTY });
  const form = useRef<HTMLFormElement>(null);

  const setCorner = useCallback((corner: Corner, next: Partial<CornerState>) => {
    setCorners((current) => ({ ...current, [corner]: { ...current[corner], ...next } }));
  }, []);

  // The lookup follows the name box rather than a control the promoter has to
  // remember to press, because the whole value of it is being told before the
  // bout goes on rather than after. A name still being typed is not a name, so
  // the shortest are left alone, and the delay is what keeps a line read off a
  // matchmaking sheet from being one request per keystroke.
  useEffect(() => {
    const typed: Record<Corner, string> = { red: names.red.trim(), blue: names.blue.trim() };
    const timers = (["red", "blue"] as const).map((corner) => {
      const name = typed[corner];
      if (name.length < 3) {
        setCorner(corner, { lookup: null, looking: false, choice: "" });
        return null;
      }
      setCorner(corner, { looking: true });
      return setTimeout(() => {
        void findFighters(slug, name).then((result) => {
          // A lookup that would not run leaves the panel closed rather than
          // saying so: it is a convenience on the way past, and nothing is lost
          // by its absence — `addBout` asks the same question again where it
          // matters, and refuses there.
          setCorner(corner, {
            looking: false,
            lookup: result.ok ? { candidates: result.candidates, elsewhere: result.elsewhere } : null,
          });
        });
      }, LOOKUP_DELAY_MS);
    });

    return () => {
      for (const timer of timers) if (timer) clearTimeout(timer);
    };
  }, [names.red, names.blue, slug, setCorner]);

  return (
    <form
      ref={form}
      // Submitted through a transition rather than through the `action` prop,
      // because React resets an uncontrolled form once an action returns and
      // does it whatever the action answered. That wiped two names and four
      // numbers the promoter had just read off a matchmaking sheet every time
      // the bout was refused, and left them retyping the line to find out why.
      // Handling the submit ourselves means the clearing below is the only one.
      onSubmit={(submit) => {
        submit.preventDefault();
        const data = new FormData(submit.currentTarget);
        // Read before the action runs: the form is cleared on the way back, so
        // the names have to be in hand before there is anything to say about
        // them.
        const both = `${String(data.get("redName") ?? "").trim()} v ${String(data.get("blueName") ?? "").trim()}`;
        start(async () => {
          const result = await addBout(slug, data);
          setError(result.ok ? null : result.error);
          setAdded(result.ok ? BOUT_ADDED(both) : null);
          // Cleared only where the bout went in, so a promoter working down a
          // sheet can type the next line straight away. The match panels go with
          // it: they belong to names that are no longer in the boxes.
          if (result.ok) {
            form.current?.reset();
            setNames({ red: "", blue: "" });
            setCorners({ red: EMPTY, blue: EMPTY });
          }
        });
      }}
      className="border-hairline mt-4 grid gap-4 border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(["red", "blue"] as const).map((corner) => {
          const state = corners[corner];
          // The gym box goes away once an existing fighter has been confirmed,
          // because that row holds what the fighter sent and this form does not
          // edit it. A box that is silently ignored is worse than one that is
          // not drawn.
          const confirmed = !!state.choice && state.choice !== NEW_FIGHTER;
          const gym = confirmed
            ? state.lookup?.candidates.find((one) => one.id === state.choice)?.gym
            : undefined;

          return (
            <div
              key={corner}
              className={
                corner === "red"
                  ? "border-red-corner grid gap-3 border-l-2 pl-3"
                  : "border-blue-corner grid gap-3 border-l-2 pl-3"
              }
            >
              <span className="label">{corner === "red" ? "Red corner" : "Blue corner"}</span>
              <Field label="Name">
                <input
                  name={`${corner}Name`}
                  className={inputClass}
                  placeholder={corner === "red" ? "Owen Pryce" : "Danny Rook"}
                  value={names[corner]}
                  onChange={(change) =>
                    setNames((current) => ({ ...current, [corner]: change.target.value }))
                  }
                  required
                />
              </Field>
              {confirmed ? (
                // Not a Field: there is no control here to label, and a <label>
                // naming nothing is exactly what the accessibility pass took out
                // of the questionnaire.
                <div>
                  <span className="label">Gym</span>
                  <div className="text-ash mt-1.5 text-sm">{gym}</div>
                </div>
              ) : (
                <Field label="Gym">
                  <input
                    name={`${corner}Gym`}
                    className={inputClass}
                    placeholder={corner === "red" ? "Bryn MMA" : "Northgate"}
                  />
                </Field>
              )}
              <MatchPanel
                corner={corner}
                name={names[corner].trim()}
                state={state}
                onChoose={(choice) => setCorner(corner, { choice })}
              />
            </div>
          );
        })}
      </div>

      {/* Filled in rather than hinted at. The action puts 70kg and three
          three-minute rounds on any bout that arrives without them, so a
          placeholder showing those numbers in grey was the difference between a
          default and a surprise: a promoter who left the boxes alone got a bout
          at a weight they had never agreed to and no sign that they had. Grade
          stays empty, because there is no sensible guess at one — the action
          stores nothing where it is blank and the programme says nothing. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Discipline">
          <select name="discipline" className={inputClass} defaultValue="MMA">
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {DISCIPLINE_NAME[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight kg">
          {/* Decimal, because catchweights are agreed at the half kilo. */}
          <input
            name="weightKg"
            inputMode="decimal"
            className={inputClass}
            defaultValue="70"
          />
        </Field>
        <Field label="Grade">
          <input name="classLabel" className={inputClass} placeholder="C CLASS" />
        </Field>
        <Field label="Rounds">
          <input name="rounds" inputMode="numeric" className={inputClass} defaultValue="3" />
        </Field>
        <Field label="Minutes">
          <input
            name="roundMinutes"
            inputMode="numeric"
            className={inputClass}
            defaultValue="3"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="womens" className="accent-chalk h-4 w-4" />
        <span className="label">Women&rsquo;s bout</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-chalk text-ink display hover:bg-gold justify-self-start px-5 py-2.5 text-base transition-colors disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add the bout"}
      </button>
      <ActionStatus error={error} done={added} />
    </form>
  );
}
