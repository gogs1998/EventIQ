"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "@/components/sequence/Stage";
import { TaleOfTheTape } from "@/components/sequence/TaleOfTheTape";
import { SCENES } from "@/components/sequence/timeline";
import { SponsorLockup } from "@/components/SponsorLockup";
import { TapeTable } from "@/components/TapeTable";
import { FPS } from "@/lib/anim";
import { cx } from "@/lib/cx";
import { type ImportOutcome, SOURCE_LABEL, lookupTape } from "@/lib/fighter-import";
import {
  STANCES,
  STYLE_OPTIONS,
  type Draft,
  draftFromFighter,
  fighterFromDraft,
} from "@/lib/questionnaire";
import type { Card } from "@/lib/card";
import { buildTape, completeness, firstName, lastName, tapeGapsBehind } from "@/lib/tape";
import type { Bout, Fighter, Stance } from "@/lib/types";

/**
 * The fighter's side of the product.
 *
 * The order of the questions is the argument: the parts that flatter a fighter
 * come first and the tape measurements come last, because a form that opens with
 * "reach in centimetres" does not get finished. Everything is saved as it is
 * typed, so leaving halfway through and coming back a week later picks up where
 * it stopped, which is how these actually get filled in.
 */

export type QuestionnaireProps = {
  /** The show, so the preview card is the real one rather than an approximation. */
  card: Card;
  bout: Bout;
  opponent: Fighter;
  fighter: Fighter;
  /**
   * A preview saves nothing. It exists so a promoter can see exactly what lands
   * in their fighters' hands without editing a real fighter's profile, and it
   * says so on the page rather than quietly discarding the typing.
   */
  mode: "live" | "preview";
  /**
   * Server actions, already bound to the invite token by the page. The token
   * never reaches this component, so nothing here can be persuaded to write to
   * a different fighter.
   */
  save?: (draft: Draft) => Promise<{ savedAt: number }>;
  submit?: (draft: Draft) => Promise<void>;
  upload?: (form: FormData) => Promise<{ path: string }>;
  alreadySubmitted?: boolean;
};

/** Long enough to coalesce a burst of typing, short enough to survive a closed tab. */
const AUTOSAVE_DELAY_MS = 1200;

async function downscale(file: File, max = 1000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // Done in the browser so a fighter on a phone uploads a few hundred kilobytes
  // rather than the eight megapixels their camera produced.
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image"))),
      "image/jpeg",
      0.86,
    ),
  );
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
type SaveState = "idle" | "saving" | "saved" | "failed";
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

