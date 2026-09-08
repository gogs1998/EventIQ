/**
 * Stands in for `next/cache`.
 *
 * Every action calls `revalidatePath` on its way out and it is the framework's
 * business rather than the rule's, so it is recorded and otherwise ignored — a
 * test that wants to can assert on which paths an action refreshed.
 */

const revalidated: string[] = [];

export function revalidatePath(path: string): void {
  revalidated.push(path);
}

export function revalidateTag(tag: string): void {
  revalidated.push(tag);
}

export function revalidatedPaths(): readonly string[] {
  return revalidated;
}

export function clearRevalidated(): void {
  revalidated.length = 0;
}
