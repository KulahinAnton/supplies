/**
 * The shapes the API returns — re-exported from `@supplies/core/contracts`,
 * plus the revivers JSON forces on top of them.
 *
 * These used to be hand-written here, 332 lines of it, copied from what the
 * endpoints were observed to send. SPA_API_PORT.md Phase 2.2 replaces that
 * with one definition per shape in the engine, inferred here and **parsed by
 * the API's own e2e suite against a live database**, so the copy that could
 * drift no longer exists. See `packages/core/src/contracts/common.ts` for why
 * the schemas are the source and the OpenAPI document is derived from them
 * rather than the other way round.
 *
 * Quantities arrive as strings: they are `Decimal(12,3)` in the column and
 * JSON has no decimal type. Never `Number()` one for arithmetic — only for
 * display, and only after `@supplies/core/format` has had it.
 */
import { toDecimal, type Decimal } from "@supplies/core/decimal";

export type {
  ArchivedItem,
  Batch,
  BarcodeItem,
  BarcodeLookup,
  ItemDetail,
  ItemMovement,
  ItemView,
  ItemsPage,
  NamedItemRow,
} from "@supplies/core/contracts/items";

export type {
  AttentionCounts,
  Dashboard,
  Movement,
  RestockEntry,
} from "@supplies/core/contracts/dashboard";

export type {
  ShoppingCandidate,
  ShoppingGroupRow,
  ShoppingRow,
  ShoppingView,
} from "@supplies/core/contracts/shopping";

export type {
  Category,
  GroupDetail,
  GroupView,
  Household,
  Member,
  StorageLocation,
  Taxonomy,
} from "@supplies/core/contracts/settings";

export type {
  Health,
  Meta,
  Ready,
  SessionUser,
  TokenPair,
} from "@supplies/core/contracts/auth";

export type { StockState, ExpiryState } from "@supplies/core/contracts/state";

import type { Batch, ItemView } from "@supplies/core/contracts/items";
import type { ShoppingRow } from "@supplies/core/contracts/shopping";

/**
 * A batch as the ENGINE wants it.
 *
 * `fefoOrder` takes `Decimal` and `Date`, because on the server it is handed
 * Prisma rows. Reviving here is what lets the item page call the *same*
 * ordering function the Next page calls, rather than re-deriving "soonest
 * expiry first, then undated oldest-first, expired excluded" — which is §3.3
 * and has no business being written twice.
 *
 * The revivers stay in the SPA rather than moving to the contracts package
 * with the types. They are a CLIENT decision: the phone will want the same
 * three functions, but a server rendering these shapes already has real dates
 * and never needs them, and a shape's description should not carry one
 * consumer's post-processing.
 */
export type RevivedBatch = Omit<Batch, "quantity" | "expiresAt" | "createdAt"> & {
  quantity: Decimal;
  expiresAt: Date | null;
  createdAt: Date;
  /** Kept as it arrived, for display without a second conversion. */
  quantityRaw: string;
};

export function reviveBatch(batch: Batch): RevivedBatch {
  return {
    ...batch,
    quantity: toDecimal(batch.quantity),
    quantityRaw: batch.quantity,
    expiresAt: batch.expiresAt ? new Date(batch.expiresAt) : null,
    createdAt: new Date(batch.createdAt),
  };
}

/**
 * `groupShoppingRows` in `@supplies/core` takes a `Date | null`, because on
 * the server it is handed a Prisma row. The type checker caught that mismatch
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

/**
 * `formatExpiryLabel` and `ExpiryBadge` take a `Date`, same argument as above:
 * JSON's missing date type shows up as a type error here rather than as
 * `new Date(undefined)` somewhere downstream.
 */
export type RevivedItemView = Omit<ItemView, "nextExpiry"> & {
  nextExpiry: Date | null;
};

export function reviveItemView(item: ItemView): RevivedItemView {
  return { ...item, nextExpiry: item.nextExpiry ? new Date(item.nextExpiry) : null };
}
