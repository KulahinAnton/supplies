import { z } from "zod";
import { key, nonNegativeQuantityString } from "@/lib/validation/shared";

export const householdSettingsSchema = z.object({
  name: z.string().trim().min(1, key("auth.nameRequired")),
  expiryWarnDays: z.coerce
    .number()
    .int()
    .min(0, key("settings.warnDaysRange"))
    .max(365, key("settings.warnDaysRange")),
  digestHour: z.coerce
    .number()
    .int()
    .min(0, key("settings.digestHourRange"))
    .max(23, key("settings.digestHourRange")),
  /** Feature 32.1 — the AI recipe helper, off until a household asks for it. */
  aiEnabled: z.boolean(),
});

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, key("auth.nameRequired")),
  icon: z.string().trim().default("package"),
  /**
   * Feature 13 — null means inherit the household window. An empty string from
   * a cleared input becomes null, NOT 0: clearing the field must return the
   * category to inheriting, while a deliberate 0 means "warn on the day only".
   */
  expiryWarnDays: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(365)])
    .optional()
    .transform((value) =>
      value === "" || value === undefined ? null : value,
    ),
});

/** Feature 26 — a set of interchangeable items, with its own threshold. */
export const itemGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, key("group.nameRequired")),
  minQty: nonNegativeQuantityString,
});

export const locationSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, key("auth.nameRequired")),
});
