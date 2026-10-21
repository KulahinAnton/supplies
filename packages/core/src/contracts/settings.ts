import * as z from "zod";
import { quantityString, stockStateSchema, unitSchema } from "./common";

/**
 * A category, with the count that makes a delete refusable.
 *
 * `expiryWarnDays` is null when the category inherits the household's window
 * (Feature 13) — null and 0 are different answers, which is why this is
 * nullable rather than defaulted.
 */
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  sortOrder: z.number().int(),
  expiryWarnDays: z.number().int().nullable(),
  isDefault: z.boolean(),
  _count: z.object({ items: z.number().int() }),
});

export const storageLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  isDefault: z.boolean(),
  _count: z.object({ items: z.number().int() }),
});

export const taxonomySchema = z.object({
  categories: z.array(categorySchema),
  locations: z.array(storageLocationSchema),
});

/**
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household DATA, not
 * constants. The engine takes them as input, which is why they are on the
 * wire rather than compiled into each client.
 */
export const householdSchema = z.object({
  id: z.string(),
  name: z.string(),
  expiryWarnDays: z.number().int(),
  digestHour: z.number().int(),
  aiEnabled: z.boolean(),
});

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

/**
 * Feature 26 — a set owns the low-stock threshold, so a household short of
 * "milk" is reminded once rather than once per brand.
 */
export const groupViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: stockStateSchema,
  quantity: quantityString,
  minQty: quantityString,
  unit: unitSchema.nullable(),
  memberCount: z.number().int(),
});

/**
 * `compatible` is decided by the SERVER — Feature 26's one-unit rule, which an
 * empty set waives. The picker shows every candidate and says why the
 * incompatible ones cannot join, rather than hiding items someone is looking
 * for; deciding it client-side would be a second copy of the rule.
 */
export const groupDetailSchema = z.object({
  group: z.object({ id: z.string(), name: z.string(), minQty: quantityString }),
  view: groupViewSchema,
  members: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      unit: unitSchema,
      quantity: quantityString,
    }),
  ),
  candidates: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      unit: unitSchema,
      barcode: z.string().nullable(),
      currentGroupName: z.string().nullable(),
      compatible: z.boolean(),
    }),
  ),
});

export type Category = z.infer<typeof categorySchema>;
export type StorageLocation = z.infer<typeof storageLocationSchema>;
export type Taxonomy = z.infer<typeof taxonomySchema>;
export type Household = z.infer<typeof householdSchema>;
export type Member = z.infer<typeof memberSchema>;
export type GroupView = z.infer<typeof groupViewSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
