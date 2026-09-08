import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/promoter/login/LoginForm";
import { currentPromoter } from "@/lib/session";

export const metadata: Metadata = {
  title: "Promoter sign in — EventIQ",
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/promoter/login">) {
  if (await currentPromoter()) redirect("/promoter");

  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : "/promoter"} />;
}
