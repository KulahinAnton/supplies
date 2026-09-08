import * as z from "zod";
import {
  actorNameSchema,
  dateString,
  expiryStateSchema,
  movementReasonSchema,
  quantityString,
  stockStateSchema,
  unitSchema,
} from "./common";

/**
 * An item as every list shows it: the row, plus the two states computed FROM
 * it by the engine rather than by the caller.
 *
 * Both states travel because they are independent (§3.4/§3.5) — an item can be
 * well stocked and half-expired, and a client that had to derive either one
 * would be a second implementation of a rule.
 */
export const itemViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: unitSchema,
  quantity: quantityString,
  minQty: quantityString,
  stock: stockStateSchema,
  expiry: expiryStateSchema,
  categoryName: z.string(),
  locationName: z.string().nullable(),
  nextExpiry: dateString.nullable(),
  batchCount: z.number().int(),
  /** Feature 26 — the set this item is counted with, if any. */
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
});

/**
 * Feature 28's slice, plus what the controls need to describe it.
 *
 * `from`/`to` are 1-based and inclusive, and both are 0 on an empty page so
 * «0–0 з 0» never renders as «1–0 з 0». `categories` is every category in the
 * household rather than only those on this page: the chips have to offer the
 * ones that would filter to something else.
 */
export const itemsPageSchema = z.object({
  rows: z.array(itemViewSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageCount: z.number().int(),
  from: z.number().int(),
  to: z.number().int(),
  categories: z.array(z.string()),
});

export const batchSchema = z.object({
  id: z.string(),
  quantity: quantityString,
  expiresAt: dateString.nullable(),
  openedAt: dateString.nullable(),
  location: z.object({ id: z.string(), name: z.string() }).nullable(),
  addedBy: actorNameSchema,
  createdAt: dateString,
});

export const itemMovementSchema = z.object({
  id: z.string(),
  reason: movementReasonSchema,
  delta: quantityString,
  occurredAt: dateString,
  user: actorNameSchema,
});

/**
 * One item, with its raw batches rather than a per-batch state.
 *
 * Note what is NOT here: an expiry state per batch. The server sends the date
 * and `warnDays`, and the client calls `batchExpiryState` — the same pure
 * function the Next page calls. Sending a computed state per batch would put a
 * second copy of Feature 13's category inheritance on the wire.
 */
export const itemDetailSchema = z.object({
  item: z.object({
    id: z.string(),
    name: z.string(),
    unit: unitSchema,
    minQty: quantityString,
    notes: z.string().nullable(),
    barcode: z.string().nullable(),
    /** Feature 3 — archived, never deleted; movements still reference it. */
    isArchived: z.boolean(),
    batches: z.array(batchSchema),
    groupId: z.string().nullable(),
    categoryId: z.string(),
    locationId: z.string().nullable(),
    category: z.object({ id: z.string(), name: z.string() }),
    location: z.object({ id: z.string(), name: z.string() }).nullable(),
    /** Most recent first, capped at 50 by the query. */
    movements: z.array(itemMovementSchema),
  }),
  household: z.object({ expiryWarnDays: z.number().int() }),
  warnDays: z.number().int(),
  quantity: quantityString,
  stock: stockStateSchema,
  expiry: expiryStateSchema,
});

/**
 * Feature 3 — deliberately thinner than `itemView`. An archived item has no
 * stock state worth showing and no expiry worth warning about, because it is
 * out of every list and every reminder; badges here would imply otherwise.
 */
export const archivedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: unitSchema,
  categoryName: z.string(),
  quantity: quantityString,
});

/** Feature 16 — every name in the household, archived ones included. */
export const namedItemSchema = z.object({ id: z.string(), name: z.string() });

/** Feature 21 — what a scan on /items resolved to. */
export const barcodeItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("found"), itemId: z.string() }),
  z.object({ kind: z.literal("missing") }),
]);

/** Features 10, 18.2 and 20 — what a barcode turned out to be. */
export const barcodeLookupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), itemId: z.string(), name: z.string() }),
  z.object({ kind: z.literal("product"), suggestedName: z.string() }),
  z.object({
    kind: z.literal("unknown"),
    manufacturer: z.string().nullable(),
    canShare: z.boolean(),
  }),
]);

export type ItemView = z.infer<typeof itemViewSchema>;
export type ItemsPage = z.infer<typeof itemsPageSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type ItemMovement = z.infer<typeof itemMovementSchema>;
export type ItemDetail = z.infer<typeof itemDetailSchema>;
export type ArchivedItem = z.infer<typeof archivedItemSchema>;
export type NamedItemRow = z.infer<typeof namedItemSchema>;
export type BarcodeItem = z.infer<typeof barcodeItemSchema>;
export type BarcodeLookup = z.infer<typeof barcodeLookupSchema>;
