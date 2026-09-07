"use client";

import { useRef, useState, useTransition } from "react";
import { addSponsor } from "@/app/promoter/actions";
import { Field, inputClass } from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";

export function AddSponsorForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      // Own submit rather than the `action` prop, so React's automatic reset of
      // an uncontrolled form does not clear a sponsor's name and link the moment
      // the row is refused. See the note in AddBoutForm.
      onSubmit={(submit) => {
        submit.preventDefault();
        const data = new FormData(submit.currentTarget);
        start(async () => {
          const result = await addSponsor(slug, data);
          setError(result.ok ? null : result.error);
          if (result.ok) form.current?.reset();
        });
      }}
      className="border-hairline mt-4 grid gap-4 border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input name="name" className={inputClass} placeholder="Moore Equipment Hire" required />
        </Field>
        <Field label="Second line">
          <input name="qualifier" className={inputClass} placeholder="Equipment Hire" />
        </Field>
        <Field label="Link">
          <input name="url" className={inputClass} placeholder="https://…" inputMode="url" />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="showSponsor" className="accent-chalk h-4 w-4" />
        <span className="label">Show sponsor — goes on the strip at the foot of the card</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="border-chalk/60 hover:bg-chalk hover:text-ink display justify-self-start border px-5 py-2 text-base transition-colors disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add the sponsor"}
      </button>
      <ActionStatus error={error} />
    </form>
  );
}
