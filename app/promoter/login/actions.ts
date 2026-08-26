"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { attemptLogin } from "@/lib/session";
import { signIn, signOut } from "@/lib/session";

/**
 * One promoter, one password.
 *
 * A wrong password and an unknown promoter give the same message and take about
 * the same time, so the form cannot be used to find out which promoters exist.
 * The redirect target is checked to be a path on this site: an open redirect on
 * a login form is how a convincing phishing link gets built.
 */
export async function login(_state: string | null, form: FormData): Promise<string | null> {
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/promoter");

  if (!slug || !password) return "Enter a promoter name and a password.";

  const result = await attemptLogin(await getDb(), slug, password);
  if (!result.ok) return "Those details were not recognised. Check the promoter name and the password.";

  await signIn(result.promoterId);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/promoter");
}

export async function logout(): Promise<void> {
  await signOut();
  redirect("/");
}
