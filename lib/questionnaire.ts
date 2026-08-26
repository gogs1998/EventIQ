import type { Fighter, Stance } from "@/lib/types";

/**
 * The shape of a half-filled questionnaire.
 *
 * Every field is a string, including the numeric ones, because a form that
 * silently drops "one hundred and eighty" or coerces an empty box to zero is a
 * form that lies about a fighter. Numbers are only parsed at the edges: once
 * when building the preview, once when writing to the database.
 *
 * This is shared between the client and the server actions so that the thing
 * being autosaved is exactly the thing being previewed.
 */
export type Draft = {
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

export const EMPTY_DRAFT: Draft = {
  nickname: "",
  instagram: "",
  bio: "",
  walkoutTitle: "",
  walkoutArtist: "",
  hometown: "",
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

export const STYLE_OPTIONS = [
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

export const STANCES: Stance[] = ["Orthodox", "Southpaw", "Switch"];

function str(value: number | string | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

export function num(value: string): number | undefined {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

/**
 * A returning fighter gets their details back rather than a blank form. That is
 * the retention hook in the whole idea, and it is the reason fighters are their
 * own table rather than rows hanging off a bout.
 */
export function draftFromFighter(fighter: Fighter): Draft {
  return {
    nickname: str(fighter.nickname),
    instagram: str(fighter.instagram),
    photo: fighter.photo,
    cutout: fighter.cutout,
    bio: str(fighter.bio),
    walkoutTitle: str(fighter.walkoutSong?.title),
    walkoutArtist: str(fighter.walkoutSong?.artist),
    hometown: str(fighter.hometown),
    age: str(fighter.age),
    heightCm: str(fighter.heightCm),
    reachCm: str(fighter.reachCm),
    stance: str(fighter.stance),
    w: str(fighter.record?.w),
    l: str(fighter.record?.l),
    d: str(fighter.record?.d),
    ko: str(fighter.finishes?.ko),
    sub: str(fighter.finishes?.sub),
    styleTags: fighter.styleTags ?? [],
    sponsorIds: fighter.sponsorIds ?? [],
  };
}

/**
 * The preview above the form, and the row that eventually gets written.
 *
 * A record appears only when at least one of the three boxes has something in
 * it. Defaulting an untouched form to 0-0-0 would announce every fighter who
 * never answered as making their debut, which is the bug isDebut exists to stop.
 */
export function fighterFromDraft(base: Fighter, draft: Draft): Fighter {
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
    record:
      w !== undefined || l !== undefined || d !== undefined
        ? { w: w ?? 0, l: l ?? 0, d: d ?? 0 }
        : undefined,
    finishes: ko !== undefined || sub !== undefined ? { ko: ko ?? 0, sub: sub ?? 0 } : undefined,
    walkoutSong: draft.walkoutTitle
      ? { title: draft.walkoutTitle, artist: draft.walkoutArtist || "Unknown" }
      : undefined,
    styleTags: draft.styleTags.length ? draft.styleTags : undefined,
    sponsorIds: draft.sponsorIds.length ? draft.sponsorIds : undefined,
  };
}

/**
 * The sponsors a fighter may actually claim, in the order they picked them.
 *
 * sanitiseDraft cannot do this on its own: it has no idea which sponsors exist,
 * so anything the browser sent used to go straight at the join table and be
 * refused by the foreign key. That refusal was the problem rather than the
 * protection, because it arrived after the rest of the profile had saved and
 * after the fighter's existing sponsors had been deleted.
 *
 * Duplicates come out as well as unknowns, since the join table is keyed on the
 * pair and a repeated id would fail the insert for a payload that is merely
 * clumsy rather than hostile.
 */
export function allowedSponsorIds(requested: string[], allowed: Iterable<string>): string[] {
  const exists = new Set(allowed);
  return [...new Set(requested)].filter((id) => exists.has(id));
}

/**
 * Trusting nothing from the browser. Lengths are capped so a paste of a novel
 * into the story box cannot fill the database, and the numbers are clamped to
 * ranges a human being can actually be: an eleven-foot fighter on the card is a
 * worse outcome than a rejected keystroke.
 */
export function sanitiseDraft(input: unknown): Draft {
  const raw = (input ?? {}) as Record<string, unknown>;

  const text = (key: keyof Draft, max: number) => {
    const value = raw[key];
    return typeof value === "string" ? value.slice(0, max).trim() : "";
  };

  const digits = (key: keyof Draft, max: number) => {
    const value = raw[key];
    if (typeof value !== "string" || value.trim() === "") return "";
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0 || n > max) return "";
    return String(n);
  };

  const list = (key: keyof Draft, allowed: string[] | null, max: number) => {
    const value = raw[key];
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === "string")
      .filter((item) => !allowed || allowed.includes(item))
      .slice(0, max);
  };

  const photo = typeof raw.photo === "string" ? raw.photo : undefined;

  return {
    nickname: text("nickname", 40),
    instagram: text("instagram", 40).replace(/^@/, ""),
    // Only ever a key we wrote ourselves. A caller supplying an arbitrary URL
    // here would otherwise get an image of their choosing onto a promoter's card.
    photo: photo?.startsWith("/media/") || photo?.startsWith("/fighters/") ? photo : undefined,
    cutout:
      typeof raw.cutout === "string" && raw.cutout.startsWith("/fighters/") ? raw.cutout : undefined,
    bio: text("bio", 600),
    walkoutTitle: text("walkoutTitle", 80),
    walkoutArtist: text("walkoutArtist", 80),
    hometown: text("hometown", 60),
    age: digits("age", 80),
    heightCm: digits("heightCm", 250),
    reachCm: digits("reachCm", 260),
    stance: STANCES.includes(raw.stance as Stance) ? (raw.stance as string) : "",
    w: digits("w", 200),
    l: digits("l", 200),
    d: digits("d", 200),
    ko: digits("ko", 200),
    sub: digits("sub", 200),
    styleTags: list("styleTags", STYLE_OPTIONS, 3),
    sponsorIds: list("sponsorIds", null, 6),
  };
}
