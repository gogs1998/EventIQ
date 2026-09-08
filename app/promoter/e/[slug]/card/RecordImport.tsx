"use client";

import { useState, useTransition } from "react";
import { applyFighterRecord, lookupFighterRecord } from "@/app/promoter/actions";
import { inputClass } from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";
import { RECORD_IMPORT } from "@/lib/copy";
import { cx } from "@/lib/cx";
import { SOURCE_LABEL, type ImportOutcome, type RecordFill } from "@/lib/fighter-import";

/**
 * The promoter's paste box, on one corner of one bout.
 *
 * It mirrors the fighter's own box in components/Questionnaire.tsx, and it has
 * to behave differently in one respect: this writes to somebody else's profile.
 * So it never saves on the way back. It shows what the card says, what the page
 * says and which of the two would win, and waits to be told. Anything a person
 * has already typed keeps its place — the same rule as the fighter's side, where
 * an import only fills blanks.
 *
 * One fighter at a time. The action says why at length; the short version is
 * that a whole card on one press is a different posture towards somebody else's
 * website, and the terms question behind it has not been settled.
 */
export function RecordImport({
  slug,
  fighterId,
}: {
  slug: string;
  fighterId: string;
}) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [diff, setDiff] = useState<RecordFill[]>([]);
  const [applied, setApplied] = useState<string[] | null>(null);

  const look = () => {
    if (!url.trim() || pending) return;
    setApplied(null);
    start(async () => {
      const result = await lookupFighterRecord(slug, fighterId, url);
      if (!result.ok) {
        setError(result.error);
        setOutcome(null);
        setDiff([]);
        return;
      }
      setError(null);
      setOutcome(result.outcome);
      setDiff(result.diff);
    });
  };

  const apply = () => {
    start(async () => {
      const result = await applyFighterRecord(slug, fighterId, url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The confirmation goes where the diff was, so the row does not end up
      // showing a proposal that has already happened.
      setError(null);
      setApplied(result.applied);
      setOutcome(null);
      setDiff([]);
    });
  };

  const tape = outcome?.ok ? outcome.tape : null;
  const source = tape ? SOURCE_LABEL[tape.source] : undefined;
  const fills = diff.filter((row) => row.fills);

  return (
    <div className="border-hairline bg-panel/30 grid gap-2 border p-3">
      <span className="label">{RECORD_IMPORT.heading}</span>
      <p className="text-ash-dim text-[0.65rem] leading-relaxed">{RECORD_IMPORT.blurb}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(change) => {
            setUrl(change.target.value);
            if (outcome || applied) {
              setOutcome(null);
              setDiff([]);
              setApplied(null);
            }
          }}
          // Not inside the corner's form, so Enter here looks a link up rather
          // than saving a name the promoter has not finished typing.
          onKeyDown={(key) => {
            if (key.key === "Enter") {
              key.preventDefault();
              look();
            }
          }}
          className={inputClass}
          placeholder={RECORD_IMPORT.placeholder}
          inputMode="url"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={look}
          disabled={pending || !url.trim()}
          className="border-hairline hover:border-chalk/40 label shrink-0 border px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? RECORD_IMPORT.looking : RECORD_IMPORT.look}
        </button>
      </div>

      {/* A link that is not a fighter page has its own sentence, because "that
          did not work" does not tell somebody what a working one looks like. */}
      {outcome && !outcome.ok ? (
        <p className="text-red-corner-hot text-[0.7rem] leading-relaxed">
          {outcome.kind === "not-a-profile" ? RECORD_IMPORT.notAProfile : outcome.reason}
        </p>
      ) : null}

      {tape ? (
        <div className="border-hairline grid gap-1.5 border-t pt-2">
          <p className="text-ash text-[0.7rem] leading-relaxed">
            Found {tape.name ?? "a profile"} on {source}
            {tape.recordKind === "professional"
              ? ", and that is the professional record rather than the amateur one"
              : null}
            .
          </p>

          {diff.length ? (
            <div className="divide-hairline grid divide-y">
              {diff.map((row) => (
                <div key={row.key} className="grid grid-cols-[4.5rem_1fr] items-baseline gap-2 py-1.5">
                  <span className="label">{row.label}</span>
                  {row.fills ? (
                    <span className="text-chalk text-xs">
                      <span className="text-ash-dim">—</span> → {row.to}
                    </span>
                  ) : (
                    <span className="text-ash text-xs">
                      {row.from}
                      <span className="text-ash-dim">
                        {" "}
                        · {source} says {row.to}, {RECORD_IMPORT.kept}
                      </span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {fills.length ? (
            <>
              <button
                type="button"
                onClick={apply}
                disabled={pending}
                className="border-chalk/60 hover:bg-chalk hover:text-ink label justify-self-start border px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {pending ? RECORD_IMPORT.applying : RECORD_IMPORT.apply}
              </button>
              <p className="text-ash-dim text-[0.65rem] leading-relaxed">
                {RECORD_IMPORT.caution}
              </p>
            </>
          ) : (
            <p className="text-ash-dim text-[0.7rem] leading-relaxed">{RECORD_IMPORT.nothing}</p>
          )}
        </div>
      ) : null}

      {applied ? (
        <p
          className={cx(
            "text-[0.7rem] leading-relaxed",
            applied.length ? "text-gold" : "text-ash-dim",
          )}
        >
          {applied.length
            ? `${RECORD_IMPORT.applied}: ${applied.join(", ").toLowerCase()}.`
            : RECORD_IMPORT.nothing}
        </p>
      ) : null}

      <ActionStatus error={error} />
    </div>
  );
}
