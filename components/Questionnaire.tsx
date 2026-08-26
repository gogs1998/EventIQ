"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Stage } from "@/components/sequence/Stage";
import { TaleOfTheTape } from "@/components/sequence/TaleOfTheTape";
import { SCENES } from "@/components/sequence/timeline";
import { SponsorLockup } from "@/components/SponsorLockup";
import { TapeTable } from "@/components/TapeTable";
import { event, sponsors as allSponsors } from "@/data/event";
import { FPS } from "@/lib/anim";
import { cx } from "@/lib/cx";
import {
  type ImportedTape,
  SOURCE_LABEL,
  lookupTape,
} from "@/lib/fighter-import";
import {
  buildTapeFrom,
  completeness,
  firstName,
  getBout,
  getFighter,
  lastName,
  tapeGapsBehind,
} from "@/lib/tape";
import type { Fighter, Stance } from "@/lib/types";

/**
 * The fighter's side of the product, as a walkthrough.
 *
 * Nothing is saved: this exists so a promoter can see exactly what lands in
 * their fighters' hands. The order of the questions is the argument — the parts
 * that flatter a fighter come first, and the tape measurements last, because a
 * form that opens with "reach in centimetres" does not get finished.
 */

const STYLE_OPTIONS = [
  "Boxing",
  "Wrestling",
  "Jiu jitsu",
  "Muay Thai",
  "Judo",
  "Karate range",
  "Pressure",
  "Counter striking",
  "Ground and pound",
  "Leg locks",
];

const STANCES: Stance[] = ["Orthodox", "Southpaw", "Switch"];

// Bout 10 on the demo card, where this fighter is the blue corner and has so far
// sent in nothing at all.
const BOUT_NUMBER = 10;
const FIGHTER_ID = "owen-pryce";
const SAMPLE_PHOTO = "/fighters/owen-pryce.webp";
const SAMPLE_CUTOUT = "/fighters/owen-pryce-cutout.webp";

type Draft = {
  nickname: string;
  instagram: string;
  photo?: string;
  cutout?: string;
  bio: string;
  walkoutTitle: string;
  walkoutArtist: string;
  hometown: string;
  age: string;
  heightCm: string;
  reachCm: string;
  stance: string;
  w: string;
  l: string;
  d: string;
  ko: string;
  sub: string;
  styleTags: string[];
  sponsorIds: string[];
};

const EMPTY: Draft = {
  nickname: "",
  instagram: "",
  bio: "",
  walkoutTitle: "",
  walkoutArtist: "",
  hometown: "Wrexham",
  age: "",
  heightCm: "",
  reachCm: "",
  stance: "",
  w: "",
  l: "",
  d: "",
  ko: "",
  sub: "",
  styleTags: [],
  sponsorIds: [],
};

