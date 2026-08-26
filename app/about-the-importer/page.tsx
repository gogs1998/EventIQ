import type { Metadata } from "next";
import Link from "next/link";

/**
 * The address in the importer's user agent string.
 *
 * The bot identifies itself and points here, which is only worth doing if the
 * page exists and says something true. A user agent linking to a 404 is the
 * same as not identifying yourself at all.
 */
export const metadata: Metadata = {
  title: "About the record importer — EventIQ",
  description:
    "What EventIQBot does, when it runs, and how to stop it reading your site.",
};

export default function AboutTheImporterPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16">
      <span className="label">EventIQ</span>
      <h1 className="display mt-3 text-4xl">About the record importer</h1>

      <div className="text-ash mt-8 grid gap-5 text-sm leading-relaxed">
        <p>
          EventIQ builds digital programmes for amateur fight shows. A fighter filling in
          their programme entry can paste a link to their own record page, and we fetch
          that one page and read the record off it so they do not have to type it in.
        </p>

        <p>
          Requests come from <span className="text-chalk font-mono text-xs">EventIQBot/1.0</span>.
        </p>

        <h2 className="display text-chalk mt-4 text-xl">What it does</h2>
        <ul className="grid gap-2 pl-4">
          <li className="list-disc">
            Fetches <strong className="text-chalk">one page</strong>, the one whose address
            a person pasted into a form, at the moment they pressed the button.
          </li>
          <li className="list-disc">
            Caches the result for a week, so reopening the form costs the source site
            nothing.
          </li>
          <li className="list-disc">
            Caches failures too, so a page we could not read is not fetched again and
            again by somebody pressing the button.
          </li>
          <li className="list-disc">
            Reads name, nickname, gym, height, age and the win/loss/draw record.
          </li>
        </ul>

        <h2 className="display text-chalk mt-4 text-xl">What it does not do</h2>
        <ul className="grid gap-2 pl-4">
          <li className="list-disc">It does not crawl. It follows no links and has no queue.</li>
          <li className="list-disc">
            It does not run on a schedule. No person, no request.
          </li>
          <li className="list-disc">
            It does not pretend to be a browser. If a site turns it away, it tells the
            fighter to type their record in instead.
          </li>
          <li className="list-disc">
            It does not republish anything as fact. Imported values arrive in the form
            badged with where they came from and have to be confirmed by the fighter,
            because amateur records go out of date and the room on the night knows
            better than the database.
          </li>
        </ul>

        <h2 className="display text-chalk mt-4 text-xl">If you would rather it did not</h2>
        <p>
          Block the user agent, or get in touch and we will stop reading your site. There
          is no argument to have about it: the whole feature saves a fighter some typing
          and is not worth being unwelcome over.
        </p>
      </div>

      <Link
        href="/"
        className="text-ash-dim hover:text-chalk mt-10 inline-block text-xs transition-colors"
      >
        Back to EventIQ
      </Link>
    </main>
  );
}
