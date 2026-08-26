"use client";

import { useState } from "react";
import Link from "next/link";
import { FighterPortrait } from "@/components/FighterPortrait";
import { SponsorLockup } from "@/components/SponsorLockup";
import { TapeTable } from "@/components/TapeTable";
import { TapePlayer } from "@/components/sequence/TapePlayer";
import { event } from "@/data/event";
import { cx } from "@/lib/cx";
import {
  boutBillingLabel,
  boutClassLine,
  boutFormat,
  buildHooks,
  buildTape,
  firstName,
  formatRecord,
  getFighter,
  getSponsor,
  lastName,
} from "@/lib/tape";
import type { Bout, Corner, Fighter, Sponsor } from "@/lib/types";

function sponsorsFor(f: Fighter): Sponsor[] {
  return (f.sponsorIds ?? []).map((id) => getSponsor(id)).filter((s): s is Sponsor => !!s);
}

function FighterSide({
  fighter,
  corner,
}: {
  fighter: Fighter;
  corner: Corner;
}) {
  const record = formatRecord(fighter);
  const alignment = corner === "red" ? "text-left items-start" : "text-right items-end";

  return (
    <div className={cx("flex min-w-0 flex-col gap-2", alignment)}>
      <FighterPortrait
        fighter={fighter}
        corner={corner}
        className="aspect-[3/4] w-full"
      />
      <div className={cx("flex w-full flex-col gap-1", alignment)}>
        <span
          className={cx(
            "font-mono text-[0.5rem] uppercase tracking-[0.22em]",
            corner === "red" ? "text-red-corner-hot" : "text-blue-corner-hot",
          )}
        >
          {corner === "red" ? "Red" : "Blue"}
        </span>
        <span className="text-ash truncate text-[0.7rem] uppercase tracking-wider">
          {firstName(fighter)}
        </span>
        <span className="display text-chalk w-full truncate text-2xl leading-none">
          {lastName(fighter)}
        </span>
        {fighter.nickname ? (
          <span className="text-gold truncate text-xs italic">
            &ldquo;{fighter.nickname}&rdquo;
          </span>
        ) : null}
        <span className="text-ash truncate text-[0.7rem]">{fighter.gym}</span>
        {record ? (
          <span className="tnum display text-chalk text-base">{record}</span>
        ) : (
          <span className="text-ash-dim font-mono text-[0.5rem] uppercase tracking-[0.18em]">
            Record to follow
          </span>
        )}
      </div>
    </div>
  );
}

