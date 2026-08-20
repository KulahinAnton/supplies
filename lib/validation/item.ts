import { z } from "zod";
import { Unit } from "@/lib/generated/prisma/enums";
import { key, nonNegativeQuantityString } from "@/lib/validation/shared";

// zod v4 accepts an enum-like object directly, which keeps the inferred type
// as `Unit` rather than widening it to string.
const unitField = z.enum(Unit);

export const itemSchema = z.object({
  name: z.string().trim().min(1, key("item.nameRequired")),
  categoryId: z.string().min(1, key("item.nameRequired")),
  locationId: z.string().optional(),
  unit: unitField,
  minQty: nonNegativeQuantityString,
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, key("item.duplicateBarcode"))
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Feature 18.2 — explicit opt-in to publish this product to Open Food Facts. */
  shareToOff: z.boolean().optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const updateItemSchema = itemSchema.extend({
  id: z.string().min(1, key("item.notFound")),
});

export type ItemInput = z.infer<typeof itemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
