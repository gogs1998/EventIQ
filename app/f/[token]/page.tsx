import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { markOpened, saveDraft, submitProfile, uploadPhoto } from "@/app/f/[token]/actions";
import { Questionnaire } from "@/components/Questionnaire";
import { cornersOf } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadCard, loadInviteByToken } from "@/lib/db/queries";

/**
 * A fighter's own page, reached by the token in the link and nothing else.
 *
 * Never indexed and never listed anywhere. The token is the whole of the
 * authorisation, so an address that reached a search index would be an address
 * anybody could edit from.
 */
export const metadata: Metadata = {
  title: "Your fighter profile — EventIQ",
  robots: { index: false, follow: false },
};

export default async function FighterFormPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const db = await getDb();

  const row = await loadInviteByToken(db, token);
  if (!row) notFound();

  const card = await loadCard(db, row.event.slug);
  if (!card) notFound();

  const bout = card.event.bouts.find(
    (b) => b.redId === row.fighter.id || b.blueId === row.fighter.id,
  );
  if (!bout) notFound();

  const { red, blue } = cornersOf(card, bout);
  const isRed = bout.redId === row.fighter.id;

  // Recorded on the way in rather than from an effect in the browser. The
  // promoter's whole nudge decision turns on this timestamp, so it must not be
  // something an ad blocker or a tab closed after two seconds can swallow.
  await markOpened(token);

  return (
    <Questionnaire
      card={card}
      bout={bout}
      fighter={isRed ? red : blue}
      opponent={isRed ? blue : red}
      mode="live"
      alreadySubmitted={!!row.invite.submittedAt}
      save={saveDraft.bind(null, token)}
      submit={submitProfile.bind(null, token)}
      upload={uploadPhoto.bind(null, token)}
    />
  );
}
