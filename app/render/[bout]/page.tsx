import { notFound } from "next/navigation";
import { RenderStage } from "@/components/sequence/RenderStage";
import { event } from "@/data/event";

/**
 * Capture surface for the mp4 exporter. Not linked from anywhere in the
 * programme; it exists so headless Chrome has a stable page to screenshot.
 */
export function generateStaticParams() {
  return event.bouts.map((bout) => ({ bout: String(bout.number) }));
}

export default async function RenderPage({ params }: PageProps<"/render/[bout]">) {
  const { bout } = await params;
  const boutNumber = Number(bout);
  if (!event.bouts.some((b) => b.number === boutNumber)) notFound();

  return <RenderStage boutNumber={boutNumber} />;
}
