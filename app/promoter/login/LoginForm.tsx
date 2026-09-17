"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/promoter/login/actions";
import { LOGIN_COPY } from "@/lib/copy";

const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2.5 text-chalk text-sm focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

export function LoginForm({ next }: { next: string }) {
  const [error, submit, pending] = useActionState(login, null);

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-20">
      <h1 className="display text-4xl">Promoter sign in</h1>
      <p className="text-ash mt-3 text-sm leading-relaxed">
        Your card, your chase list and your sponsor sheet.
      </p>

      <form action={submit} className="mt-8 grid gap-5">
        <input type="hidden" name="next" value={next} />

        <label className="block">
          <span className="label">{LOGIN_COPY.slugLabel}</span>
          {/* Somebody signing in for the first time has two things from an
              operator and no way of telling which goes here. The prompt used to
              be a real promoter's slug, on a page anybody can open. */}
          <span className="text-ash-dim mt-1 block text-[0.7rem]">{LOGIN_COPY.slugHint}</span>
          <div className="mt-1.5">
            <input
              name="slug"
              className={inputClass}
              placeholder={LOGIN_COPY.slugPlaceholder}
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="label">{LOGIN_COPY.passwordLabel}</span>
          <div className="mt-1.5">
            <input
              name="password"
              type="password"
              className={inputClass}
              autoComplete="current-password"
              required
            />
          </div>
        </label>

        {error ? <p className="text-red-corner-hot text-xs leading-relaxed">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="bg-chalk text-ink display hover:bg-gold w-full py-3.5 text-lg transition-colors disabled:opacity-50"
        >
          {pending ? LOGIN_COPY.pending : LOGIN_COPY.submit}
        </button>
      </form>

      {/* The only route back for somebody who cannot get in. There is no reset
          form to link to — a reset link is minted by hand — so this says who
          does it rather than pointing at a page that does not exist. */}
      <p className="text-ash-dim mt-6 text-xs leading-relaxed">{LOGIN_COPY.lockedOut}</p>

      <Link href="/" className="text-ash-dim hover:text-chalk mt-6 text-xs transition-colors">
        Back to EventIQ
      </Link>
    </main>
  );
}
