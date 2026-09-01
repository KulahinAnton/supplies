import { z } from "zod";
import {
  key,
  optionalDateOnly,
  quantityString,
  nonNegativeQuantityString,
} from "@/lib/validation/shared";

/**
 * One row of the multi-batch add form (PROJECT_PROMPT.md Feature 4) — a
 * quantity with its own expiry date. Ten bottles of water across three dates
 * is one submit with three of these.
 */
export const batchRowSchema = z.object({
  quantity: quantityString,
  expiresAt: optionalDateOnly,
  openedAt: optionalDateOnly,
  /**
   * Feature 22 — where this batch goes. Omitted means "wherever the item
   * says", which is what the shopping-list buy flow sends and what every
   * batch predating the feature means.
   */
  locationId: z.string().optional(),
});

/**
 * Feature 31 — the id the browser made for this write, so the same operation
 * cannot be applied twice however it arrives. Optional: the Telegram bot and
 * anything predating the feature simply do not send one.
 */
const clientOpId = z.string().uuid().optional();

export const addStockSchema = z.object({
  clientOpId,
  itemId: z.string().min(1, key("item.notFound")),
  rows: z.array(batchRowSchema).min(1, key("batch.rowsRequired")),
  note: z.string().trim().max(300).optional(),
});

export const consumeSchema = z.object({
  clientOpId,
  itemId: z.string().min(1, key("item.notFound")),
  quantity: quantityString,
  note: z.string().trim().max(300).optional(),
});

/** Feature 24 — take from one named batch, expiry notwithstanding. */
export const consumeBatchSchema = z.object({
  clientOpId,
  batchId: z.string().min(1, key("stock.batchNotFound")),
  quantity: quantityString,
  note: z.string().trim().max(300).optional(),
});

export const discardSchema = z.object({
  batchId: z.string().min(1, key("stock.batchNotFound")),
  note: z.string().trim().max(300).optional(),
});

export const correctionSchema = z.object({
  batchId: z.string().min(1, key("stock.batchNotFound")),
  quantity: nonNegativeQuantityString,
  note: z.string().trim().max(300).optional(),
});

export type BatchRowInput = z.infer<typeof batchRowSchema>;
export type AddStockInput = z.infer<typeof addStockSchema>;
export type ConsumeInput = z.infer<typeof consumeSchema>;
