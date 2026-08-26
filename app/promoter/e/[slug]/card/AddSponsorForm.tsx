"use client";

import { useRef, useTransition } from "react";
import { addSponsor } from "@/app/promoter/actions";
import { Field, inputClass } from "@/app/promoter/e/[slug]/card/fields";

export function AddSponsorForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      action={(data) =>
        start(async () => {
          await addSponsor(slug, data);
          form.current?.reset();
        })
      }
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
    </form>
  );
}
