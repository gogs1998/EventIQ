"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { changePassword } from "@/app/promoter/account/actions";
import { ActionStatus } from "@/components/ActionStatus";
import { ACCOUNT_COPY } from "@/lib/copy";

const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2.5 text-chalk text-sm focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function ChangePasswordForm() {
  const [result, submit, pending] = useActionState(changePassword, null);
  const [, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  // Emptied only once it has actually gone through. React would clear the boxes
  // on a refusal too if the action were handed to the `action` prop, and finding
  // out that two new passwords did not match by having all three fields wiped is
  // the same trap the new-show form already avoids.
  useEffect(() => {
    if (result?.ok) form.current?.reset();
  }, [result]);

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(() => submit(data));
      }}
      className="mt-6 grid max-w-sm gap-5"
    >
      <Field label={ACCOUNT_COPY.currentLabel}>
        <input
          name="current"
          type="password"
          className={inputClass}
          autoComplete="current-password"
          required
        />
      </Field>

      <Field label={ACCOUNT_COPY.newLabel}>
        <input
          name="next"
          type="password"
          className={inputClass}
          autoComplete="new-password"
          required
        />
      </Field>

      <Field label={ACCOUNT_COPY.confirmLabel}>
        <input
          name="confirm"
          type="password"
          className={inputClass}
          autoComplete="new-password"
          required
        />
      </Field>

      <p className="text-ash-dim text-xs leading-relaxed">{ACCOUNT_COPY.hint}</p>

      <ActionStatus error={result && !result.ok ? result.error : null} />
      {result?.ok ? (
        <p role="status" className="text-gold text-xs leading-relaxed">
          {ACCOUNT_COPY.changed}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="bg-chalk text-ink display hover:bg-gold justify-self-start px-6 py-3 text-lg transition-colors disabled:opacity-50"
      >
        {pending ? ACCOUNT_COPY.pending : ACCOUNT_COPY.submit}
      </button>
    </form>
  );
}
