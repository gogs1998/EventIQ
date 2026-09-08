import { PROGRAMME_NOT_FOUND } from "@/lib/copy";

/**
 * A spectator with a link to a programme that will not open.
 *
 * `loadVisibleCard` answers the same way for a show that does not exist and one
 * that is not published yet, so this cannot say which — and it should not want
 * to. The likeliest reader is somebody standing in a venue with a code that was
 * printed before the card went live, so it says what to do rather than what is
 * wrong, and it says nothing about the promoter.
 *
 * No EventIQ mark, in line with every other page under `/e`. The masthead is
 * already absent here by `lib/masthead.ts`, and nothing is added back.
 */
export default function ProgrammeNotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-24">
      <h1 className="display text-4xl">{PROGRAMME_NOT_FOUND.heading}</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">{PROGRAMME_NOT_FOUND.body}</p>
    </main>
  );
}
