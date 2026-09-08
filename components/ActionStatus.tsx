import { cx } from "@/lib/cx";

/**
 * What a server action came back with, under the control that ran it.
 *
 * Every form in the promoter's side used to `void` its action, so a refusal —
 * an expired session, another promoter's show, a name with nothing in it — was
 * a button that greyed out, came back, and changed nothing. This is the one
 * place any of them says so.
 *
 * The region is always in the document rather than being mounted when there is
 * something to say. A screen reader only announces a change inside a live region
 * that was already there, so a paragraph that appears at the same moment as its
 * text is a paragraph nobody hears. `sr-only` takes the empty one out of the
 * layout without taking it out of the accessibility tree, which is why the forms
 * do not gain a blank row for it.
 */
export function ActionStatus({ error, className }: { error?: string | null; className?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx(
        "text-red-corner-hot text-xs leading-relaxed",
        !error && "sr-only",
        error && className,
      )}
    >
      {error ?? ""}
    </p>
  );
}
