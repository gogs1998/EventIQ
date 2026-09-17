import Link from "next/link";
import { GETTING_STARTED } from "@/lib/copy";
import { cx } from "@/lib/cx";
import type { FirstSteps } from "@/lib/promoter";

/** In the order they have to happen in. `firstSteps` decides which one is now. */
const ORDER = ["bouts", "invites", "publish"] as const;

/**
 * The three steps between a show existing and a show anybody can read.
 *
 * A promoter's account is made for them by an operator, so the first dashboard
 * they see is one nobody has walked them through — and the three things it wants
 * from them have to happen in one order, because the later two do nothing
 * without the earlier ones. Sending links before there are bouts is sending
 * nothing; publishing before either is a programme with an empty running order,
 * which is the state bugs 22 and 28 came out of.
 *
 * It ticks itself off from the card rather than from anything stored, so there
 * is no state to get out of step with the show, and nothing to reset when a
 * promoter goes back a step. It is not drawn at all once the show is published:
 * see `firstSteps` for why that is the end of it.
 *
 * Each step carries the address of the control that does it rather than
 * describing where to find it — the publish control is the one exception,
 * because it is a form on this page, so that step points at itself and the
 * button is a few centimetres above.
 */
export function GettingStarted({ slug, step }: { slug: string; step: FirstSteps }) {
  const at = ORDER.indexOf(step);

  // Each step carries the address of the control that does it rather than
  // describing where to find it. Two of them are elsewhere; publishing is a form
  // at the top of this page, so that one points back up at itself.
  const href: Record<(typeof ORDER)[number], string> = {
    bouts: `/promoter/e/${slug}/card`,
    invites: "#chase",
    publish: "#publish",
  };

  return (
    <section aria-labelledby="getting-started" className="border-hairline mt-6 border p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started" className="display text-xl">
          {GETTING_STARTED.heading}
        </h2>
        <span className="label">{GETTING_STARTED.note}</span>
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {ORDER.map((name, index) => {
          const copy = GETTING_STARTED.steps[name];
          const done = index < at;
          const now = index === at;
          const to = href[name];
          return (
            <li
              key={name}
              className={cx(
                "border-t pt-3",
                now ? "border-gold" : done ? "border-hairline" : "border-hairline",
              )}
            >
              <div className="flex items-baseline gap-2">
                {/* A tick rather than a number once it is behind them, because a
                    numbered list of three where one is finished reads as a list
                    of three things still to do. */}
                <span
                  aria-hidden
                  className={cx(
                    "display text-lg leading-none",
                    done ? "text-gold" : now ? "text-chalk" : "text-ash-dim",
                  )}
                >
                  {done ? "✓" : `0${index + 1}`}
                </span>
                <span
                  className={cx(
                    "display text-base leading-tight",
                    done ? "text-ash-dim" : now ? "text-chalk" : "text-ash",
                  )}
                >
                  {copy.label}
                </span>
              </div>

              {/* Only the step they are on is explained. The one behind them
                  needs no instructions and the one ahead is an instruction they
                  cannot act on yet. */}
              {now ? (
                <>
                  <p className="text-ash mt-2 text-xs leading-relaxed">{copy.body}</p>
                  <Link
                    href={to}
                    className="border-hairline hover:border-chalk/40 label mt-3 inline-block border px-3 py-2 transition-colors"
                  >
                    {copy.action}
                  </Link>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
