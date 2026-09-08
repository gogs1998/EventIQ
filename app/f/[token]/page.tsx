import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markOpened, saveDraft, submitProfile, uploadPhoto } from "@/app/f/[token]/actions";
import { removeMyDetails } from "@/app/f/[token]/consent-actions";
import {
  approveStylisedPortrait,
  discardStylisedPortrait,
  makeStylisedPortrait,
  stylisedPortraitsOffered,
} from "@/app/f/[token]/portrait-actions";
import { Questionnaire } from "@/components/Questionnaire";
import { boutsTopDown, cornersOf } from "@/lib/card";
import { getDb } from "@/lib/db";
import { loadCard, loadInviteByToken, inviteWasRevoked } from "@/lib/db/queries";
import { PRIVACY, REMOVAL } from "@/lib/copy";

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
  if (!row) {
    // A link the fighter switched off themselves says so, rather than answering
    // the same "there is nothing at this address" a made-up token gets. It is
    // also what the browser lands on immediately after the removal, because a
    // server action re-renders the page it was called from.
    if (await inviteWasRevoked(db, token)) return <DetailsRemoved />;
    notFound();
  }

  const card = await loadCard(db, row.event.slug);
  if (!card) notFound();

  // Through the running order, so a bout whose other corner is not on the card
  // is a page that is not there rather than a fighter's own link answering 500.
  const bout = boutsTopDown(card).find(
    (b) => b.redId === row.fighter.id || b.blueId === row.fighter.id,
  );
  if (!bout) notFound();

  const { red, blue } = cornersOf(card, bout);
  const isRed = bout.redId === row.fighter.id;

  // Recorded on the way in rather than from an effect in the browser. The
  // promoter's whole nudge decision turns on this timestamp, so it must not be
  // something an ad blocker or a tab closed after two seconds can swallow.
  await markOpened(token);

  // Decided here rather than guessed in the browser, so an instance with no AI
  // binding draws no control at all instead of one that always refuses.
  const offersStylised = await stylisedPortraitsOffered();

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
      consent={{
        at: row.invite.consentedAt ?? undefined,
        version: row.invite.consentVersion ?? undefined,
      }}
      remove={removeMyDetails.bind(null, token)}
      stylised={
        offersStylised
          ? {
              make: makeStylisedPortrait.bind(null, token),
              approve: approveStylisedPortrait.bind(null, token),
              discard: discardStylisedPortrait.bind(null, token),
            }
          : undefined
      }
    />
  );
}

/**
 * What is left of a fighter's page after they have asked for their details back.
 * The same words the control on the form uses, so pressing the button and
 * opening the link a week later say the same thing.
 */
function DetailsRemoved() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-24">
      <h1 className="display text-3xl">{REMOVAL.done.heading}</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">{REMOVAL.done.body}</p>
      <Link href="/privacy" className="label hover:text-chalk mt-6 inline-block">
        {PRIVACY.link}
      </Link>
    </main>
  );
}
