/**
 * What a fighter is asked to agree to, and the rule that decides whether the
 * form may write anything.
 *
 * The text lives here rather than in the component for the same reason the
 * zero-bout strings live in lib/copy.ts: a sentence somebody agreed to is a
 * thing that has to be quotable later. When a fighter asks what they consented
 * to, the answer is `CONSENT_VERSION` and the text below at that version, and
 * both are in the diff of one file. A notice typed into JSX is a notice nobody
 * can produce six months later.
 *
 * The version is the date it last changed rather than a counter, because the
 * only question ever asked of it is "which wording was on screen when this
 * fighter ticked the box". Bump it whenever anything in CONSENT_TEXT changes —
 * a stored version pointing at wording that has since moved is worse than no
 * version at all.
 *
 * Nothing here reads a database or a binding, so it is all testable and the
 * copy is held to the same tone rules as everything else in lib/copy.ts.
 */

/** Bump this whenever CONSENT_TEXT changes. See the note above. */
export const CONSENT_VERSION = "2026-09-08";

/**
 * Amateur cards do run junior bouts, and this form is not the place for one.
 * A profile is published, put in a video and sold sponsorship against, and none
 * of that is a thing a child can agree to on a phone in a car park. So the age
 * is asked first and a fighter under this is sent to the promoter rather than
 * through the form.
 */
export const MINIMUM_AGE = 18;

/**
 * How long a fighter's details are kept after the last show they were on.
 *
 * Read by the privacy notice, by the consent text and by scripts/retention.mjs,
 * so the number a fighter was told is the number the script uses. Changing it
 * here changes all three, which is the point of it being here.
 */
export const RETENTION_DAYS = 180;

/**
 * The notice, and the sentence beside the tick.
 *
 * Written to be read on a phone before anything is typed: what is collected,
 * everywhere it is shown, who decides, how long it is kept, and how to take it
 * back. The sponsors' line is here because it is the part a fighter is least
 * likely to have guessed — their photograph appears on a page and at the end of
 * a video that other businesses have paid to be beside.
 */
export const CONSENT_TEXT = {
  heading: "Before you fill this in",
  intro:
    "This form collects details about you and publishes them. This is what happens to them.",
  points: [
    {
      label: "What this collects",
      body:
        "Your photograph, your age, your hometown, your nickname, your record, your walkout " +
        "song, your Instagram handle and anything you write about yourself. Your name, your " +
        "gym and your bout come from the promoter's running order rather than from here.",
    },
    {
      label: "Where it appears",
      body:
        "On the public programme for this show, in the tale of the tape video for your bout, " +
        "and on the promoter's own dashboard. Sponsors of the show and of your bout are shown " +
        "beside it on the page and at the end of the video.",
    },
    {
      label: "Who decides what goes on the card",
      body:
        "The promoter running this show. EventIQ builds and stores the programme for them and " +
        "does nothing else with what you send.",
    },
    {
      label: "How long it is kept",
      body:
        `For this show, and while you are on cards this promoter is running. It is cleared ` +
        `within ${RETENTION_DAYS} days of the last show you appeared on.`,
    },
    {
      label: "Taking it back",
      body:
        "There is a Remove my details control at the foot of this form. It clears everything " +
        "you sent and takes your photograph down. The promoter can do the same on request.",
    },
  ],
  /** The sentence beside the required tick. This is the agreement itself. */
  tick:
    "I have read this, and I agree to my details and my photograph going on the programme " +
    "for this show, in the video for my bout, and beside the sponsors of the show.",
  /** The link out to the full notice, which the page below the form repeats. */
  privacyLink: "Read the full privacy notice",
  age: {
    label: "Your age",
    hint: `This form is for fighters aged ${MINIMUM_AGE} and over.`,
  },
} as const;

/** Everything in the notice as flat strings, for the tone tests. */
export const CONSENT_STRINGS: readonly string[] = [
  CONSENT_TEXT.heading,
  CONSENT_TEXT.intro,
  ...CONSENT_TEXT.points.flatMap((point) => [point.label, point.body]),
  CONSENT_TEXT.tick,
  CONSENT_TEXT.privacyLink,
  CONSENT_TEXT.age.label,
  CONSENT_TEXT.age.hint,
];

/** What the invite row says about consent. Null on both means never given. */
export type ConsentRecord = {
  consentedAt?: number | null;
  consentVersion?: string | null;
  revokedAt?: number | null;
};

/** Whether this invite has a consent on it that is still standing. */
export function hasConsented(record: ConsentRecord): boolean {
  return !!record.consentedAt && !record.revokedAt;
}

/**
 * Old enough to fill this in, as far as the form can tell.
 *
 * An empty box is not an answer either way, so it is neither old enough nor too
 * young: the gate asks for the age before it offers the tick, and silence is not
 * evidence — the same rule that keeps a missing record from being a debut.
 */
export function oldEnough(age: number | undefined): boolean | undefined {
  if (age === undefined || !Number.isFinite(age)) return undefined;
  return age >= MINIMUM_AGE;
}

export type ConsentGate =
  /** Write the consent and nothing else. The tick has just been given. */
  | "record"
  /** Consent is already on the invite. Write the draft. */
  | "allow"
  /** No consent and none offered. Write nothing. */
  | "refuse"
  /** The age on the form is under the minimum. Write nothing, whatever else it says. */
  | "under-age";

/**
 * What a save may do with this draft.
 *
 * The order matters. Age is checked before consent, because a tick from someone
 * too young to give it is not a consent, and a form that stored the age first
 * and refused afterwards would have kept the one field it should not have.
 *
 * "record" is the only way anything is written before consent exists, and it
 * writes the consent alone: the answers in the same draft go in the save
 * straight after it, once there is a consent for them to sit under.
 */
export function consentGate(
  record: ConsentRecord,
  draft: { consented: boolean; age: string },
): ConsentGate {
  const age = draft.age.trim() === "" ? undefined : Number(draft.age);
  if (oldEnough(age) === false) return "under-age";
  if (hasConsented(record)) return "allow";
  return draft.consented ? "record" : "refuse";
}

/**
 * Everything a fighter sent, set back to nothing.
 *
 * The name and the gym are deliberately not here. They came off the promoter's
 * matchmaking sheet rather than out of this form, and they are the running order
 * — clearing them would take a bout off a published card and leave a gap where a
 * fighter is still walking out. The removal copy says exactly that rather than
 * promising everything and leaving two fields behind.
 *
 * One place, because removal and retention have to clear the same set. A column
 * added to the questionnaire and forgotten here is a field that survives a
 * fighter asking for it to go.
 */
export function clearedFighterColumns(now: number) {
  return {
    nickname: null,
    hometown: null,
    age: null,
    heightCm: null,
    reachCm: null,
    stance: null,
    photo: null,
    cutout: null,
    stylised: null,
    instagram: null,
    recordW: null,
    recordL: null,
    recordD: null,
    finishKo: null,
    finishSub: null,
    walkoutTitle: null,
    walkoutArtist: null,
    bio: null,
    styleTags: null,
    updatedAt: now,
  } as const;
}

/**
 * Whether the stylised portrait is switched on for this deployment.
 *
 * Off unless the variable says otherwise, in every shape an operator is likely
 * to write it. A feature that sends a fighter's photograph to a model has to be
 * something somebody turned on deliberately, so an unset, misspelled or empty
 * value is off rather than on.
 */
export function flagOn(value: string | undefined | null): boolean {
  return ["1", "on", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}
