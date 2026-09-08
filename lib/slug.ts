/**
 * The address a show or a fighter is reached at, derived from their name.
 *
 * It lives here rather than beside the action that first needed it because two
 * different things depend on the same rule — the public programme's `/e/[slug]`
 * and a fighter's id — and because the interesting case cannot be seen by eye:
 * a name made entirely of punctuation or of non-Latin characters slugifies to an
 * empty string. `createEvent` used to accept that and write a row addressed at
 * `/e/`, which is a show nobody can reach and a clash with the next one.
 *
 * So the emptiness is a rule with a name of its own rather than a `|| "fighter"`
 * in one caller and nothing in the other.
 */

/** A slug a promoter can read off a printed card and type into a phone. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      // Trimmed again after the cut, because a long name can be truncated in the
      // middle of a separator and leave the address ending in a hyphen.
      .replace(/-+$/, "")
  );
}

/**
 * The address to use when the one the name makes is already taken.
 *
 * `cage-county-13`, then `cage-county-13-2`, then `-3` — what every publishing
 * system does with a title somebody has already used. It exists because slugs
 * are unique across the whole instance and have to stay that way: `/e/<slug>` is
 * on a QR code printed on the tables and has no promoter segment in it, so the
 * uniqueness is the public URL rather than a modelling accident. See HANDOVER
 * section 6f.
 *
 * Refusing instead was a membership oracle. "There is already a show at that
 * address" told a promoter that a rival has a show of that name in the diary,
 * which is the one fact every other refusal on that path is written to withhold.
 * A derived value that collides is disambiguated, not rejected.
 *
 * The loop terminates because `taken` is finite: at worst it walks past every
 * one of them.
 */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

/**
 * Whether an address is the one this name makes, or a numbered form of it.
 *
 * `cage-county-13` and `cage-county-13-2` are the same show typed twice;
 * `cage-county-13-rematch` is a different show with a similar name, and the
 * whole of the difference is whether what follows the hyphen is a number. It is
 * what lets a promoter be told they already have a show at that address without
 * that answer ever depending on somebody else's shows.
 */
export function sameAddress(base: string, slug: string): boolean {
  if (slug === base) return true;
  if (!slug.startsWith(`${base}-`)) return false;
  return /^[0-9]+$/.test(slug.slice(base.length + 1));
}

/**
 * Whether a name can be turned into an address at all.
 *
 * A fighter's id can fall back to something generic because nothing is typed to
 * reach it; a show's address is printed on the table card, so it has to come
 * from the name the promoter chose.
 */
export function hasSlug(value: string): boolean {
  return slugify(value).length > 0;
}
