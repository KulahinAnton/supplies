import { z } from "zod";
import { UNITS } from "@/lib/units";
import {
  BARCODE_PATTERN,
  key,
  nonNegativeQuantityString,
} from "@/lib/validation/shared";

// zod v4 keeps a `const` tuple's literal members, so the inferred type stays
// `Unit` rather than widening to string. The list comes from `lib/units.ts`
// rather than the generated client so this schema can be shared with clients
// that have no database — the API validates requests with it, and the SPA and
// the RN app resolve their forms against the same object.
const unitField = z.enum(UNITS);

export const itemSchema = z.object({
  name: z.string().trim().min(1, key("item.nameRequired")),
  categoryId: z.string().min(1, key("item.nameRequired")),
  locationId: z.string().optional(),
  /** Feature 26 — the set this item is counted with. Empty = none. */
  groupId: z.string().optional(),
  unit: unitField,
  minQty: nonNegativeQuantityString,
  barcode: z
    .string()
    .trim()
    .regex(BARCODE_PATTERN, key("item.duplicateBarcode"))
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
