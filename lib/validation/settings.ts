import { z } from "zod";
import { key } from "@/lib/validation/shared";

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
});

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, key("auth.nameRequired")),
  icon: z.string().trim().default("package"),
});

export const locationSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, key("auth.nameRequired")),
});
