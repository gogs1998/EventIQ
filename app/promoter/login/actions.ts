"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { withinLoginLimit } from "@/lib/rate-limit";
import { attemptLogin } from "@/lib/session";
import { signIn, signOut } from "@/lib/session";

/** The one message, whatever went wrong. */
const REFUSED = "Those details were not recognised. Check the promoter name and the password.";

/**
 * One promoter, one password.
 *
 * A wrong password, an unknown promoter, a caller who has already had their ten
 * tries this minute and an account that has locked itself all give the same
 * message and take about the same time, so the form cannot be used to find out
 * which promoters exist or whether a guess is getting closer.
 *
 * The limiter is asked before the password is checked, so a flood costs a
 * counter rather than a PBKDF2 derivation each — it is the expensive half of
 * this action and doing it first would make the login form the cheapest way to
 * spend our CPU. See lib/rate-limit.ts, and lib/lockout.ts for the bound on
 * guessing one account from many addresses.
 *
 * The redirect target is checked to be a path on this site: an open redirect on
 * a login form is how a convincing phishing link gets built.
 */

/**
 * Where to send them afterwards, or `/promoter` where the address is not ours.
 *
 * "Starts with a slash" is not the test, and that is the whole of this function.
 * A browser resolving `Location: /\evil.com` against this origin reads the
 * backslash as a slash — the URL standard says so for http and https — so it
 * lands on `//evil.com`, which is another host, and the check that only refused
 * a leading `//` let it straight through. A phishing link then reads
 * `eventiq.win/promoter/login?next=…`, which is the whole point of building one.
 *
 * So anything after the leading slash that could begin an authority is refused,
 * and so is a control character, which some proxies will strip on the way out
 * and leave a different address behind. Whatever is refused goes to the
 * promoter's own index, which is where somebody signing in wanted to be anyway.
 */
function ourOwnPath(next: string): string {
  const ours = /^\/(?![/\\])[^\s\x00-\x1f\x7f\\]*$/.test(next);
  return ours ? next : "/promoter";
}
export async function login(_state: string | null, form: FormData): Promise<string | null> {
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/promoter");

  if (!slug || !password) return "Enter a promoter name and a password.";

  if (!(await withinLoginLimit(await headers()))) return REFUSED;

  const result = await attemptLogin(await getDb(), slug, password);
  if (!result.ok) return REFUSED;

  // A fresh cookie every time, so nothing a caller was holding before they
  // signed in survives into the session they end up with.
  await signIn(result.promoterId, result.sessionVersion);
  redirect(ourOwnPath(next));
}

export async function logout(): Promise<void> {
  await signOut();
  redirect("/");
}