function num(value: string): number | undefined {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

async function downscale(file: File, max = 1000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function Field({
  label,
  hint,
  from,
  children,
}: {
  label: string;
  hint?: string;
  /** Where an imported value came from, shown until the fighter edits it. */
  from?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="label">{label}</span>
        {from ? (
          <span className="border-gold/40 text-gold whitespace-nowrap border px-1.5 py-0.5 font-mono text-[0.45rem] uppercase tracking-[0.16em]">
            From {from}
          </span>
        ) : null}
      </span>
      {hint ? <span className="text-ash-dim mt-1 block text-[0.7rem]">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full bg-panel border border-hairline px-3 py-2.5 text-chalk text-sm outline-none focus:border-chalk/40 transition-colors placeholder:text-ash-dim";

function Section({
  step,
  title,
  blurb,
  children,
}: {
  step: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-hairline border-t pt-6">
      <div className="flex items-baseline gap-3">
        <span className="display text-ash-dim text-2xl">{step}</span>
        <h2 className="display text-chalk text-xl">{title}</h2>
      </div>
      <p className="text-ash mt-1.5 text-xs leading-relaxed">{blurb}</p>
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}

type PreviewMode = "card" | "tape";
type ImportStatus = "idle" | "loading" | "error" | "done";

/** Which import group each form field belongs to, for clearing the badge. */
const IMPORT_FIELD_OF: Partial<Record<keyof Draft, string>> = {
  age: "age",
  heightCm: "height",
  w: "record",
  l: "record",
  d: "record",
  ko: "finishes",
  sub: "finishes",
};

export function Questionnaire() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("card");
  const [frame, setFrame] = useState(SCENES.blue.start + 84);
  const [importUrl, setImportUrl] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [imported, setImported] = useState<ImportedTape | null>(null);
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());
  const previewRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    // Once they touch a field it is theirs, so the import badge comes off.
    setImportedKeys((keys) => {
      if (!keys.size) return keys;
      const next = new Set(keys);
      next.delete(IMPORT_FIELD_OF[key] ?? "");
      return next;
    });
  };

  const runImport = async () => {
    setImportStatus("loading");
    const found = await lookupTape(importUrl);

    if (!found) {
      setImportStatus("error");
      setImported(null);
      return;
    }

    const filled = new Set<string>();
    setDraft((d) => {
      const next = { ...d };
      // Only fills blanks. Anything they have already answered themselves wins.
      const put = (key: keyof Draft, value: string | undefined, group: string) => {
        if (value === undefined || next[key] !== "") return;
        next[key] = value as never;
        filled.add(group);
      };

      put("age", found.age?.toString(), "age");
      put("heightCm", found.heightCm?.toString(), "height");
      put("w", found.record?.w.toString(), "record");
      put("l", found.record?.l.toString(), "record");
      put("d", found.record?.d.toString(), "record");
      put("ko", found.finishes?.ko.toString(), "finishes");
      put("sub", found.finishes?.sub.toString(), "finishes");
      return next;
    });

    setImportedKeys(filled);
    setImported(found);
    setImportStatus("done");
  };

  const bout = getBout(BOUT_NUMBER)!;
  const opponent = getFighter(bout.redId);
  const base = getFighter(FIGHTER_ID);

  // Repainting the full 1080x1920 preview on every keystroke makes typing feel
  // sticky, so the preview trails the input by a frame or two instead.
  const settled = useDeferredValue(draft);

  const fighter: Fighter = useMemo(() => {
    const draft = settled;
    const w = num(draft.w);
    const l = num(draft.l);
    const d = num(draft.d);
    const ko = num(draft.ko);
    const sub = num(draft.sub);

    return {
      ...base,
      nickname: draft.nickname || undefined,
      instagram: draft.instagram.replace(/^@/, "") || undefined,
      photo: draft.photo,
      cutout: draft.cutout ?? draft.photo,
      bio: draft.bio || undefined,
      hometown: draft.hometown || undefined,
      age: num(draft.age),
      heightCm: num(draft.heightCm),
      reachCm: num(draft.reachCm),
      stance: (draft.stance || undefined) as Stance | undefined,
      record: w !== undefined || l !== undefined ? { w: w ?? 0, l: l ?? 0, d: d ?? 0 } : undefined,
      finishes: ko !== undefined || sub !== undefined ? { ko: ko ?? 0, sub: sub ?? 0 } : undefined,
      walkoutSong: draft.walkoutTitle
        ? { title: draft.walkoutTitle, artist: draft.walkoutArtist || "Unknown" }
        : undefined,
      styleTags: draft.styleTags.length ? draft.styleTags : undefined,
      sponsorIds: draft.sponsorIds.length ? draft.sponsorIds : undefined,
    };
  }, [base, settled]);

  const { score, missing } = completeness(fighter);

  // The opponent is a real fighter on the card who has already sent his in, so
  // this is a genuine comparison rather than a scare tactic.
  const behind = tapeGapsBehind(fighter, opponent);
  const tapeRows = buildTapeFrom(opponent, fighter);

  const playReveal = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const { start, end } = SCENES.blue;
    const frameMs = 1000 / FPS;
    let current = start;
    let last = performance.now();

    const step = (now: number) => {
      // Capped catch-up, so a slow device plays this slowly rather than jumping.
      const behind = Math.floor((now - last) / frameMs);
      if (behind > 0) {
        last += behind * frameMs;
        current += Math.min(behind, 3);
        if (current >= end) {
          setFrame(start + 84);
          raf.current = null;
          return;
        }
        setFrame(current);
      }
      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
  };

  const toggle = (key: "styleTags" | "sponsorIds", value: string, limit = 99) =>
    setDraft((d) => {
      const list = d[key];
      if (list.includes(value)) return { ...d, [key]: list.filter((v) => v !== value) };
      if (list.length >= limit) return d;
      return { ...d, [key]: [...list, value] };
    });

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-28 pt-8 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-12">
      {/* ------------------------------------------------------- preview */}
      <div ref={previewRef} className="lg:sticky lg:top-8 lg:self-start">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="label">What the room sees</span>
          <div className="flex items-center gap-1">
            {(
              [
                ["card", "Your card"],
                ["tape", "The tape"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cx(
                  "border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] transition-colors",
                  mode === value
                    ? "border-chalk bg-chalk text-ink"
                    : "border-hairline text-ash hover:border-chalk/30",
                )}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {mode === "card" ? (
          <>
            <div className="border-hairline mx-auto max-w-[300px] border lg:max-w-none">
              <Stage>
                <TaleOfTheTape
                  bout={bout}
                  frame={Math.round(frame)}
                  red={opponent}
                  blue={fighter}
                />
              </Stage>
            </div>
            <button
              type="button"
              onClick={playReveal}
              className="border-hairline hover:border-chalk/40 label mt-2 w-full border py-2 transition-colors"
            >
              Play your walkout
            </button>
          </>
        ) : (
          <div>
            <div className="border-hairline grid grid-cols-[1fr_auto_1fr] items-end border-b pb-2">
              <span className="text-red-corner-hot display truncate text-right text-sm">
                {lastName(opponent)}
              </span>
              <span className="label px-3">vs</span>
              <span className="text-blue-corner-hot display truncate text-sm">You</span>
            </div>
            <TapeTable rows={tapeRows} />
            <p className="text-ash-dim mt-3 text-[0.7rem] leading-relaxed">
              This is your bout on the programme. Anything you leave blank shows as a
              dash on your side of it.
            </p>
          </div>
        )}

        {behind.length ? (
          <div className="border-red-corner/40 bg-red-corner/5 mt-4 border p-3">
            <p className="text-chalk text-xs leading-relaxed">
              {firstName(opponent)} has already sent{" "}
              <span className="tnum display text-base">{behind.length}</span>{" "}
              {behind.length === 1 ? "thing" : "things"} you haven&rsquo;t:{" "}
              {behind.join(", ").toLowerCase()}.
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="label">Profile</span>
            <span className="tnum display text-chalk text-lg">{score}%</span>
          </div>
          <div className="bg-panel h-1.5 w-full overflow-hidden">
            <div
              className="bg-red-corner h-full transition-all duration-500"
              style={{ width: `${score}%` }}
            />
          </div>
          {missing.length ? (
            <p className="text-ash-dim mt-2 text-[0.7rem] leading-relaxed">
              Still missing: {missing.join(", ").toLowerCase()}.
            </p>
          ) : (
            <p className="text-gold mt-2 text-[0.7rem]">
              Finished. This is exactly how you go out.
            </p>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- form */}
      <div>
        <header>
          <span className="label">{event.name}</span>
          <h1 className="display mt-2 text-4xl">
            {base.name}, you&rsquo;re on bout {BOUT_NUMBER}
          </h1>
          <p className="text-ash mt-3 text-sm leading-relaxed">
            You&rsquo;re fighting {opponent.name} out of {opponent.gym}. Fill this in and
            you get the card above, on the screen of everyone in the building, plus the
            video to post. Takes about four minutes. It saves as you go.
          </p>
        </header>

        <div className="mt-8 grid gap-8">
          <Section
            step="01"
            title="The bit people read"
            blurb="This is what goes under your name when you walk out. Do this bit properly."
          >
            <Field label="Nickname" hint="Goes on the card in gold. Leave it if you haven't got one.">
              <input
                className={inputClass}
                value={draft.nickname}
                onChange={(e) => set("nickname", e.target.value)}
                placeholder="The Welsh Dragon"
              />
            </Field>

            <Field
              label="Photo"
              hint="We cut the background out for you. A plain wall and decent light is all it takes."
            >
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className={cx(
                    "border-hairline hover:border-chalk/40 cursor-pointer border px-3 py-2 text-xs transition-colors",
                  )}
                >
                  Choose a photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await downscale(file);
                      setDraft((d) => ({ ...d, photo: url, cutout: undefined }));
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, photo: SAMPLE_PHOTO, cutout: SAMPLE_CUTOUT }))
                  }
                  className="border-hairline hover:border-chalk/40 border px-3 py-2 text-xs transition-colors"
                >
                  Use the one from the gym
                </button>
                {draft.photo ? (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, photo: undefined, cutout: undefined }))}
                    className="text-ash-dim hover:text-chalk text-xs transition-colors"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </Field>

            <Field label="Instagram" hint="Tapped straight from your card. Free followers.">
              <input
                className={inputClass}
                value={draft.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                placeholder="@owenpryce"
              />
            </Field>

            <Field
              label="Your sponsors"
              hint="Anyone putting money behind you gets their logo on your card and in your video."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.values(allSponsors).map((sponsor) => {
                  const on = draft.sponsorIds.includes(sponsor.id);
                  return (
                    <button
                      key={sponsor.id}
                      type="button"
                      onClick={() => toggle("sponsorIds", sponsor.id)}
                      className={cx(
                        "flex items-center justify-between border px-3 py-2 text-left transition-colors",
                        on ? "border-chalk/50 bg-panel" : "border-hairline hover:border-chalk/30",
                      )}
                    >
                      <SponsorLockup sponsor={sponsor} size="sm" />
                      <span
                        className={cx(
                          "ml-2 h-3 w-3 shrink-0 border",
                          on ? "border-chalk bg-chalk" : "border-ash-dim",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Walkout song">
                <input
                  className={inputClass}
                  value={draft.walkoutTitle}
                  onChange={(e) => set("walkoutTitle", e.target.value)}
                  placeholder="Bulls on Parade"
                />
              </Field>
              <Field label="Artist">
                <input
                  className={inputClass}
                  value={draft.walkoutArtist}
                  onChange={(e) => set("walkoutArtist", e.target.value)}
                  placeholder="Rage Against the Machine"
                />
              </Field>
            </div>
          </Section>

          <Section
            step="02"
            title="Why they should shout for you"
            blurb="Three or four lines in your own words. This is the bit that turns a stranger in row four into someone shouting your name."
          >
            <Field label="Your story">
              <textarea
                className={cx(inputClass, "min-h-28 resize-y leading-relaxed")}
                value={draft.bio}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="Started at Bryn two years ago after a knee injury finished the rugby. First fight, and my whole village has bought tickets."
              />
            </Field>

            <Field label="How you fight" hint="Pick up to three.">
              <div className="flex flex-wrap gap-2">
                {STYLE_OPTIONS.map((tag) => {
                  const on = draft.styleTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggle("styleTags", tag, 3)}
                      className={cx(
                        "border px-2.5 py-1 text-xs uppercase tracking-wider transition-colors",
                        on
                          ? "border-chalk bg-chalk text-ink"
                          : "border-hairline text-ash hover:border-chalk/30",
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          <Section
            step="03"
            title="The tape"
            blurb="The boring bit, last on purpose. If you're already on Sherdog or Tapology, paste the link and most of it fills itself in."
          >
            <div className="border-hairline bg-panel/40 border p-4">
              <div className="label mb-2">Fought before?</div>
              <p className="text-ash mb-3 text-xs leading-relaxed">
                Paste your Sherdog or Tapology page and we&rsquo;ll pull your record
                across so you don&rsquo;t have to type it.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={inputClass}
                  value={importUrl}
                  onChange={(e) => {
                    setImportUrl(e.target.value);
                    if (importStatus !== "idle") setImportStatus("idle");
                  }}
                  placeholder="sherdog.com/fighter/Owen-Pryce-123456"
                  inputMode="url"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => void runImport()}
                  disabled={importStatus === "loading" || !importUrl.trim()}
                  className="border-chalk/60 hover:bg-chalk hover:text-ink display shrink-0 border px-5 py-2.5 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {importStatus === "loading" ? "Looking…" : "Look it up"}
                </button>
              </div>

              {importStatus === "error" ? (
                <p className="text-red-corner-hot mt-3 text-xs leading-relaxed">
                  That doesn&rsquo;t look like a Sherdog or Tapology fighter page. It
                  should look like sherdog.com/fighter/Your-Name-12345. No record online?
                  Just fill the boxes in below.
                </p>
              ) : null}

              {importStatus === "done" && imported ? (
                <div className="border-gold/40 bg-gold/5 mt-3 border p-3">
                  <p className="text-chalk text-xs leading-relaxed">
                    Pulled from {SOURCE_LABEL[imported.source]}.{" "}
                    <span className="text-gold">Check it before you submit</span> —
                    amateur records on there go out of date, and yours is the version
                    that goes in front of the room.
                  </p>
                  <p className="text-ash-dim mt-2 text-[0.7rem] leading-relaxed">
                    Still yours to answer:{" "}
                    {imported.notCovered.join(", ").toLowerCase()}.
                  </p>
                </div>
              ) : null}

              <p className="text-ash-dim mt-3 text-[0.65rem] leading-relaxed">
                Demo: any valid Sherdog or Tapology link returns sample data.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field
                label="Age"
                from={importedKeys.has("age") && imported ? SOURCE_LABEL[imported.source] : undefined}
              >
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={draft.age}
                  onChange={(e) => set("age", e.target.value)}
                  placeholder="22"
                />
              </Field>
              <Field
                label="Height cm"
                from={
                  importedKeys.has("height") && imported
                    ? SOURCE_LABEL[imported.source]
                    : undefined
                }
              >
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={draft.heightCm}
                  onChange={(e) => set("heightCm", e.target.value)}
                  placeholder="174"
                />
              </Field>
              <Field label="Reach cm">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={draft.reachCm}
                  onChange={(e) => set("reachCm", e.target.value)}
                  placeholder="178"
                />
              </Field>
              <Field label="Hometown">
                <input
                  className={inputClass}
                  value={draft.hometown}
                  onChange={(e) => set("hometown", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Stance">
              <div className="flex gap-2">
                {STANCES.map((stance) => (
                  <button
                    key={stance}
                    type="button"
                    onClick={() => set("stance", draft.stance === stance ? "" : stance)}
                    className={cx(
                      "border px-3 py-1.5 text-xs uppercase tracking-wider transition-colors",
                      draft.stance === stance
                        ? "border-chalk bg-chalk text-ink"
                        : "border-hairline text-ash hover:border-chalk/30",
                    )}
                  >
                    {stance}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Record"
              hint="Amateur fights only. Nought and nought is fine, everyone starts there."
              from={
                importedKeys.has("record") && imported
                  ? SOURCE_LABEL[imported.source]
                  : undefined
              }
            >
              <div className="grid grid-cols-3 gap-3">
                {(["w", "l", "d"] as const).map((key) => (
                  <div key={key}>
                    <span className="text-ash-dim mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.2em]">
                      {{ w: "Won", l: "Lost", d: "Drawn" }[key]}
                    </span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={draft[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </Field>

            <Field
              label="Of those wins, how many finished early?"
              from={
                importedKeys.has("finishes") && imported
                  ? SOURCE_LABEL[imported.source]
                  : undefined
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-ash-dim mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.2em]">
                    Knockouts
                  </span>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={draft.ko}
                    onChange={(e) => set("ko", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="text-ash-dim mb-1 block font-mono text-[0.55rem] uppercase tracking-[0.2em]">
                    Submissions
                  </span>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={draft.sub}
                    onChange={(e) => set("sub", e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </Field>
          </Section>

          {submitted ? (
            <div className="border-gold/40 bg-gold/5 anim-rise border p-5">
              <h3 className="display text-gold text-2xl">You&rsquo;re on the card</h3>
              <p className="text-chalk/90 mt-2 text-sm leading-relaxed">
                Your profile is live on the {event.name} programme and your reveal video is
                rendering now. We&rsquo;ll text you the link to post the moment it&rsquo;s
                done.
              </p>
              <p className="text-ash-dim mt-3 text-xs">
                Change anything up until first bell by opening this link again.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="bg-chalk text-ink display hover:bg-gold w-full py-4 text-xl transition-colors"
            >
              Put me on the card
            </button>
          )}

          <p className="text-ash-dim text-center text-[0.7rem] leading-relaxed">
            Demonstration only. Nothing typed here is stored or sent anywhere.
          </p>
        </div>
      </div>

      {/* Mobile progress bar, so the reward stays visible while scrolling the form. */}
      <div className="border-hairline bg-ink/95 fixed inset-x-0 bottom-0 z-50 border-t px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="bg-panel h-1.5 flex-1 overflow-hidden">
            <div
              className="bg-red-corner h-full transition-all duration-500"
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="tnum display shrink-0 text-base">{score}%</span>
          <button
            type="button"
            onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="label shrink-0"
          >
            My card
          </button>
        </div>
      </div>
    </div>
  );
}
