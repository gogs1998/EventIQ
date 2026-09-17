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
export function ActionStatus({
  error,
  done,
  className,
}: {
  error?: string | null;
  /**
   * What went through, where the page around the form does not already show it.
   * A form that clears itself and leaves no trace reads exactly like a form that
   * refused silently, which is the failure this component was written for.
   *
   * It goes in the same live region as the refusal rather than in a second one
   * beside it: a screen reader announces one region at a time, and two of them
   * racing is how somebody hears "added" over the top of why it was not. A
   * refusal wins where both are set, for the same reason.
   */
  done?: string | null;
  className?: string;
}) {
  const said = error ?? done ?? "";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx(
        "text-xs leading-relaxed",
        error ? "text-red-corner-hot" : "text-gold",
        !said && "sr-only",
        said && className,
      )}
    >
      {said}
    </p>
  );
}
