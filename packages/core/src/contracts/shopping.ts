import * as z from "zod";
import { actorNameSchema, dateString, quantityString, stockStateSchema, unitSchema } from "./common";

/**
 * A row on the shared list.
 *
 * `addedBy` and `checkedBy` are both here because a shared list needs both:
 * the row reads «додав Антон» until someone buys it and «купила Олена»
 * afterwards, so nobody buys the same thing twice on the way home.
 *
 * `itemId` is null for a one-off written as free text, and `freeText` is null
 * for a row that names a real item. Exactly one is always set — a rule the
 * service enforces and this shape merely permits, because expressing it here
 * as a union would make every client destructure two cases to read a label.
 */
export const shoppingRowSchema = z.object({
  id: z.string(),
  groupId: z.string().nullable(),
  itemId: z.string().nullable(),
  freeText: z.string().nullable(),
  note: z.string().nullable(),
  quantity: quantityString.nullable(),
  isChecked: z.boolean(),
  /** Feature 14.2 — null means visible in its group. */
  archivedAt: dateString.nullable(),
  item: z.object({ id: z.string(), name: z.string(), unit: unitSchema }).nullable(),
  addedBy: actorNameSchema,
  checkedBy: actorNameSchema.nullable(),
});

/**
 * Feature 6 — a suggestion, never an insertion.
 *
 * `itemId` is null for a set: a set is several products, so there is no single
 * item to write down, and it goes on the list as free text for the shopper to
 * resolve in the shop.
 */
export const shoppingCandidateSchema = z.object({
  itemId: z.string().nullable(),
  name: z.string(),
  state: stockStateSchema,
  quantity: quantityString,
  minQty: quantityString,
  unit: unitSchema,
});

export const shoppingGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});

/**
 * Feature 11's «Загальна група» is NOT in `groups` — it is `groupId = null`,
 * and `groupShoppingRows` in the engine is what turns that absence into a
 * section. A client that added a synthetic row here would be reimplementing
 * the one interesting case.
 */
export const shoppingViewSchema = z.object({
  rows: z.array(shoppingRowSchema),
  candidates: z.array(shoppingCandidateSchema),
  groups: z.array(shoppingGroupSchema),
});

export type ShoppingRow = z.infer<typeof shoppingRowSchema>;
export type ShoppingCandidate = z.infer<typeof shoppingCandidateSchema>;
export type ShoppingGroupRow = z.infer<typeof shoppingGroupSchema>;
export type ShoppingView = z.infer<typeof shoppingViewSchema>;
