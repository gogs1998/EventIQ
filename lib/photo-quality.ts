import type { CutoutIssue, CutoutQuality } from "@/lib/types";

/**
 * Reading back what the renderer thought of a cutout.
 *
 * The judging happens in scripts/photo-quality.mjs, out of band, because it
 * needs the mask; this is the app's side of the same two columns. Anything the
 * column holds that is not one of the names below is read as nothing rather
 * than guessed at — a verdict nobody wrote is not one to act on.
 */

const QUALITIES: readonly CutoutQuality[] = ["ok", "repaired", "poor"];

export const CUTOUT_ISSUES: readonly CutoutIssue[] = [
  "multiple-people",
  "head-only",
  "tiny-subject",
  "very-dark",
  "dark",
  "cut-off",
  "faint-body",
];

export function cutoutQualityFrom(value: string | null | undefined): CutoutQuality | undefined {
  return QUALITIES.find((quality) => quality === value);
}

export function cutoutIssuesFrom(value: string | null | undefined): CutoutIssue[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const issues = CUTOUT_ISSUES.filter((issue) => parsed.includes(issue));
    return issues.length ? issues : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a fighter's photograph is one worth asking them to replace.
 *
 * Only a poor verdict on the cutout that is on the row now. A verdict goes with
 * the photograph it was made from, so a fighter who has sent a new one is not
 * asked about the old one; and a fighter who approved a stylised portrait is
 * not asked at all, because that is what their card shows and the cutout is
 * never reached.
 */
export function photoCouldBeBetter(fighter: {
  cutout?: string;
  cutoutQuality?: CutoutQuality;
  stylised?: string;
}): boolean {
  return !!fighter.cutout && fighter.cutoutQuality === "poor" && !fighter.stylised;
}
