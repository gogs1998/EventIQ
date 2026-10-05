"use client";

import { useState, useTransition } from "react";
import { setTicketLink } from "@/app/promoter/actions";
import { Field, inputClass } from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";
import { TICKET_LINK } from "@/lib/copy";
import { MAX_TICKET_URL } from "@/lib/ticket-link";

/**
 * The show's ticket link. The `type="url"` and the length cap are a courtesy to
 * the promoter typing; the rule is `parseTicketUrl` in the action.
 */
export function TicketLinkForm({ slug, ticketUrl }: { slug: string; ticketUrl?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <form
      // Own submit, as in EventForm: a refusal must leave the typed address in
      // the box rather than putting the stored one back over it.
      onSubmit={(submit) => {
        submit.preventDefault();
        const data = new FormData(submit.currentTarget);
        start(async () => {
          const result = await setTicketLink(slug, data);
          setError(result.ok ? null : result.error);
          setSaved(result.ok ? (result.ticketUrl ? TICKET_LINK.saved : TICKET_LINK.cleared) : null);
        });
      }}
      className="mt-4 grid gap-3"
    >
      <Field label={TICKET_LINK.hint}>
        <input
          name="ticketUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          maxLength={MAX_TICKET_URL}
          placeholder={TICKET_LINK.placeholder}
          className={inputClass}
          defaultValue={ticketUrl ?? ""}
          onChange={() => setSaved(null)}
        />
      </Field>
      <p className="text-ash max-w-2xl text-xs leading-relaxed">{TICKET_LINK.note}</p>
      <button
        type="submit"
        disabled={pending}
        className="border-chalk/60 hover:bg-chalk hover:text-ink display justify-self-start border px-5 py-2 text-base transition-colors disabled:opacity-50"
      >
        {pending ? TICKET_LINK.saving : TICKET_LINK.save}
      </button>
      <ActionStatus error={error} done={saved} />
    </form>
  );
}
