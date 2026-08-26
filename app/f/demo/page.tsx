import type { Metadata } from "next";
import { Questionnaire } from "@/components/Questionnaire";

export const metadata: Metadata = {
  title: "Your fighter profile — EventIQ",
  description:
    "What a fighter gets sent: one link, no account, and their own tale of the tape at the end of it.",
};

export default function FighterDemoPage() {
  return <Questionnaire />;
}
