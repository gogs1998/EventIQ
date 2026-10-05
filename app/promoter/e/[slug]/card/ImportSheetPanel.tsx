"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findFighters, type FighterLookup } from "@/app/promoter/actions";
import {
  importSheet,
  previewSheet,
  setFighterPhoto,
  type PreviewBout,
} from "@/app/promoter/sheet-actions";
import {
  DISCIPLINES,
  DISCIPLINE_NAME,
  Field,
  inputClass,
} from "@/app/promoter/e/[slug]/card/fields";
import { MatchPanel } from "@/app/promoter/e/[slug]/card/MatchPanel";
import { PosterCrop, cropToJpeg, type PosterCrops } from "@/app/promoter/e/[slug]/card/PosterCrop";
import { ActionStatus } from "@/components/ActionStatus";
import {
  ACTION_ERRORS,
  POSTER_PHOTOS_ADDED,
  SHEET_ADDED,
  SHEET_IMPORT,
  addTheseBouts,
} from "@/lib/copy";
import { cx } from "@/lib/cx";
import { IMAGE_TYPES } from "@/lib/image-type";
import { NEW_FIGHTER } from "@/lib/fighter-match";
import type { Discipline } from "@/lib/types";
import type { SheetAssumption, SheetProblem } from "@/lib/sheet";

/**
 * Pasting the running order in, and correcting it before any of it is written.
 *
 * The parse is `parseSheet` and lives in lib/sheet.ts, so what is here is only
 * the three things a browser has to do: show what was read, let every field of
 * it be changed, and carry the answers back. Nothing is written until the button
 * at the bottom is pressed, which is the whole argument for a preview — a card
 * is a promoter's word to fifteen sets of fighters and coaches, and a parser
 * being confidently wrong about a weight is not a thing to find out afterwards.
 *
 * A name changed here re-asks the match question through the same `findFighters`
 * the add-bout form uses, because the alternative is a corrected name whose
 * question nobody can answer and an import that refuses with nowhere to go.
 */

const LOOKUP_DELAY_MS = 600;

type Corner = "red" | "blue";

type RowCorner = {
  name: string;
  gym: string;
  choice: string;
  lookup: FighterLookup | null;
  looking: boolean;
};

type Row = {
  line: number;
  red: RowCorner;
  blue: RowCorner;
  discipline: Discipline;
  weightKg: string;
  classLabel: string;
  womens: boolean;
  rounds: string;
  roundMinutes: string;
  assumed: SheetAssumption[];
  /** Which dropped poster this bout is on, and where each fighter is on it. */
  posterId: string;
  crops: PosterCrops;
};

type Poster = { id: string; file: File; url: string };

const NO_CROPS: PosterCrops = { red: null, blue: null };

function rowFrom(bout: PreviewBout): Row {
  return {
    line: bout.line,
    // `elsewhere` is false here rather than asked: it is one extra query per
    // name and the preview already runs the one that matters. A name edited on
    // this panel goes through `findFighters`, which answers both halves.
    red: {
      name: bout.red.name,
      gym: bout.red.gym,
      choice: "",
      lookup: { candidates: bout.red.candidates, elsewhere: false },
      looking: false,
    },
    blue: {
      name: bout.blue.name,
      gym: bout.blue.gym,
      choice: "",
      lookup: { candidates: bout.blue.candidates, elsewhere: false },
      looking: false,
    },
    discipline: bout.discipline,
    weightKg: String(bout.weightKg),
    classLabel: bout.classLabel,
    womens: bout.womens,
    rounds: String(bout.rounds),
    roundMinutes: String(bout.roundMinutes),
    assumed: bout.assumed,
    posterId: "",
    crops: NO_CROPS,
  };
}

/** What the sheet did not carry, named rather than shown as a fact. */
function AssumedNote({ assumed }: { assumed: SheetAssumption[] }) {
  if (!assumed.length) return null;
  const fields = assumed.map((field) => SHEET_IMPORT.assumedField[field]).join(", ");
  return (
    <p className="text-ash-dim mt-2 text-xs leading-relaxed">
      <span className="text-gold">{SHEET_IMPORT.assumedLabel}:</span> {fields}.{" "}
      {SHEET_IMPORT.assumedNote}
    </p>
  );
}

