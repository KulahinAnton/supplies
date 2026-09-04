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
