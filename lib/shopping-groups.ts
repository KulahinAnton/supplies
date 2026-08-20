/**
 * Feature 11 — arranging the shopping list into groups. Pure, no Prisma, no
 * React, so the rule that "null means «Загальна група»" is stated once and
 * tested, rather than re-derived in every component that touches the list.
 */

/** The implicit default. Not a row in `ShoppingGroup` — see the schema note. */
export const DEFAULT_GROUP_ID = "__default__";
export const DEFAULT_GROUP_NAME = "Загальна група";

export type GroupRow = {
  id: string;
  name: string;
  sortOrder: number;
};

export type GroupableRow = {
  id: string;
  groupId: string | null;
  isChecked: boolean;
};

export type GroupedList<T extends GroupableRow> = {
  id: string;
  name: string;
  /** True for «Загальна група», which cannot be renamed or deleted. */
  isDefault: boolean;
  open: T[];
  checked: T[];
};

/**
 * Split rows into their groups.
 *
 * «Загальна група» always comes first and is **always present**, even when
 * empty — it is where new rows land, so a family with an empty default group
 * still needs somewhere visible to drop things onto. Named groups follow in
 * `sortOrder`, and they are listed even when empty, because an empty group is
 * still a drop target.
 *
 * A row whose `groupId` names a group that no longer exists falls back to the
 * default rather than vanishing; the database's `SetNull` should prevent that,
 * but a list row is not worth losing to a race.
 */
export function groupShoppingRows<T extends GroupableRow>(
  rows: readonly T[],
  groups: readonly GroupRow[],
): GroupedList<T>[] {
  const ordered = [...groups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "uk-UA"),
  );
  const known = new Set(ordered.map((group) => group.id));

  const buckets = new Map<string, T[]>();
  buckets.set(DEFAULT_GROUP_ID, []);
  for (const group of ordered) buckets.set(group.id, []);

  for (const row of rows) {
    const key =
      row.groupId && known.has(row.groupId) ? row.groupId : DEFAULT_GROUP_ID;
    buckets.get(key)!.push(row);
  }

  const build = (id: string, name: string, isDefault: boolean): GroupedList<T> => {
    const bucket = buckets.get(id) ?? [];
    return {
      id,
      name,
      isDefault,
      open: bucket.filter((row) => !row.isChecked),
      checked: bucket.filter((row) => row.isChecked),
    };
  };

  return [
    build(DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, true),
    ...ordered.map((group) => build(group.id, group.name, false)),
  ];
}

/**
 * Translate a drop target back into what the database stores: the default
 * group is `null`, everything else is its id.
 */
export function groupIdForStorage(targetId: string): string | null {
  return targetId === DEFAULT_GROUP_ID ? null : targetId;
}

/** Groups a row can be moved TO — everything except the one it is already in. */
export function moveTargets(
  currentGroupId: string | null,
  groups: readonly GroupRow[],
): { id: string; name: string }[] {
  const current = currentGroupId ?? DEFAULT_GROUP_ID;
  return [
    { id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME },
    ...[...groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => ({ id: group.id, name: group.name })),
  ].filter((target) => target.id !== current);
}
