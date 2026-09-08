import type { Metadata } from "next";
import Link from "next/link";
import { CONSENT_VERSION } from "@/lib/consent";
import { PRIVACY } from "@/lib/copy";

/**
 * The privacy notice.
 *
 * DRAFT, AND NOT LEGAL ADVICE. It is written to be read by a fighter rather
 * than by a lawyer, and it has not been checked by one.
 *
 * The position it states, which is the part to have checked: the **promoter** is
 * the controller — it is their show, their card, their decision what is asked
 * for and what is published — and **EventIQ is the processor**, storing and
 * rendering it on their instruction and doing nothing else with it. Those two
 * words are deliberately not on the page, because they mean nothing to the
 * person filling in the questionnaire, but they are what the page describes in
 * plain words and they are what a lawyer should be asked to confirm. Two things
 * sit awkwardly with that split and want raising at the same time: the fighters
 * table is global rather than owned by a promoter (HANDOVER section 19 item 11),
 * and the lawful basis for publishing is not stated anywhere yet — consent is
 * what the questionnaire takes, and whether consent or legitimate interests is
 * the right basis for a public programme is exactly the question to ask.
 *
 * The copy itself is in lib/copy.ts so it is tested with the rest of the product's
 * sentences, and the retention figure comes from lib/consent.ts so the notice
 * and scripts/retention.mjs cannot drift apart.
 */
export const metadata: Metadata = {
  title: "Privacy notice — EventIQ",
  description:
    "What EventIQ collects from fighters on a digital fight programme, where it is shown, how " +
    "long it is kept and how to have it removed.",
};

export default function PrivacyPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-16">
      <h1 className="display text-4xl">{PRIVACY.title}</h1>
      <p className="text-ash mt-4 text-sm leading-relaxed">{PRIVACY.intro}</p>

      <div className="mt-10 grid gap-8">
        {PRIVACY.sections.map((section) => (
          <section key={section.heading} className="border-hairline border-t pt-6">
            <h2 className="display text-chalk text-xl">{section.heading}</h2>
            <p className="text-ash mt-2 text-sm leading-relaxed">{section.body}</p>
          </section>
        ))}
      </div>

      {/* The version stamp, so a fighter asking what they agreed to can be
          answered with a date rather than with today's wording. */}
      <p className="text-ash-dim border-hairline mt-10 border-t pt-6 text-xs leading-relaxed">
        Consent wording version {CONSENT_VERSION}.
      </p>

      <Link href="/" className="label hover:text-chalk mt-6 inline-block">
        Back to EventIQ
      </Link>
    </main>
  );
}
