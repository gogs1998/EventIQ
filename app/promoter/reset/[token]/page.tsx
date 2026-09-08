import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ResetForm } from "@/app/promoter/reset/[token]/ResetForm";
import { digestToken } from "@/lib/auth";
import { RESET_COPY } from "@/lib/copy";
import { getDb } from "@/lib/db";
import { resetUsable } from "@/lib/password-reset";

export const metadata: Metadata = {
  title: "Set a new password — EventIQ",
  robots: { index: false },
};

/**
 * The page a reset link opens.
 *
 * It is reachable signed out, which is the whole point of it, so it is deliberately
 * outside the pattern in proxy.ts that sends the promoter area to the login form.
 *
 * The link is looked up here only to decide which of two things to render. The
 * check that matters is in the action, because this page is a GET and the action
 * is reachable without it — the same reason no route decides on its own who may
 * see a card.
 */
async function linkIsLive(token: string): Promise<boolean> {
  const [reset] = await (await getDb())
    .select({
      expiresAt: schema.passwordResets.expiresAt,
      usedAt: schema.passwordResets.usedAt,
    })
    .from(schema.passwordResets)
    .where(eq(schema.passwordResets.tokenDigest, await digestToken(token)))
    .limit(1);

  return reset ? resetUsable(reset, Date.now()) : false;
}

export default async function ResetPage({ params }: PageProps<"/promoter/reset/[token]">) {
  const { token } = await params;
  const live = await linkIsLive(token);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-20">
      <h1 className="display text-4xl">{live ? RESET_COPY.heading : RESET_COPY.deadHeading}</h1>
      <p className="text-ash mt-3 text-sm leading-relaxed">
        {live ? RESET_COPY.body : RESET_COPY.deadBody}
      </p>

      {live ? (
        <>
          <p className="text-ash-dim mt-2 text-xs leading-relaxed">{RESET_COPY.life}</p>
          <ResetForm token={token} />
        </>
      ) : null}

      <Link
        href="/promoter/login"
        className="text-ash-dim hover:text-chalk mt-8 text-xs transition-colors"
      >
        Promoter sign in
      </Link>
    </main>
  );
}
