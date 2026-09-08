import Link from "next/link";
import { NOT_FOUND } from "@/lib/copy";

/**
 * Any address with nothing behind it that is not under `/e` or `/promoter`,
 * both of which say something more specific about what is missing.
 *
 * Branded, because everything else this catches is one of ours: the pitch page,
 * the importer note, a mistyped marketing URL. The masthead above it is the one
 * `lib/masthead.ts` chose for the address, so this needs no name of its own.
 */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-24">
      <span className="label">Not found</span>
      <h1 className="display mt-3 text-4xl">{NOT_FOUND.heading}</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">{NOT_FOUND.body}</p>
      <Link
        href="/"
        className="border-chalk/60 hover:bg-chalk hover:text-ink display mt-8 self-start border px-5 py-2.5 text-base transition-colors"
      >
        {NOT_FOUND.action}
      </Link>
    </main>
  );
}