export function ImportSheetPanel({ slug, startOpen }: { slug: string; startOpen: boolean }) {
  const router = useRouter();
  /**
   * Open on a card with nothing on it and shut on one with a running order —
   * the promoter with fourteen bouts on is here to change one of them — and
   * from then on whatever the promoter left it as.
   *
   * It is state rather than the server's `open` attribute because an import
   * refreshes the page it is on, and the card having gained bouts flipped that
   * attribute back to shut with the confirmation inside it.
   */
  const [open, setOpen] = useState(startOpen);
  /**
   * Plainly a boolean, and deliberately not `useTransition`.
   *
   * The import is one server action followed by two more per poster, and a
   * server action called from inside a transition that is still running waits
   * for that transition to finish — which is the one that is waiting for it. The
   * bouts went on, the photographs never left the browser, and the button sat
   * there saying it was sending them. Nothing here needs a transition: there is
   * no stale UI to keep interactive while it runs.
   */
  const [pending, setPending] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problems, setProblems] = useState<SheetProblem[]>([]);
  const [firstNumber, setFirstNumber] = useState(1);
  const [mainEventFirst, setMainEventFirst] = useState(false);
  const [posters, setPosters] = useState<Poster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const setCorner = useCallback((at: number, corner: Corner, next: Partial<RowCorner>) => {
    setRows(
      (current) =>
        current?.map((row, index) =>
          index === at ? { ...row, [corner]: { ...row[corner], ...next } } : row,
        ) ?? current,
    );
  }, []);

  const setRow = useCallback((at: number, next: Partial<Row>) => {
    setRows(
      (current) =>
        current?.map((row, index) => (index === at ? { ...row, ...next } : row)) ?? current,
    );
  }, []);

  // Object URLs are held by the document until they are let go of, and a
  // promoter who drops six posters, reads a different sheet and drops six more
  // would otherwise be holding twelve full-size images for the life of the tab.
  //
  // **On unmount only**, and the ref is what makes that true. Written as a
  // cleanup keyed on `posters`, React ran the previous one every time the list
  // changed — and the previous one closes over the list as it was — so dropping
  // a second poster revoked the first one's URL and left its crop panel showing
  // a broken image. A cleanup that runs on a change is not a cleanup that runs
  // at the end.
  const live = useRef<Poster[]>([]);
  useEffect(() => {
    live.current = posters;
  }, [posters]);
  useEffect(() => () => live.current.forEach((poster) => URL.revokeObjectURL(poster.url)), []);

  const clear = () => {
    setPosters((current) => {
      current.forEach((poster) => URL.revokeObjectURL(poster.url));
      return [];
    });
    setRows(null);
    setProblems([]);
    setText("");
  };

  const read = async () => {
    setPending(true);
    try {
      const result = await previewSheet(slug, text);
      setAdded(null);
      setError(result.ok ? null : result.error);
      if (!result.ok) return;
      setRows(result.bouts.map(rowFrom));
      setProblems(result.problems);
      setFirstNumber(result.nextNumber);
    } finally {
      setPending(false);
    }
  };

  const add = async () => {
    if (!rows) return;
    setPending(true);
    try {
      const result = await importSheet(
        slug,
        rows.map((row) => ({
          red: { name: row.red.name, gym: row.red.gym, match: row.red.choice },
          blue: {
            name: row.blue.name,
            gym: row.blue.gym,
            match: row.blue.choice,
          },
          discipline: row.discipline,
          weightKg: row.weightKg,
          classLabel: row.classLabel,
          womens: row.womens,
          rounds: row.rounds,
          roundMinutes: row.roundMinutes,
        })),
        mainEventFirst,
      );
      if (!result.ok) {
        setError(result.error);
        setAdded(null);
        return;
      }

      // The bouts are on by this point, so nothing below may be reported as
      // having lost them. A poster that would not upload is said separately and
      // its sentence says the card is unaffected.
      const { photos, posterError } = await sendPosters(slug, rows, posters, result.bouts);

      setError(posterError);
      setAdded(
        [SHEET_ADDED(result.bouts.length), POSTER_PHOTOS_ADDED(photos)].filter(Boolean).join(" "),
      );
      clear();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mt-12">
      <details
        className="group"
        open={open}
        onToggle={(toggle) => setOpen(toggle.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-baseline gap-3">
          <span className="display text-2xl">{SHEET_IMPORT.heading}</span>
          <span className="label">A whole card in one go</span>
          <span aria-hidden className="text-ash-dim ml-auto text-lg">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">−</span>
          </span>
        </summary>
        <p className="text-ash mt-2 max-w-2xl text-xs leading-relaxed">{SHEET_IMPORT.body}</p>

        <div className="border-hairline mt-4 border p-4">
          {!rows ? (
            <>
              <label className="block">
                <span className="label">{SHEET_IMPORT.heading}</span>
                <textarea
                  value={text}
                  onChange={(change) => setText(change.target.value)}
                  rows={6}
                  spellCheck={false}
                  placeholder={SHEET_IMPORT.placeholder}
                  className={cx(inputClass, "mt-1.5 font-mono text-xs")}
                />
              </label>
              <button
                type="button"
                onClick={() => void read()}
                disabled={pending || !text.trim()}
                className="bg-chalk text-ink display hover:bg-gold mt-4 px-5 py-2.5 text-base transition-colors disabled:opacity-50"
              >
                {pending ? SHEET_IMPORT.reading : SHEET_IMPORT.read}
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="display text-xl">{SHEET_IMPORT.previewHeading}</h3>
                <button
                  type="button"
                  onClick={clear}
                  className="text-ash hover:text-chalk text-xs underline underline-offset-2"
                >
                  {SHEET_IMPORT.again}
                </button>
              </div>
              <p className="text-ash mt-2 max-w-2xl text-xs leading-relaxed">
                {SHEET_IMPORT.previewNote}
              </p>

              {rows.length ? (
                <fieldset className="border-hairline mt-4 border p-3">
                  <legend className="label px-1">{SHEET_IMPORT.orderLabel}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { value: false, label: SHEET_IMPORT.orderFirst },
                      { value: true, label: SHEET_IMPORT.orderMain },
                    ].map((option) => (
                      <label
                        key={String(option.value)}
                        className="flex cursor-pointer items-center gap-2.5"
                      >
                        <input
                          type="radio"
                          name="sheetOrder"
                          checked={mainEventFirst === option.value}
                          onChange={() => setMainEventFirst(option.value)}
                          className="accent-chalk h-4 w-4"
                        />
                        <span className="text-chalk text-xs">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="text-ash mt-4 max-w-2xl text-sm leading-relaxed">
                  {SHEET_IMPORT.empty}
                </p>
              )}

              <PosterDrop
                posters={posters}
                onAdd={(added) => setPosters((was) => [...was, ...added])}
              />

              <div className="mt-4 grid gap-3">
                {rows.map((row, at) => (
                  <PreviewRow
                    key={row.line}
                    slug={slug}
                    row={row}
                    number={mainEventFirst ? firstNumber + rows.length - 1 - at : firstNumber + at}
                    posters={posters}
                    onCorner={(corner, next) => setCorner(at, corner, next)}
                    onRow={(next) => setRow(at, next)}
                  />
                ))}
              </div>

              {problems.length > 0 && (
                <div className="border-hairline mt-4 border p-3">
                  <h4 className="display text-base">{SHEET_IMPORT.problemsHeading}</h4>
                  <p className="text-ash mt-1.5 text-xs leading-relaxed">
                    {SHEET_IMPORT.problemsNote}
                  </p>
                  <ul className="mt-3 grid gap-1.5">
                    {problems.map((problem) => (
                      <li key={problem.line} className="text-xs leading-relaxed">
                        <span className="text-ash-dim">{problem.line}.</span>{" "}
                        <span className="text-chalk">{problem.text}</span>{" "}
                        <span className="text-ash">
                          {SHEET_IMPORT.problemReason[problem.reason]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => void add()}
                  disabled={pending}
                  className="bg-chalk text-ink display hover:bg-gold mt-4 px-5 py-2.5 text-base transition-colors disabled:opacity-50"
                >
                  {pending ? SHEET_IMPORT.postersPending : addTheseBouts(rows.length)}
                </button>
              )}
            </>
          )}
          <ActionStatus error={error} done={added} className="mt-3" />
        </div>
      </details>
    </section>
  );
}

/** The posters, held in the browser until the bouts they belong to exist. */
function PosterDrop({ posters, onAdd }: { posters: Poster[]; onAdd: (posters: Poster[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="border-hairline mt-4 border p-3">
      <h4 className="display text-base">{SHEET_IMPORT.postersHeading}</h4>
      <p className="text-ash mt-1.5 max-w-2xl text-xs leading-relaxed">
        {SHEET_IMPORT.postersBody}
      </p>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        onChange={(change) => {
          const chosen = [...(change.target.files ?? [])];
          if (!chosen.length) return;
          onAdd(
            chosen.map((file) => ({
              id: `${file.name}-${file.size}-${crypto.randomUUID().slice(0, 8)}`,
              file,
              url: URL.createObjectURL(file),
            })),
          );
          // So the same file chosen twice still fires a change.
          change.target.value = "";
        }}
        className="text-ash mt-3 block w-full text-xs file:mr-3 file:border file:border-hairline file:bg-panel file:px-3 file:py-1.5 file:text-chalk"
      />
      {posters.length > 0 && (
        <p className="text-ash-dim mt-2 text-xs">
          {posters.map((poster) => poster.file.name).join(", ")}
        </p>
      )}
    </div>
  );
}

function PreviewRow({
  slug,
  row,
  number,
  posters,
  onCorner,
  onRow,
}: {
  slug: string;
  row: Row;
  number: number;
  posters: Poster[];
  onCorner: (corner: Corner, next: Partial<RowCorner>) => void;
  onRow: (next: Partial<Row>) => void;
}) {
  const poster = posters.find((one) => one.id === row.posterId);

  return (
    <div className="border-hairline grid gap-3 border p-3">
      <div className="flex items-baseline gap-3">
        <span className="display text-ash-dim text-sm">Bout {number}</span>
        <span className="label">Line {row.line}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(["red", "blue"] as const).map((corner) => {
          const state = row[corner];
          const confirmed = !!state.choice && state.choice !== NEW_FIGHTER;
          const gym = confirmed
            ? state.lookup?.candidates.find((one) => one.id === state.choice)?.gym
            : undefined;

          return (
            <div
              key={corner}
              className={
                corner === "red"
                  ? "border-red-corner grid gap-3 border-l-2 pl-3"
                  : "border-blue-corner grid gap-3 border-l-2 pl-3"
              }
            >
              <span className="label">{corner === "red" ? "Red corner" : "Blue corner"}</span>
              <Field label="Name">
                <NameBox
                  slug={slug}
                  value={state.name}
                  onChange={(name) => onCorner(corner, { name, choice: "" })}
                  onLookup={(lookup, looking) => onCorner(corner, { lookup, looking })}
                />
              </Field>
              {confirmed ? (
                <div>
                  <span className="label">Gym</span>
                  <div className="text-ash mt-1.5 text-sm">{gym}</div>
                </div>
              ) : (
                <Field label="Gym">
                  <input
                    value={state.gym}
                    onChange={(change) => onCorner(corner, { gym: change.target.value })}
                    className={inputClass}
                  />
                </Field>
              )}
              <MatchPanel
                group={`match-${row.line}-${corner}`}
                name={state.name.trim()}
                lookup={state.lookup}
                looking={state.looking}
                choice={state.choice}
                onChoose={(choice) => onCorner(corner, { choice })}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Discipline">
          <select
            value={row.discipline}
            onChange={(change) => onRow({ discipline: change.target.value as Discipline })}
            className={inputClass}
          >
            {DISCIPLINES.map((value) => (
              <option key={value} value={value}>
                {DISCIPLINE_NAME[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight kg">
          <input
            value={row.weightKg}
            inputMode="decimal"
            onChange={(change) => onRow({ weightKg: change.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Grade">
          <input
            value={row.classLabel}
            onChange={(change) => onRow({ classLabel: change.target.value })}
            className={inputClass}
            placeholder="C CLASS"
          />
        </Field>
        <Field label="Rounds">
          <input
            value={row.rounds}
            inputMode="numeric"
            onChange={(change) => onRow({ rounds: change.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Minutes">
          <input
            value={row.roundMinutes}
            inputMode="numeric"
            onChange={(change) => onRow({ roundMinutes: change.target.value })}
            className={inputClass}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={row.womens}
          onChange={(change) => onRow({ womens: change.target.checked })}
          className="accent-chalk h-4 w-4"
        />
        <span className="label">Women&rsquo;s bout</span>
      </label>

      <AssumedNote assumed={row.assumed} />

      {posters.length > 0 && (
        <div>
          <Field label={SHEET_IMPORT.postersAssign}>
            <select
              value={row.posterId}
              onChange={(change) => onRow({ posterId: change.target.value, crops: NO_CROPS })}
              className={inputClass}
            >
              <option value="">{SHEET_IMPORT.postersNone}</option>
              {posters.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.file.name}
                </option>
              ))}
            </select>
          </Field>
          {poster && (
            <PosterCrop
              url={poster.url}
              crops={row.crops}
              redName={row.red.name}
              blueName={row.blue.name}
              onChange={(crops) => onRow({ crops })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A name box that re-asks the match question when the name under it changes.
 *
 * The same debounce and the same endpoint as the add-bout form: a name still
 * being typed is not a name, and a line read off a sheet must not be one request
 * per keystroke. Without this a promoter correcting a misread surname would be
 * answering a question about the name the parser read, and the import would
 * refuse as out of date with no way to put it right on the screen they are on.
 */
function NameBox({
  slug,
  value,
  onChange,
  onLookup,
}: {
  slug: string;
  value: string;
  onChange: (name: string) => void;
  onLookup: (lookup: FighterLookup | null, looking: boolean) => void;
}) {
  // The name the panel already holds an answer for. The preview arrived with its
  // candidates looked up, so asking again on the way in would be thirty queries
  // for thirty answers already on the screen — and, because a server action
  // queues behind the ones in flight, a burst of them for the import itself to
  // get stuck behind.
  const asked = useRef(value);

  useEffect(() => {
    if (asked.current === value) return;
    asked.current = value;
    const name = value.trim();
    if (name.length < 3) {
      onLookup(null, false);
      return;
    }
    onLookup(null, true);
    const timer = setTimeout(() => {
      void findFighters(slug, name).then((result) => {
        onLookup(
          result.ok ? { candidates: result.candidates, elsewhere: result.elsewhere } : null,
          false,
        );
      });
    }, LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
    // `onLookup` is rebuilt on every render of the row it belongs to, so it is
    // deliberately not a dependency: including it would restart the lookup on
    // every keystroke in any box on the bout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, value]);

  return (
    <input
      value={value}
      onChange={(change) => onChange(change.target.value)}
      className={inputClass}
      required
    />
  );
}

/**
 * The posters and the crops, after the bouts exist.
 *
 * It has to be after: a crop is a photograph on a fighter, and the fighters are
 * minted by the import. The poster itself is never sent: it can carry faces and
 * sponsors that are on no card, and only the crops are anybody's photograph.
 * Every failure is collected rather than thrown, because by this point the
 * running order is on the card and nothing here is worth losing it over. That
 * includes a throw: a refused request or an image the browser cannot decode
 * would otherwise skip the message saying the bouts went on.
 */
async function sendPosters(
  slug: string,
  rows: Row[],
  posters: Poster[],
  landed: { redId: string; blueId: string }[],
): Promise<{ photos: number; posterError: string | null }> {
  let photos = 0;
  let posterError: string | null = null;
  const decoded = new Map<string, ImageBitmap | null>();

  try {
    for (const [at, row] of rows.entries()) {
      const poster = posters.find((one) => one.id === row.posterId);
      const bout = landed[at];
      if (!poster || !bout) continue;

      if (!decoded.has(poster.id)) {
        decoded.set(poster.id, await createImageBitmap(poster.file).catch(() => null));
      }
      const bitmap = decoded.get(poster.id);

      for (const corner of ["red", "blue"] as const) {
        const box = row.crops[corner];
        if (!box) continue;
        if (!bitmap) {
          posterError = ACTION_ERRORS.posterNotStored;
          continue;
        }
        try {
          const blob = await cropToJpeg(bitmap, box);
          const form = new FormData();
          form.append("photo", new File([blob], `${corner}.jpg`, { type: "image/jpeg" }));
          const put = await setFighterPhoto(slug, corner === "red" ? bout.redId : bout.blueId, form);
          if (put.ok) photos += 1;
          else posterError = put.error;
        } catch {
          posterError = ACTION_ERRORS.posterNotStored;
        }
      }
    }
  } finally {
    for (const bitmap of decoded.values()) bitmap?.close();
  }

  return { photos, posterError };
}
