import * as z from "zod";
import {
  actorNameSchema,
  dateString,
  quantityString,
  stockStateSchema,
  unitSchema,
} from "./common";
import { itemViewSchema } from "./items";

/**
 * Feature 26 — a set appears in «Закінчується» as ONE row.
 *
 * `unit` is null for an empty set: there is nothing to count yet, and
 * inventing one would make «0» read as a real quantity. The discriminant is
 * what stops a client guessing from the presence of `memberCount`.
 */
export const restockEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("item"),
    id: z.string(),
    name: z.string(),
    state: stockStateSchema,
    quantity: quantityString,
    unit: unitSchema,
    minQty: quantityString,
  }),
  z.object({
    kind: z.literal("group"),
    id: z.string(),
    name: z.string(),
    state: stockStateSchema,
    quantity: quantityString,
    unit: unitSchema.nullable(),
    minQty: quantityString,
    memberCount: z.number().int(),
  }),
]);

export const movementSchema = z.object({
  id: z.string(),
  reason: z.enum(["PURCHASE", "CONSUME", "WASTE", "CORRECTION"]),
  delta: quantityString,
  occurredAt: dateString,
  item: z.object({ id: z.string(), name: z.string(), unit: unitSchema }),
  user: actorNameSchema,
});

/**
 * One request for one screen.
 *
 * `expiryWarnDays` and `hasCategoryOverrides` are Feature 13: the caption has
 * to say «попередження за N дн.» and admit when a category overrides it,
 * which a client cannot know from the item rows alone.
 */
export const dashboardSchema = z.object({
  expiryWarnDays: z.number().int(),
  hasCategoryOverrides: z.boolean(),
  expiring: z.array(itemViewSchema),
  restock: z.array(restockEntrySchema),
  recent: z.array(movementSchema),
});

/** The two numbers on the nav badges. */
export const attentionCountsSchema = z.object({
  expiring: z.number().int(),
  restock: z.number().int(),
});

export type RestockEntry = z.infer<typeof restockEntrySchema>;
export type Movement = z.infer<typeof movementSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type AttentionCounts = z.infer<typeof attentionCountsSchema>;
