"use client";

import { useActionState, useState, useTransition } from "react";
import { removeBout, updateBout, updateFighter } from "@/app/promoter/actions";
import {
  DISCIPLINES,
  DISCIPLINE_NAME,
  Field,
  inputClass,
} from "@/app/promoter/e/[slug]/card/fields";
import { boutBillingLabel, boutClassLine } from "@/lib/tape";
import type { Bout, Fighter, Sponsor } from "@/lib/types";

/**
 * One line of the matchmaking sheet.
 *
 * Collapsed to a summary until it is opened, because a fifteen-bout card with
 * every field expanded is unreadable and the common case is checking the card
 * rather than changing it.
 */
export function BoutRow({
  slug,
  bout,
  red,
  blue,
  sponsors,
}: {
  slug: string;
  bout: Bout;
  red: Fighter;
  blue: Fighter;
  sponsors: Sponsor[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="border-hairline border">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="hover:bg-panel/40 flex w-full items-center justify-between gap-4 p-3 text-left transition-colors"
      >
        <div className="min-w-0">
          <div className="display text-chalk truncate text-base">
            {red.name} <span className="text-ash-dim">v</span> {blue.name}
          </div>
          <div className="text-ash-dim mt-0.5 truncate text-[0.65rem]">
            {boutBillingLabel(bout)} · {boutClassLine(bout)}
          </div>
        </div>
        <span className="text-ash-dim shrink-0 text-lg">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="border-hairline grid gap-6 border-t p-4">
          <form
            action={(form) => start(() => void updateBout(slug, bout.number, form))}
            className="grid gap-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Discipline">
                <select name="discipline" className={inputClass} defaultValue={bout.discipline}>
                  {DISCIPLINES.map((value) => (
                    <option key={value} value={value}>
                      {DISCIPLINE_NAME[value]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Weight kg">
                <input
                  name="weightKg"
                  inputMode="numeric"
                  className={inputClass}
                  defaultValue={bout.weightKg}
                />
              </Field>
              <Field label="Rounds">
                <input
                  name="rounds"
                  inputMode="numeric"
                  className={inputClass}
                  defaultValue={bout.rounds}
                />
              </Field>
              <Field label="Minutes">
                <input
                  name="roundMinutes"
                  inputMode="numeric"
                  className={inputClass}
                  defaultValue={bout.roundMinutes}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Grade">
                <input
                  name="classLabel"
                  className={inputClass}
                  defaultValue={bout.classLabel ?? ""}
                  placeholder="C CLASS"
                />
              </Field>
              <Field label="Billing">
                <select name="billing" className={inputClass} defaultValue={bout.billing ?? ""}>
                  <option value="">Undercard</option>
                  <option value="CO_MAIN">Co main</option>
                  <option value="MAIN">Main event</option>
                </select>
              </Field>
              <Field label="Bout sponsor">
                <select name="sponsorId" className={inputClass} defaultValue={bout.sponsorId ?? ""}>
                  <option value="">Unsold</option>
                  {sponsors.map((sponsor) => (
                    <option key={sponsor.id} value={sponsor.id}>
                      {sponsor.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title on the line">
                <input
                  name="titleLabel"
                  className={inputClass}
                  defaultValue={bout.titleLabel ?? ""}
                  placeholder="Amateur Featherweight Title"
                />
              </Field>
              <label className="flex items-end gap-2 pb-2">
                <input
                  type="checkbox"
                  name="womens"
                  defaultChecked={bout.womens}
                  className="accent-chalk h-4 w-4"
                />
                <span className="label">Women&rsquo;s bout</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="border-chalk/60 hover:bg-chalk hover:text-ink display justify-self-start border px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
            >
              Save the bout
            </button>
          </form>

          <div className="border-hairline grid gap-4 border-t pt-4 sm:grid-cols-2">
            {(
              [
                [red, "Red corner", "border-red-corner"],
                [blue, "Blue corner", "border-blue-corner"],
              ] as const
            ).map(([fighter, label, accent]) => (
              <CornerForm
                key={fighter.id}
                slug={slug}
                fighter={fighter}
                label={label}
                accent={accent}
              />
            ))}
          </div>

          <div className="border-hairline border-t pt-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Take ${red.name} v ${blue.name} off the card?`)) {
                  start(() => void removeBout(slug, bout.number));
                }
              }}
              className="border-red-corner/50 text-red-corner-hot hover:border-red-corner label border px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              Remove this bout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One corner's name and gym.
 *
 * Its own component so it can hold its own refusal: the two corners are two
 * forms, and a message from one of them belongs under that one rather than under
 * both.
 */
function CornerForm({
  slug,
  fighter,
  label,
  accent,
}: {
  slug: string;
  fighter: Fighter;
  label: string;
  accent: string;
}) {
  const [error, submit, pending] = useActionState(
    (_state: string | null, form: FormData) => updateFighter(slug, fighter.id, form),
    null,
  );

  return (
    <form action={submit} className={`grid gap-3 border-l-2 pl-3 ${accent}`}>
      <span className="label">{label}</span>
      <Field label="Name">
        <input name="name" className={inputClass} defaultValue={fighter.name} />
      </Field>
      <Field label="Gym">
        <input name="gym" className={inputClass} defaultValue={fighter.gym} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="border-hairline hover:border-chalk/40 label justify-self-start border px-3 py-1.5 transition-colors disabled:opacity-50"
      >
        Save
      </button>
      {error ? <p className="text-red-corner-hot text-xs leading-relaxed">{error}</p> : null}
      <p className="text-ash-dim text-[0.65rem] leading-relaxed">
        Everything else on this fighter comes from their own form, so it is not editable
        here.
      </p>
    </form>
  );
}
