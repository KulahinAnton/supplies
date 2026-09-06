/**
 * The shapes the API returns, as the SPA needs them.
 *
 * Hand-written for now. SPA_API_PORT.md Phase 2.2 has these generated from the
 * OpenAPI document at `/docs` with `openapi-typescript`, which is the point at
 * which they stop being able to drift — but generating them before the endpoint
 * set has settled would mean regenerating on every commit for no benefit.
 *
 * Quantities arrive as strings: they are `Decimal(12,3)` in the column and
 * JSON has no decimal type. Never `Number()` one for arithmetic — only for
 * display, and only after `@supplies/core/format` has had it.
 */
import type { Unit } from "@supplies/core/units";

export type StockState = "OUT" | "LOW" | "OK";
export type ExpiryState = "EXPIRED" | "SOON" | "FRESH" | "NONE";

export type ItemView = {
  id: string;
  name: string;
  unit: Unit;
  quantity: string;
  minQty: string;
  stock: StockState;
  expiry: ExpiryState;
  categoryName: string;
  locationName: string | null;
  nextExpiry: string | null;
  batchCount: number;
  groupId: string | null;
  groupName: string | null;
};

export type ItemsPage = {
  rows: ItemView[];
  total: number;
  page: number;
  pageCount: number;
};

export type Batch = {
  id: string;
  quantity: string;
  expiresAt: string | null;
  openedAt: string | null;
  location: { id: string; name: string } | null;
  addedBy: { name: string };
  createdAt: string;
};

/**
 * `getItemDetail` returns the row and the states computed FROM it, rather
 * than a flattened item — deliberately, because the page needs both the raw
 * batches and the household's warn-day window to render batch chips.
 *
 * Note what is NOT here: a per-batch expiry state. The server sends the date
 * and `warnDays`, and the client calls `batchExpiryState` — the same pure
 * function the Next app calls. Sending a computed state per batch would put a
 * second copy of Feature 13's category inheritance on the wire.
 */
export type ItemDetail = {
  item: {
    id: string;
    name: string;
    unit: Unit;
    minQty: string;
    notes: string | null;
    barcode: string | null;
    batches: Batch[];
    category: { id: string; name: string };
    location: { id: string; name: string } | null;
  };
  household: { expiryWarnDays: number };
  warnDays: number;
  quantity: string;
  stock: StockState;
  expiry: ExpiryState;
};
export type AttentionCounts = { expiring: number; restock: number };

export type ShoppingRow = {
  id: string;
  groupId: string | null;
  itemId: string | null;
  freeText: string | null;
  note: string | null;
  quantity: string | null;
  isChecked: boolean;
  archivedAt: string | null;
  item: { id: string; name: string; unit: Unit } | null;
};

export type ShoppingCandidate = {
  itemId: string | null;
  name: string;
  state: StockState;
  quantity: string;
  minQty: string;
  unit: Unit;
};

export type ShoppingView = {
  rows: ShoppingRow[];
  candidates: ShoppingCandidate[];
  groups: { id: string; name: string; sortOrder: number }[];
};

/**
 * The same row with its dates revived.
 *
 * JSON has no date type, so `archivedAt` arrives as a string — and
 * `groupShoppingRows` in `@supplies/core` takes a `Date | null`, because on
 * the server it is handed a Prisma row. The type checker caught the mismatch
 * rather than letting `new Date(string)` comparisons quietly work by accident,
 * which is the argument for sharing the engine's types instead of restating
 * them loosely.
 */
export type RevivedShoppingRow = Omit<ShoppingRow, "archivedAt"> & {
  archivedAt: Date | null;
};

export function reviveShoppingRow(row: ShoppingRow): RevivedShoppingRow {
  return { ...row, archivedAt: row.archivedAt ? new Date(row.archivedAt) : null };
}

export type Category = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  expiryWarnDays: number | null;
  isDefault: boolean;
};

export type StorageLocation = {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
};

export type Taxonomy = { categories: Category[]; locations: StorageLocation[] };

export type Household = {
  id: string;
  name: string;
  expiryWarnDays: number;
  digestHour: number;
  aiEnabled: boolean;
};
