import { z } from "zod";
import { ruleMessage, type MessageKey, type RuleMessage } from "../messages";

/**
 * Zod messages are message KEYS, not prose (PROJECT_PROMPT.md §8) — the same
 * schema runs on the client and inside a server action, and only the render
 * site knows how to turn a key into Ukrainian.
 */
export function key(value: MessageKey): string {
  return value;
}

/** Turn the first zod issue into the RuleMessage an action returns. */
export function firstIssueAsRuleMessage(error: z.ZodError): RuleMessage {
  const issue = error.issues[0];
  const candidate = issue?.message as MessageKey | undefined;
  return candidate ? ruleMessage(candidate) : ruleMessage("error.unexpected");
}

/**
 * A quantity as typed by a human: accepts "1,5" as well as "1.5", because a
 * Ukrainian keyboard produces the comma and nobody should have to care.
 * Output is a canonical decimal string for Prisma (§7 — never a float).
 */
export const quantityString = z
  .string()
  .trim()
  .min(1, key("stock.quantityPositive"))
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d+(\.\d{1,3})?$/.test(value), {
    message: key("stock.quantityPositive"),
  });

/** Same, but zero is allowed — thresholds and corrections may legitimately be 0. */
export const nonNegativeQuantityString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value.replace(",", ".")))
  .refine((value) => /^\d+(\.\d{1,3})?$/.test(value), {
    message: key("stock.correctionNegative"),
  });

/** `YYYY-MM-DD` from an `<input type="date">`, or nothing at all. */
export const optionalDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, key("batch.expiryInPast"))
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * The one definition of "looks like a barcode": 6–14 digits.
 *
 * It lives here because it had been written out three times — the item schema,
 * the form lookup and the items-list search — and one copy lost its backslash,
 * becoming /^d{6,14}$/, which matches the letter "d" and no digit at all. That
 * made every scan from the items list report "not found" while the identical
 * scan in the form worked, since only one copy was broken. Three literals
 * cannot disagree if there is only one.
 */
export const BARCODE_PATTERN = /^\d{6,14}$/;

export function isBarcodeShaped(value: string): boolean {
  return BARCODE_PATTERN.test(value);
}