function FighterDetail({ fighter, corner }: { fighter: Fighter; corner: Corner }) {
  const sponsors = sponsorsFor(fighter);
  const accent = corner === "red" ? "border-l-red-corner" : "border-l-blue-corner";

  return (
    <div className={cx("border-l-2 pl-3", accent)}>
      <div className="flex items-baseline gap-2">
        <span className="display text-chalk text-base">{fighter.name}</span>
        {fighter.stance ? <span className="label">{fighter.stance}</span> : null}
      </div>

      {fighter.bio ? (
        <p className="text-ash mt-2 text-sm leading-relaxed">{fighter.bio}</p>
      ) : (
        <p className="text-ash-dim mt-2 text-sm italic">
          Hasn&rsquo;t sent their details in yet.
        </p>
      )}

      {fighter.styleTags?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fighter.styleTags.map((tag) => (
            <span
              key={tag}
              className="border-hairline text-ash border px-2 py-0.5 text-[0.6rem] uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {fighter.walkoutSong ? (
        <div className="mt-3">
          <span className="label">Walks out to</span>
          <div className="text-chalk text-sm">
            {fighter.walkoutSong.title}
            <span className="text-ash"> · {fighter.walkoutSong.artist}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {fighter.instagram ? (
          <a
            href={`https://instagram.com/${fighter.instagram}`}
            target="_blank"
            rel="noreferrer"
            className="border-hairline hover:border-chalk/40 text-chalk flex items-center gap-1.5 border px-2 py-1 text-xs transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M12 2c2.7 0 3 0 4.1.06 1.1.05 1.8.22 2.4.47.66.25 1.2.6 1.7 1.1.5.5.85 1.04 1.1 1.7.25.6.42 1.3.47 2.4.06 1.1.06 1.4.06 4.1s0 3-.06 4.1c-.05 1.1-.22 1.8-.47 2.4a4.6 4.6 0 0 1-1.1 1.7c-.5.5-1.04.85-1.7 1.1-.6.25-1.3.42-2.4.47-1.1.06-1.4.06-4.1.06s-3 0-4.1-.06c-1.1-.05-1.8-.22-2.4-.47a4.6 4.6 0 0 1-1.7-1.1 4.6 4.6 0 0 1-1.1-1.7c-.25-.6-.42-1.3-.47-2.4C2 15 2 14.7 2 12s0-3 .06-4.1c.05-1.1.22-1.8.47-2.4a4.6 4.6 0 0 1 1.1-1.7 4.6 4.6 0 0 1 1.7-1.1c.6-.25 1.3-.42 2.4-.47C9 2 9.3 2 12 2Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 1.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4ZM17.8 5.9a1.2 1.2 0 1 0 0 2.3 1.2 1.2 0 0 0 0-2.3Z" />
            </svg>
            @{fighter.instagram}
          </a>
        ) : null}

        <Link
          href={`/e/${event.slug}/f/${fighter.id}`}
          className="label hover:text-chalk transition-colors"
        >
          Full profile
        </Link>
      </div>

      {sponsors.length ? (
        <div className="mt-3">
          <span className="label">Backed by</span>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {sponsors.map((s) => (
              <SponsorLockup key={s.id} sponsor={s} size="sm" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function BoutCard({ bout, mp4 }: { bout: Bout; mp4?: string }) {
  const [open, setOpen] = useState(false);
  const red = getFighter(bout.redId);
  const blue = getFighter(bout.blueId);
  const hooks = buildHooks(bout);
  const rows = buildTape(bout);
  const sponsor = getSponsor(bout.sponsorId);
  const headline = bout.billing === "MAIN";

  return (
    <article
      className={cx(
        "bg-ink-2/70 border transition-colors",
        headline ? "border-gold/35" : "border-hairline",
        open && "border-chalk/25",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full p-4 text-left"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={cx(
                "display text-lg leading-none",
                headline ? "text-gold" : bout.billing ? "text-chalk" : "text-ash",
              )}
            >
              {boutBillingLabel(bout)}
            </div>
            {bout.titleLabel ? (
              <div className="text-gold mt-1.5 text-[0.7rem] uppercase tracking-[0.14em]">
                {bout.titleLabel}
              </div>
            ) : null}
            <div className="text-ash mt-1.5 text-[0.7rem] uppercase tracking-wider">
              {boutClassLine(bout)}
              <span className="text-ash-dim"> · {boutFormat(bout)}</span>
            </div>
          </div>

          {sponsor ? (
            <div className="shrink-0 text-right">
              <div className="text-ash-dim mb-1 font-mono text-[0.45rem] uppercase tracking-[0.2em]">
                Bout sponsor
              </div>
              <SponsorLockup sponsor={sponsor} size="sm" className="justify-end" />
            </div>
          ) : null}
        </header>

        <div className="relative grid grid-cols-2 gap-4">
          <FighterSide fighter={red} corner="red" />
          <FighterSide fighter={blue} corner="blue" />
          <span className="display text-ash-dim pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 text-xl">
            Vs
          </span>
        </div>

        {hooks.length ? (
          <p className="text-chalk/85 mt-3 text-sm leading-snug">{hooks[0]}</p>
        ) : null}

        <div className="label mt-3 flex items-center gap-1.5">
          {open ? "Close" : "Tale of the tape"}
          <svg
            viewBox="0 0 24 24"
            className={cx("h-3 w-3 fill-current transition-transform", open && "rotate-180")}
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </div>
      </button>

      {open ? (
        <div className="anim-rise border-hairline grid gap-5 border-t p-4">
          {hooks.length > 1 ? (
            <ul className="grid gap-1.5">
              {hooks.slice(1).map((hook) => (
                <li key={hook} className="text-ash flex gap-2 text-sm">
                  <span className="text-red-corner">/</span>
                  {hook}
                </li>
              ))}
            </ul>
          ) : null}

          <TapeTable rows={rows} />

          <div>
            <div className="label mb-2">Watch the tape</div>
            <TapePlayer bout={bout} mp4={mp4} />
          </div>

          <div className="grid gap-4">
            <FighterDetail fighter={red} corner="red" />
            <FighterDetail fighter={blue} corner="blue" />
          </div>
        </div>
      ) : null}
    </article>
  );
}