export function Questionnaire({
  card,
  bout,
  opponent,
  fighter: base,
  mode,
  save,
  submit,
  upload,
  alreadySubmitted = false,
}: QuestionnaireProps) {
  const eventName = card.event.name;
  const sponsors = Object.values(card.sponsors);
  const [draft, setDraft] = useState<Draft>(() => draftFromFighter(base));
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("card");
  const [frame, setFrame] = useState(SCENES.blue.start + 84);
  const [importUrl, setImportUrl] = useState("");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null);
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());
  const [photoError, setPhotoError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Draft | null>(null);

  const flush = useCallback(async () => {
    if (!save || !pending.current) return;
    const toSave = pending.current;
    pending.current = null;
    setSaveState("saving");
    try {
      await save(toSave);
      setSaveState("saved");
    } catch {
      // Kept in the box either way. Telling somebody their typing did not save
      // is far better than a silent loss they discover on the night.
      setSaveState("failed");
    }
  }, [save]);

  const queueSave = useCallback(
    (next: Draft) => {
      if (!save) return;
      pending.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush, save],
  );

  // A fighter who fills in one box and closes the tab has still told us
  // something, so the pending save goes out rather than being dropped.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  const update = useCallback(
    (change: (current: Draft) => Draft) => {
      setDraft((current) => {
        const next = change(current);
        queueSave(next);
        return next;
      });
    },
    [queueSave],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    update((current) => ({ ...current, [key]: value }));
    // Once they touch a field it is theirs, so the import badge comes off.
    setImportedKeys((keys) => {
      if (!keys.size) return keys;
      const next = new Set(keys);
      next.delete(IMPORT_FIELD_OF[key] ?? "");
      return next;
    });
  };

  const toggle = (key: "styleTags" | "sponsorIds", value: string, limit = 99) =>
    update((current) => {
      const list = current[key];
      if (list.includes(value)) return { ...current, [key]: list.filter((v) => v !== value) };
      if (list.length >= limit) return current;
      return { ...current, [key]: [...list, value] };
    });

  const runImport = async () => {
    setImportStatus("loading");
    const outcome = await lookupTape(importUrl);
    setImportOutcome(outcome);

    if (!outcome.ok) {
      setImportStatus("error");
      return;
    }

    const filled = new Set<string>();
    update((current) => {
      const next = { ...current };
      // Only fills blanks. Anything they have already answered themselves wins.
      const put = (key: keyof Draft, value: string | undefined, group: string) => {
        if (value === undefined || next[key] !== "") return;
        next[key] = value as never;
        filled.add(group);
      };

      const { tape } = outcome;
      put("nickname", tape.nickname, "nickname");
      put("age", tape.age?.toString(), "age");
      put("heightCm", tape.heightCm?.toString(), "height");
      put("w", tape.record?.w.toString(), "record");
      put("l", tape.record?.l.toString(), "record");
      put("d", tape.record?.d.toString(), "record");
      put("ko", tape.finishes?.ko.toString(), "finishes");
      put("sub", tape.finishes?.sub.toString(), "finishes");
      return next;
    });

    setImportedKeys(filled);
    setImportStatus("done");
  };

  const onPhoto = async (file: File) => {
    setPhotoError(null);
    try {
      const blob = await downscale(file);
      if (!upload) {
        // Preview mode: show it locally so the card fills in, but nothing leaves
        // the browser and nothing is stored.
        update((current) => ({ ...current, photo: URL.createObjectURL(blob) }));
        return;
      }
      const form = new FormData();
      form.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const { path } = await upload(form);
      update((current) => ({ ...current, photo: path }));
    } catch {
      setPhotoError("That photo wouldn't upload. Try a different one, or come back to it later.");
    }
  };

  // Repainting the full 1080x1920 preview on every keystroke makes typing feel
  // sticky, so the preview trails the input by a frame or two instead.
  const settled = useDeferredValue(draft);
  const fighter = useMemo(() => fighterFromDraft(base, settled), [base, settled]);

  const { score, missing } = completeness(fighter);
  const behind = tapeGapsBehind(fighter, opponent);
  const tapeRows = buildTape(opponent, fighter);
  const importedTape = importOutcome?.ok ? importOutcome.tape : null;
  const sourceLabel = importedTape ? SOURCE_LABEL[importedTape.source] : undefined;

  const playReveal = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    const { start, end } = SCENES.blue;
    const frameMs = 1000 / FPS;
    let current = start;
    let last = performance.now();

    const step = (now: number) => {
      // Capped catch-up, so a slow device plays this slowly rather than jumping.
      const dropped = Math.floor((now - last) / frameMs);
      if (dropped > 0) {
        last += dropped * frameMs;
        current += Math.min(dropped, 3);
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

  const onSubmit = async () => {
    if (!submit) {
      setSubmitted(true);
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pending.current = draft;
    await flush();
    await submit(draft);
    setSubmitted(true);
  };

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
                onClick={() => setPreviewMode(value)}
                className={cx(
                  "border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] transition-colors",
                  previewMode === value
                    ? "border-chalk bg-chalk text-ink"
                    : "border-hairline text-ash hover:border-chalk/30",
                )}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {previewMode === "card" ? (
          <>
            <div className="border-hairline mx-auto max-w-[300px] border lg:max-w-none">
              <Stage>
                <TaleOfTheTape
                  card={card}
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
              This is your bout on the programme. Every box you fill in replaces a dash
              on your side of it.
            </p>
          </div>
        )}

        {behind.length ? (
          <div className="border-red-corner/40 bg-red-corner/5 mt-4 border p-3">
            <p className="text-chalk text-xs leading-relaxed">
              {firstName(opponent)} has already answered{" "}
              <span className="tnum display text-base">{behind.length}</span>{" "}
              {behind.length === 1 ? "line" : "lines"} of the tape:{" "}
              {behind.join(", ").toLowerCase()}. Add yours and the two of you go up side
              by side, line for line.
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
              Still to come: {missing.join(", ").toLowerCase()}.
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
          <span className="label">{eventName}</span>
          <h1 className="display mt-2 text-4xl">
            {base.name}, you&rsquo;re on bout {bout.number}
          </h1>
          <p className="text-ash mt-3 text-sm leading-relaxed">
            You&rsquo;re fighting {opponent.name} out of {opponent.gym}. Fill this in and
            you get the card above, on the screen of everyone in the building, plus the
            video to post. It saves as you go.
          </p>
          {mode === "live" ? (
            <p
              className={cx(
                "mt-3 font-mono text-[0.55rem] uppercase tracking-[0.16em]",
                saveState === "failed" ? "text-red-corner-hot" : "text-ash-dim",
              )}
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "failed"
                    ? "Couldn't save that — check your signal, it'll try again as you type"
                    : "Saves as you go"}
            </p>
          ) : null}
        </header>

        <div className="mt-8 grid gap-8">
          <Section
            step="01"
            title="The bit people read"
            blurb="This is what goes under your name when you walk out."
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
                <label className="border-hairline hover:border-chalk/40 cursor-pointer border px-3 py-2 text-xs transition-colors">
                  Choose a photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onPhoto(file);
                    }}
                  />
                </label>
                {draft.photo ? (
                  <button
                    type="button"
                    onClick={() => update((d) => ({ ...d, photo: undefined }))}
                    className="text-ash-dim hover:text-chalk text-xs transition-colors"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {photoError ? (
                <p className="text-red-corner-hot mt-2 text-[0.7rem]">{photoError}</p>
              ) : null}
            </Field>

            <Field
              label="Instagram"
              hint="Tapped straight from your card by anyone reading the programme."
            >
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
                {sponsors.map((sponsor) => {
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
            blurb="Last on purpose. If you're already on Sherdog, paste the link and most of it fills itself in."
          >
            <div className="border-hairline bg-panel/40 border p-4">
              <div className="label mb-2">Fought before?</div>
              <p className="text-ash mb-3 text-xs leading-relaxed">
                Paste your Sherdog page and we&rsquo;ll pull your record across so you
                don&rsquo;t have to type it.
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

              {importStatus === "error" && importOutcome && !importOutcome.ok ? (
                <p className="text-red-corner-hot mt-3 text-xs leading-relaxed">
                  {importOutcome.kind === "not-a-profile"
                    ? "That doesn't look like a Sherdog or Tapology fighter page. It should look like sherdog.com/fighter/Your-Name-12345. No record online? Just fill the boxes in below."
                    : importOutcome.reason}
                </p>
              ) : null}

              {importStatus === "done" && importedTape ? (
                <div className="border-gold/40 bg-gold/5 mt-3 border p-3">
                  <p className="text-chalk text-xs leading-relaxed">
                    Found {importedTape.name ?? "a profile"} on {sourceLabel}
                    {importedTape.recordKind === "professional"
                      ? ", and that's the professional record, not the amateur one"
                      : null}
                    . <span className="text-gold">Check it before you submit</span> —
                    records on there go out of date, and yours is the version that goes in
                    front of the room.
                  </p>
                  <p className="text-ash-dim mt-2 text-[0.7rem] leading-relaxed">
                    Still yours to answer: {importedTape.notCovered.join(", ").toLowerCase()}.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Age" from={importedKeys.has("age") ? sourceLabel : undefined}>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={draft.age}
                  onChange={(e) => set("age", e.target.value)}
                  placeholder="22"
                />
              </Field>
              <Field label="Height cm" from={importedKeys.has("height") ? sourceLabel : undefined}>
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
                  placeholder="Wrexham"
                />
              </Field>
            </div>

            <Field label="Stance">
              <div className="flex gap-2">
                {STANCES.map((stance: Stance) => (
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
              from={importedKeys.has("record") ? sourceLabel : undefined}
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
              from={importedKeys.has("finishes") ? sourceLabel : undefined}
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
                Your profile is live on the {eventName} programme.
              </p>
              <p className="text-ash-dim mt-3 text-xs">
                Change anything up until first bell by opening this link again.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onSubmit()}
              className="bg-chalk text-ink display hover:bg-gold w-full py-4 text-xl transition-colors"
            >
              Put me on the card
            </button>
          )}

          {mode === "preview" ? (
            <p className="text-ash-dim text-center text-[0.7rem] leading-relaxed">
              Preview of what a fighter gets. Nothing typed here is saved.
            </p>
          ) : (
            <p className="text-ash-dim text-center text-[0.7rem] leading-relaxed">
              Your details go on the programme for this show and in your tale of the tape
              video. Nothing else, and nowhere else.
            </p>
          )}
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
