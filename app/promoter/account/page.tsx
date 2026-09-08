import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/app/promoter/account/ChangePasswordForm";
import { SignOutButton } from "@/app/promoter/SignOutButton";
import { ACCOUNT_COPY } from "@/lib/copy";
import { currentPromoter } from "@/lib/session";

export const metadata: Metadata = {
  title: "Your account — EventIQ",
  robots: { index: false },
};

/**
 * The only thing a promoter can change about their own account.
 *
 * There is no name, no email and no photograph here because there is nothing
 * else the account holds: promoters are created by an operator, and the show is
 * where everything else about them lives. A settings page listing one control is
 * honest about that rather than padded out.
 */
export default async function AccountPage() {
  const promoter = await currentPromoter();
  if (!promoter) redirect("/promoter/login?next=/promoter/account");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <header className="border-hairline flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <span className="label">Account</span>
          <h1 className="display mt-2 text-4xl">{promoter.name}</h1>
          <p className="text-ash mt-2 text-sm">Signed in as {promoter.slug}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mt-8">
        <h2 className="display text-2xl">{ACCOUNT_COPY.heading}</h2>
        <p className="text-ash mt-3 max-w-prose text-sm leading-relaxed">{ACCOUNT_COPY.body}</p>
        <ChangePasswordForm />
      </section>

      <Link href="/promoter" className="text-ash-dim hover:text-chalk mt-10 inline-block text-xs transition-colors">
        Back to your shows
      </Link>
    </main>
  );
}
