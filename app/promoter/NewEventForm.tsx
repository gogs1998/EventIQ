"use client";

import { useActionState } from "react";
import { createEvent } from "@/app/promoter/actions";

const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2.5 text-chalk text-sm outline-none focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function NewEventForm() {
  const [error, submit, pending] = useActionState(createEvent, null);

  return (
    <form action={submit} className="mt-4 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Show name">
          <input name="name" className={inputClass} placeholder="Cage County 13" required />
        </Field>
        <Field label="Date">
          <input name="date" type="date" className={inputClass} required />
        </Field>
        <Field label="Venue">
          <input name="venue" className={inputClass} placeholder="Winter Gardens" />
        </Field>
        <Field label="Town">
          <input name="city" className={inputClass} placeholder="Blackpool" />
        </Field>
        <Field label="Doors">
          <input name="doorsTime" className={inputClass} placeholder="18:00" />
        </Field>
        <Field label="First bell">
          <input name="firstBellTime" className={inputClass} placeholder="19:00" />
        </Field>
      </div>

      <Field label="Sanctioning body">
        <input name="sanctioning" className={inputClass} placeholder="Sanctioned by …" />
      </Field>

      {error ? <p className="text-red-corner-hot text-xs">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-chalk text-ink display hover:bg-gold justify-self-start px-6 py-3 text-lg transition-colors disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create the show"}
      </button>
      <p className="text-ash-dim text-xs leading-relaxed">
        It starts unpublished, so you can put the card in and check it before anybody can
        scan a code and read it.
      </p>
    </form>
  );
}
