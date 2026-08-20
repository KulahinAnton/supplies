/**
 * Feature 15.1 — reordering a settings list. Pure, so the index arithmetic is
 * stated once and tested rather than re-derived in a drag handler.
 */

/**
 * Move the item at `from` to `to`, shifting everything between. Returns a new
 * array; the input is left alone.
 *
 * Out-of-range indexes return the list unchanged rather than throwing — a drag
 * that ends somewhere unexpected should be a no-op, not an error.
 */
export function moveInList<T>(items: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Reorder by id rather than index, which is what a drag gives us.
 * An unknown id leaves the list untouched.
 */
export function moveIdInList(
  ids: readonly string[],
  activeId: string,
  overId: string,
): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return [...ids];
  return moveInList(ids, from, to);
}

/**
 * Feature 15.2 — which row a new item should start on.
 *
 * The starred one, else the first by the list's own order, else nothing. The
 * caller decides whether "nothing" is acceptable: it is for a storage location
 * («Не вказано» is a real answer) but not for a category, which every item
 * must have.
 */
export function defaultRowId<T extends { id: string; isDefault: boolean }>(
  rows: readonly T[],
  fallbackToFirst: boolean,
): string | null {
  const starred = rows.find((row) => row.isDefault);
  if (starred) return starred.id;
  if (fallbackToFirst && rows.length > 0) return rows[0].id;
  return null;
}
