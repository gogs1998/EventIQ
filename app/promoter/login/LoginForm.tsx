"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/promoter/login/actions";

const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2.5 text-chalk text-sm outline-none focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

export function LoginForm({ next }: { next: string }) {
  const [error, submit, pending] = useActionState(login, null);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-20">
      <span className="label">EventIQ</span>
      <h1 className="display mt-3 text-4xl">Promoter sign in</h1>
      <p className="text-ash mt-3 text-sm leading-relaxed">
        Your card, your chase list and your sponsor sheet.
      </p>

      <form action={submit} className="mt-8 grid gap-5">
        <input type="hidden" name="next" value={next} />

        <label className="block">
          <span className="label">Promoter</span>
          <div className="mt-1.5">
            <input
              name="slug"
              className={inputClass}
              placeholder="cage-county"
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="label">Password</span>
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
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>

      <Link href="/" className="text-ash-dim hover:text-chalk mt-8 text-xs transition-colors">
        Back to EventIQ
      </Link>
    </main>
  );
}
