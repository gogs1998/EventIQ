import Link from "next/link";
import { SHOW_NOT_FOUND } from "@/lib/copy";

/**
 * A show the signed-in promoter cannot see.
 *
 * The dashboard and the card editor call `notFound()` for a show that does not
 * exist and for one belonging to somebody else alike, so that guessing another
 * promoter's slug tells you nothing. That is why this page names neither the
 * slug nor the reason — the wording has to be true of both cases.
 */
export default function ShowNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-24">
      <span className="label">Promoter view</span>
      <h1 className="display mt-3 text-4xl">{SHOW_NOT_FOUND.heading}</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">{SHOW_NOT_FOUND.body}</p>
      <Link
        href="/promoter"
        className="border-chalk/60 hover:bg-chalk hover:text-ink display mt-8 self-start border px-5 py-2.5 text-base transition-colors"
      >
        {SHOW_NOT_FOUND.action}
      </Link>
    </main>
  );
}
