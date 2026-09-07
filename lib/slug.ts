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
 * Whether a name can be turned into an address at all.
 *
 * A fighter's id can fall back to something generic because nothing is typed to
 * reach it; a show's address is printed on the table card, so it has to come
 * from the name the promoter chose.
 */
export function hasSlug(value: string): boolean {
  return slugify(value).length > 0;
}
