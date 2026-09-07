import type { Unit } from "@supplies/core/units";

/**
 * A shopping row as this screen needs it — flattened from the API shape, with
 * `archivedAt` revived.
 *
 * The revival is not cosmetic: `groupShoppingRows` in `@supplies/core` splits
 * on this being null, and on the server it is handed a Prisma row. JSON has no
 * date type, so without this the engine would compare a string.
 */
export type ListRow = {
  id: string;
  label: string;
  itemId: string | null;
  groupId: string | null;
  note: string | null;
  /** Feature 14.2 — null means visible in its group. */
  archivedAt: Date | null;
  unit: Unit | null;
  isChecked: boolean;
  addedBy: string;
  checkedBy: string | null;
};

export type Candidate = {
  /**
   * Feature 26 — null for a set. A set is several products, so there is no
   * single item to write down; it goes on the list as free text and the
   * shopper picks a brand in the shop.
   */
  itemId: string | null;
  name: string;
  detail: string;
};
