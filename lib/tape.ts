import type { Bout, Corner, Discipline, Fighter } from "@/lib/types";

/**
 * Turning fields into a story.
 *
 * Nothing in this file reads the database or any fixture. Every function takes
 * the fighters it works on, which is what lets the same code serve a page
 * rendered from D1, the video exporter, and a unit test, without any of the
 * three needing the other two. Lookups against a loaded show live in lib/card.ts.
 */

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  MMA: "MMA",
  MUAY_THAI: "Muay Thai",
  BOXING: "Boxing",
  K1: "K1",
  GRAPPLING: "Grappling",
};

export function boutClassLine(bout: Bout): string {
  const parts = [`${bout.weightKg}kg`];
  if (bout.womens) parts.push("Women's");
  if (bout.classLabel) parts.push(bout.classLabel);
  parts.push(DISCIPLINE_LABEL[bout.discipline]);
  return parts.join(" · ");
}

export function boutFormat(bout: Bout): string {
  return `${bout.rounds} x ${bout.roundMinutes} min`;
}

export function boutBillingLabel(bout: Bout): string {
  if (bout.billing === "MAIN") return "Main Event";
  if (bout.billing === "CO_MAIN") return "Co Main";
  return `Bout ${bout.number}`;
}

export function totalFights(f: Fighter): number {
  if (!f.record) return 0;
  return f.record.w + f.record.l + f.record.d;
}

/**
 * Only true when the fighter has actually told us they have no fights. Silence
 * is not a debut: announcing a veteran as a debutant because they ignored the
 * questionnaire is worse than saying nothing.
 */
export function isDebut(f: Fighter): boolean {
  return !!f.record && totalFights(f) === 0;
}

export function formatRecord(f: Fighter): string | undefined {
  if (!f.record) return undefined;
  if (isDebut(f)) return "Debut";
  const { w, l, d } = f.record;
  return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
}

export function finishCount(f: Fighter): number {
  if (!f.finishes) return 0;
  return f.finishes.ko + f.finishes.sub;
}

/** Share of wins that ended early, 0..1. Undefined when we cannot know. */
export function finishRate(f: Fighter): number | undefined {
  if (!f.finishes || !f.record || f.record.w === 0) return undefined;
  return Math.min(1, finishCount(f) / f.record.w);
}

export function isUndefeated(f: Fighter): boolean {
  return !!f.record && f.record.l === 0 && f.record.w > 0;
}

export function fullName(f: Fighter): string {
  return f.name;
}

