"use client";

import { useRef, useState, useTransition } from "react";
import { removeSponsorMark, replaceSponsorMark } from "@/app/promoter/sponsor-actions";
import { Field } from "@/app/promoter/e/[slug]/card/fields";
import { ActionStatus } from "@/components/ActionStatus";
import { SponsorLockup } from "@/components/SponsorLockup";
import { mediaKeyOf } from "@/lib/portrait";
import type { Sponsor } from "@/lib/types";

/**
 * One sponsor the promoter already has, with its emblem.
 *
 * An emblem could only be set at the moment a sponsor was created, so a promoter
 * who added one without artwork, or sent the wrong file, had no way back except
 * deleting the sponsor — which takes the bout placements they had sold with it.
 *
 * Removing is offered only for an emblem the promoter uploaded. `mediaKeyOf`
 * answers that: the curated marks under public/sponsors are files in the
 * repository, so they are not ours to take off a row on a promoter's press, and
 * a lockup with no artwork at all has nothing to remove.
 *
 * Nothing here touches the name. It is set in the programme's own type beside
 * the emblem, which is why a real business's name can never come out misspelled
 * by a picture, and it is why an emblem is safe to remove: the sponsor keeps its
 * place on the card either way.
 */
export function SponsorRow({ slug, sponsor }: { slug: string; sponsor: Sponsor }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const uploaded = mediaKeyOf(sponsor.mark) !== null;

  return (
    <div className="border-hairline grid gap-3 border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SponsorLockup sponsor={sponsor} size="md" />
        {uploaded ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await removeSponsorMark(slug, sponsor.id);
                setError(result.ok ? null : result.error);
              })
            }
            className="border-hairline hover:border-chalk/40 label shrink-0 border px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            Remove the emblem
          </button>
        ) : null}
      </div>

      <form
        ref={form}
        // Own submit rather than the `action` prop, for the same reason as the
        // add form: React resets an uncontrolled form the moment the action
        // returns, which would clear the chosen file behind a refusal saying
        // what was wrong with it.
        onSubmit={(submit) => {
          submit.preventDefault();
          const data = new FormData(submit.currentTarget);
          start(async () => {
            const result = await replaceSponsorMark(slug, sponsor.id, data);
            setError(result.ok ? null : result.error);
            if (result.ok) form.current?.reset();
          });
        }}
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <Field label={uploaded ? "A different emblem" : "Emblem"}>
          <input
            type="file"
            name="mark"
            accept="image/png,image/webp,image/jpeg"
            className="text-ash file:border-hairline file:bg-panel file:text-chalk w-full text-xs file:mr-3 file:border file:px-3 file:py-1.5 file:text-xs"
          />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="border-chalk/60 hover:bg-chalk hover:text-ink label border px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {pending ? "Saving…" : uploaded ? "Replace it" : "Add an emblem"}
        </button>
      </form>

      <ActionStatus error={error} />
    </div>
  );
}
