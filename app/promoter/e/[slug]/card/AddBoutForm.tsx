"use client";

import { useRef, useState, useTransition } from "react";
import { addBout } from "@/app/promoter/actions";
import {
  DISCIPLINES,
  DISCIPLINE_NAME,
  Field,
  inputClass,
} from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";

export function AddBoutForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

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
        start(async () => {
          const result = await addBout(slug, data);
          setError(result.ok ? null : result.error);
          // Cleared only where the bout went in, so a promoter working down a
          // sheet can type the next line straight away.
          if (result.ok) form.current?.reset();
        });
      }}
      className="border-hairline mt-4 grid gap-4 border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-red-corner grid gap-3 border-l-2 pl-3">
          <span className="label">Red corner</span>
          <Field label="Name">
            <input name="redName" className={inputClass} placeholder="Owen Pryce" required />
          </Field>
          <Field label="Gym">
            <input name="redGym" className={inputClass} placeholder="Bryn MMA" />
          </Field>
        </div>
        <div className="border-blue-corner grid gap-3 border-l-2 pl-3">
          <span className="label">Blue corner</span>
          <Field label="Name">
            <input name="blueName" className={inputClass} placeholder="Danny Rook" required />
          </Field>
          <Field label="Gym">
            <input name="blueGym" className={inputClass} placeholder="Northgate" />
          </Field>
        </div>
      </div>

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
          <input name="weightKg" inputMode="decimal" className={inputClass} placeholder="70" />
        </Field>
        <Field label="Grade">
          <input name="classLabel" className={inputClass} placeholder="C CLASS" />
        </Field>
        <Field label="Rounds">
          <input name="rounds" inputMode="numeric" className={inputClass} placeholder="3" />
        </Field>
        <Field label="Minutes">
          <input name="roundMinutes" inputMode="numeric" className={inputClass} placeholder="3" />
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
      <ActionStatus error={error} />
    </form>
  );
}
