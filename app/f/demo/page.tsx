import type { Metadata } from "next";
import Link from "next/link";
import { Questionnaire } from "@/components/Questionnaire";
import { emptiestEntry } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadShowcase } from "@/lib/db/queries";

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
  if (!card) return <NothingToPreview because="There is no published show on this instance." />;

  // The emptiest fighter on the card, so the preview opens on a blank form the
  // way a fighter's own link does rather than on somebody else's finished one.
  // A show can be published before its running order is entered, in which case
  // there is no bout to build a form around and the page says so.
  const pick = emptiestEntry(card);
  if (!pick) {
    return (
      <NothingToPreview
        because={`${card.event.name} has no bouts on it yet, so there is no fighter to open the form as.`}
      />
    );
  }

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

/** The preview needs a real bout behind it, so it says which part is missing. */
function NothingToPreview({ because }: { because: string }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-24">
      <h1 className="display text-3xl">Nothing to preview yet</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">
        This shows the form a fighter gets, filled in against a real bout. {because}
      </p>
      <Link href="/" className="label hover:text-chalk mt-6 inline-block">
        Back to EventIQ
      </Link>
    </main>
  );
}