export function lastName(f: Fighter): string {
  const parts = f.name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

export function firstName(f: Fighter): string {
  return f.name.trim().split(/\s+/)[0];
}

// ---------------------------------------------------------------- tape rows

export type TapeRow = {
  key: string;
  label: string;
  red?: string;
  blue?: string;
  redValue?: number;
  blueValue?: number;
  /** Which corner this row favours. Absent when tied, unknown, or not a contest. */
  leader?: Corner;
  /** Human summary of the gap, e.g. "+11cm". */
  edge?: string;
};

type RowSpec = {
  key: string;
  label: string;
  value: (f: Fighter) => number | undefined;
  display: (f: Fighter) => string | undefined;
  /** Whether a bigger number is an advantage. */
  contested?: boolean;
  unit?: string;
};

const ROW_SPECS: RowSpec[] = [
  {
    key: "record",
    label: "Record",
    value: (f) => (f.record ? f.record.w : undefined),
    display: (f) => formatRecord(f),
    contested: true,
  },
  {
    key: "age",
    label: "Age",
    value: (f) => f.age,
    display: (f) => (f.age ? String(f.age) : undefined),
  },
  {
    key: "height",
    label: "Height",
    value: (f) => f.heightCm,
    display: (f) => (f.heightCm ? `${f.heightCm}cm` : undefined),
    contested: true,
    unit: "cm",
  },
  {
    key: "reach",
    label: "Reach",
    value: (f) => f.reachCm,
    display: (f) => (f.reachCm ? `${f.reachCm}cm` : undefined),
    contested: true,
    unit: "cm",
  },
  {
    key: "stance",
    label: "Stance",
    value: () => undefined,
    display: (f) => f.stance,
  },
  {
    key: "finishes",
    label: "Finishes",
    value: (f) => (f.finishes ? finishCount(f) : undefined),
    display: (f) => (f.finishes ? String(finishCount(f)) : undefined),
    contested: true,
  },
  {
    key: "gym",
    label: "Gym",
    value: () => undefined,
    display: (f) => f.gym,
  },
  {
    key: "hometown",
    label: "From",
    value: () => undefined,
    display: (f) => f.hometown,
  },
];

/**
 * Builds the side-by-side rows. A row survives if either corner can fill it, so
 * a half-answered questionnaire still produces a card that looks deliberate
 * rather than broken.
 */
export function buildTape(red: Fighter, blue: Fighter): TapeRow[] {
  return ROW_SPECS.flatMap((spec) => {
    const redDisplay = spec.display(red);
    const blueDisplay = spec.display(blue);
    if (!redDisplay && !blueDisplay) return [];

    const redValue = spec.value(red);
    const blueValue = spec.value(blue);

    let leader: Corner | undefined;
    let edge: string | undefined;
    if (
      spec.contested &&
      redValue !== undefined &&
      blueValue !== undefined &&
      redValue !== blueValue
    ) {
      leader = redValue > blueValue ? "red" : "blue";
      const gap = Math.abs(redValue - blueValue);
      edge = spec.unit ? `+${gap}${spec.unit}` : `+${gap}`;
    }

    return [
      {
        key: spec.key,
        label: spec.label,
        red: redDisplay,
        blue: blueDisplay,
        redValue,
        blueValue,
        leader,
        edge,
      },
    ];
  });
}

/**
 * Lines of the tape the opponent has answered and this fighter has not.
 *
 * The most effective thing we can say to a fighter who has not filled the form
 * in is not a completion percentage, it is that the other one has.
 */
export function tapeGapsBehind(mine: Fighter, theirs: Fighter): string[] {
  return ROW_SPECS.filter(
    (spec) => spec.display(theirs) !== undefined && spec.display(mine) === undefined,
  ).map((spec) => spec.label);
}

// -------------------------------------------------------------------- hooks

export type Hook = {
  /** Higher wins when we only have room for a few. */
  weight: number;
  text: string;
};

/**
 * The reason to care about bout four on a Tuesday. Built from whatever the
 * fighters actually told us, best first.
 */
export function buildHooks(bout: Bout, red: Fighter, blue: Fighter): string[] {
  const hooks: Hook[] = [];

  if (bout.titleLabel) {
    hooks.push({ weight: 100, text: `${bout.titleLabel} on the line.` });
  }

  const redDebut = isDebut(red);
  const blueDebut = isDebut(blue);
  if (redDebut && blueDebut) {
    hooks.push({
      weight: 90,
      text: "Two debutants. Somebody's record starts tonight.",
    });
  } else if (redDebut || blueDebut) {
    const debutant = redDebut ? red : blue;
    hooks.push({
      weight: 70,
      text: `${firstName(debutant)} ${lastName(debutant)} is making their debut.`,
    });
  }

  if (isUndefeated(red) && isUndefeated(blue)) {
    hooks.push({ weight: 95, text: "Neither of them has ever lost." });
  } else if (isUndefeated(red) && red.record!.w >= 3) {
    hooks.push({ weight: 80, text: `${lastName(red)} is unbeaten in ${red.record!.w}.` });
  } else if (isUndefeated(blue) && blue.record!.w >= 3) {
    hooks.push({ weight: 80, text: `${lastName(blue)} is unbeaten in ${blue.record!.w}.` });
  }

  if (red.reachCm && blue.reachCm) {
    const gap = Math.abs(red.reachCm - blue.reachCm);
    if (gap >= 5) {
      const longer = red.reachCm > blue.reachCm ? red : blue;
      hooks.push({ weight: 60, text: `${lastName(longer)} carries ${gap}cm more reach.` });
    }
  }

  if (red.heightCm && blue.heightCm) {
    const gap = Math.abs(red.heightCm - blue.heightCm);
    if (gap >= 7) {
      const taller = red.heightCm > blue.heightCm ? red : blue;
      hooks.push({ weight: 50, text: `${lastName(taller)} looks down at them by ${gap}cm.` });
    }
  }

  if (red.gym === blue.gym) {
    hooks.push({ weight: 85, text: `Same gym. Both out of ${red.gym}.` });
  }

  if (red.hometown && red.hometown === blue.hometown) {
    hooks.push({ weight: 65, text: `${red.hometown} derby.` });
  }

  const redFights = totalFights(red);
  const blueFights = totalFights(blue);
  if (redFights >= 1 && blueFights >= 1 && Math.abs(redFights - blueFights) >= 5) {
    const veteran = redFights > blueFights ? red : blue;
    const rookie = redFights > blueFights ? blue : red;
    hooks.push({
      weight: 75,
      text: `${totalFights(veteran)} fights of experience against ${totalFights(rookie)}.`,
    });
  }

  for (const f of [red, blue]) {
    const rate = finishRate(f);
    if (rate !== undefined && rate >= 0.75 && f.record!.w >= 2) {
      hooks.push({
        weight: 55,
        text: `${lastName(f)} has finished ${finishCount(f)} of ${f.record!.w} wins.`,
      });
    }
  }

  if (
    red.stance &&
    blue.stance &&
    red.stance !== blue.stance &&
    (red.stance === "Southpaw" || blue.stance === "Southpaw")
  ) {
    hooks.push({ weight: 40, text: "Southpaw against orthodox." });
  }

  return hooks
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((h) => h.text);
}

// -------------------------------------------------------------- completeness

/** Fields that earn a fighter a card worth looking at, and what each is worth. */
const COMPLETENESS_FIELDS: { key: string; label: string; weight: number; has: (f: Fighter) => boolean }[] =
  [
    { key: "photo", label: "Photo", weight: 30, has: (f) => !!f.photo },
    { key: "record", label: "Record", weight: 12, has: (f) => !!f.record },
    { key: "hometown", label: "Hometown", weight: 6, has: (f) => !!f.hometown },
    { key: "age", label: "Age", weight: 6, has: (f) => !!f.age },
    { key: "height", label: "Height", weight: 8, has: (f) => !!f.heightCm },
    { key: "reach", label: "Reach", weight: 8, has: (f) => !!f.reachCm },
    { key: "stance", label: "Stance", weight: 4, has: (f) => !!f.stance },
    { key: "nickname", label: "Nickname", weight: 6, has: (f) => !!f.nickname },
    // "Story" rather than "Their story", because this list is read back both to
    // the promoter about a fighter and to the fighter about themselves.
    { key: "bio", label: "Story", weight: 8, has: (f) => !!f.bio },
    { key: "instagram", label: "Instagram", weight: 6, has: (f) => !!f.instagram },
    { key: "walkout", label: "Walkout song", weight: 3, has: (f) => !!f.walkoutSong },
    { key: "sponsors", label: "Sponsors", weight: 3, has: (f) => !!f.sponsorIds?.length },
  ];

export type Completeness = {
  /** 0..100. */
  score: number;
  missing: string[];
};

export function completeness(f: Fighter): Completeness {
  const total = COMPLETENESS_FIELDS.reduce((sum, field) => sum + field.weight, 0);
  const earned = COMPLETENESS_FIELDS.filter((field) => field.has(f)).reduce(
    (sum, field) => sum + field.weight,
    0,
  );
  return {
    score: Math.round((earned / total) * 100),
    missing: COMPLETENESS_FIELDS.filter((field) => !field.has(f)).map((field) => field.label),
  };
}

// ------------------------------------------------------------------ display

export function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatEventDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}
