"use client";

import { useState, useTransition } from "react";
import { updateEvent } from "@/app/promoter/actions";
import { Field, inputClass } from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";
import type { FightEvent } from "@/lib/types";

export function EventForm({ slug, event }: { slug: string; event: FightEvent }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      // Own submit rather than the `action` prop: React resets an uncontrolled
      // form once an action returns, which on a refusal throws away the edit and
      // puts the stored values back without saying it has. See AddBoutForm.
      onSubmit={(submit) => {
        submit.preventDefault();
        const data = new FormData(submit.currentTarget);
        start(async () => {
          const result = await updateEvent(slug, data);
          setError(result.ok ? null : result.error);
        });
      }}
      className="mt-4 grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Show name">
          <input name="name" className={inputClass} defaultValue={event.name} />
        </Field>
        <Field label="Date">
          <input name="date" type="date" className={inputClass} defaultValue={event.date} />
        </Field>
        <Field label="Venue">
          <input name="venue" className={inputClass} defaultValue={event.venue} />
        </Field>
        <Field label="Town">
          <input name="city" className={inputClass} defaultValue={event.city} />
        </Field>
        <Field label="Doors">
          <input name="doorsTime" className={inputClass} defaultValue={event.doorsTime} />
        </Field>
        <Field label="First bell">
          <input
            name="firstBellTime"
            className={inputClass}
            defaultValue={event.firstBellTime}
          />
        </Field>
      </div>

      <Field label="Tagline">
        <input name="tagline" className={inputClass} defaultValue={event.tagline ?? ""} />
      </Field>
      <Field label="Sanctioning body">
        <input
          name="sanctioning"
          className={inputClass}
          defaultValue={event.sanctioning ?? ""}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="border-chalk/60 hover:bg-chalk hover:text-ink display justify-self-start border px-5 py-2 text-base transition-colors disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save the show"}
      </button>
      <ActionStatus error={error} />
    </form>
  );
}
