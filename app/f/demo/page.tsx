import type { Metadata } from "next";
import Link from "next/link";
import { Questionnaire } from "@/components/Questionnaire";
import { boutsTopDown, cornersOf } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadShowcase } from "@/lib/db/queries";
import { completeness } from "@/lib/tape";

export const metadata: Metadata = {
  title: "Your fighter profile — EventIQ",
  description:
    "What a fighter gets sent: one link, no account, and their own tale of the tape at the end of it.",
};

/** Reads the published card, so it cannot be baked in at build time. */
export const dynamic = "force-dynamic";

/**
 * The questionnaire with nothing behind it.
 *
 * A promoter showing this to a room, and anybody arriving from the pitch page,
 * needs to be able to type in it and watch the card fill up. Doing that against
 * a real fighter's profile would edit a real fighter's profile, so this runs the
 * same component with no save, no submit and no upload, and says so at the foot
 * of the form. The bout and the opponent are real rows from the published card,
 * because a preview built from a second set of invented data is a second thing
 * to keep in step.
 */
export default async function FighterDemoPage() {
  const card = await loadShowcase(await getDb());
  if (!card) {
    return (
      <main className="mx-auto w-full max-w-xl px-5 py-24">
        <h1 className="display text-3xl">Nothing to preview yet</h1>
        <p className="text-ash mt-4 text-sm leading-relaxed">
          This shows the form a fighter gets, filled in against a real bout. There is no
          published show on this instance.
        </p>
        <Link href="/" className="label hover:text-chalk mt-6 inline-block">
          Back to EventIQ
        </Link>
      </main>
    );
  }

  // The emptiest fighter on the card, so the preview opens on a blank form the
  // way a fighter's own link does rather than on somebody else's finished one.
  const bouts = boutsTopDown(card);
  const candidates = bouts.flatMap((bout) => {
    const { red, blue } = cornersOf(card, bout);
    return [
      { bout, fighter: red, opponent: blue },
      { bout, fighter: blue, opponent: red },
    ];
  });
  const pick = candidates.reduce((emptiest, row) =>
    completeness(row.fighter).score < completeness(emptiest.fighter).score ? row : emptiest,
  );

  return (
    <Questionnaire
      card={card}
      bout={pick.bout}
      fighter={pick.fighter}
      opponent={pick.opponent}
      mode="preview"
    />
  );
}
