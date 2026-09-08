"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { setPasswordFromReset } from "@/app/promoter/reset/[token]/actions";
import { ActionStatus } from "@/components/ActionStatus";
import { ACCOUNT_COPY, RESET_COPY } from "@/lib/copy";

const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2.5 text-chalk text-sm outline-none focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

export function ResetForm({ token }: { token: string }) {
  const [result, submit, pending] = useActionState(setPasswordFromReset, null);
  const [, start] = useTransition();

  // Once it is set the link is spent, so the form goes rather than sitting there
  // inviting a second attempt that can only fail.
  if (result?.ok) {
    return (
      <div className="mt-8">
        <p className="text-gold text-sm leading-relaxed">{RESET_COPY.done}</p>
        <Link
          href="/promoter/login"
          className="border-hairline hover:border-chalk/40 label mt-5 inline-block border px-3 py-2 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(() => submit(data));
      }}
      className="mt-8 grid gap-5"
    >
      <input type="hidden" name="token" value={token} />

      <label className="block">
        <span className="label">{ACCOUNT_COPY.newLabel}</span>
        <div className="mt-1.5">
          <input
            name="next"
            type="password"
            className={inputClass}
            autoComplete="new-password"
            required
          />
        </div>
      </label>

      <label className="block">
        <span className="label">{ACCOUNT_COPY.confirmLabel}</span>
        <div className="mt-1.5">
          <input
            name="confirm"
            type="password"
            className={inputClass}
            autoComplete="new-password"
            required
          />
        </div>
      </label>

      <p className="text-ash-dim text-xs leading-relaxed">{ACCOUNT_COPY.hint}</p>

      <ActionStatus error={result && !result.ok ? result.error : null} />

      <button
        type="submit"
        disabled={pending}
        className="bg-chalk text-ink display hover:bg-gold w-full py-3.5 text-lg transition-colors disabled:opacity-50"
      >
        {pending ? RESET_COPY.pending : RESET_COPY.submit}
      </button>
    </form>
  );
}
