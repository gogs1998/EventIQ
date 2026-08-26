"use client";

import { useRef, useTransition } from "react";
import { addBout } from "@/app/promoter/actions";
import {
  DISCIPLINES,
  DISCIPLINE_NAME,
  Field,
  inputClass,
} from "@/app/promoter/e/[slug]/card/fields";

export function AddBoutForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      action={(data) =>
        start(async () => {
          await addBout(slug, data);
          // Cleared so a promoter working down a sheet can type the next line
          // straight away rather than selecting and deleting two names.
          form.current?.reset();
        })
      }
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
          <input name="weightKg" inputMode="numeric" className={inputClass} placeholder="70" />
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
    </form>
  );
}
