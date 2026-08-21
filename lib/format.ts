/**
 * Ukrainian display formatting (PROJECT_PROMPT.md §8).
 *
 * Every date and number the user sees goes through here. Do not call
 * `toLocaleString()` ad hoc in a component — the point of this file is that
 * "4,5 л" and "19.08.2026" look the same on every screen.
 *
 * Deliberately Prisma-free: client components import this, and pulling the
 * generated client into a browser bundle drags `node:module` in with it. A
 * `Prisma.Decimal` satisfies `Numeric` via its `toString()`, so callers pass
 * one without this module ever importing the runtime.
 */

import type { Unit } from "@/lib/generated/prisma/enums";
import { daysBetween } from "@/lib/period";

/** Anything that stringifies to a decimal: Decimal, string, or number. */
export type Numeric = string | number | { toString(): string };

const LOCALE = "uk-UA";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC", // date-only values are UTC-midnight; see lib/period.ts
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `DD.MM.YYYY` — for date-only values (expiry, opened). */
export function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

/** `DD.MM.YYYY, HH:MM` — for real instants (movement timestamps). */
export function formatDateTime(value: Date): string {
  return dateTimeFormatter.format(value);
}

const groupFormatter = new Intl.NumberFormat(LOCALE, {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/**
 * Quantity with the Ukrainian decimal comma and no trailing zeros:
 * `4.500` → "4,5", `10.000` → "10", `0.250` → "0,25".
 */
export function formatQuantity(value: Numeric): string {
  const raw = String(value).trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;

  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  // Postgres hands back Decimal(12,3) with its zeros intact; drop them.
  const fraction = fractionRaw.replace(/0+$/, "");
  const whole = wholeRaw === "" ? "0" : wholeRaw;

  let grouped: string;
  try {
    grouped = groupFormatter.format(BigInt(whole));
  } catch {
    // Not an integer string (NaN, Infinity…) — show it rather than crash.
    return raw;
  }

  const sign = negative ? "-" : "";
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

/**
 * Ukrainian plural selection. Ukrainian has three forms and picking them with
 * `n === 1 ? a : b` is wrong the moment a count reaches 2 or 5:
 * 1 пляшка / 2 пляшки / 5 пляшок.
 */
const pluralRules = new Intl.PluralRules(LOCALE);

export type UkPlural = { one: string; few: string; many: string };

export function pluralUk(count: number, forms: UkPlural): string {
  const rule = pluralRules.select(count);
  if (rule === "one") return forms.one;
  if (rule === "few") return forms.few;
  return forms.many;
}

/** Compact unit label, the default in tables and chips: "10 шт.", "4,5 л". */
export const UNIT_SHORT: Record<Unit, string> = {
  PIECE: "шт.",
  PACK: "уп.",
  GRAM: "г",
  KILOGRAM: "кг",
  MILLILITRE: "мл",
  LITRE: "л",
};

/** Full unit name, declined — for prose and bot replies. */
export const UNIT_PLURAL: Record<Unit, UkPlural> = {
  PIECE: { one: "штука", few: "штуки", many: "штук" },
  PACK: { one: "упаковка", few: "упаковки", many: "упаковок" },
  GRAM: { one: "грам", few: "грами", many: "грамів" },
  KILOGRAM: { one: "кілограм", few: "кілограми", many: "кілограмів" },
  MILLILITRE: { one: "мілілітр", few: "мілілітри", many: "мілілітрів" },
  LITRE: { one: "літр", few: "літри", many: "літрів" },
};

/** "4,5 л" */
export function formatQuantityWithUnit(value: Numeric, unit: Unit): string {
  return `${formatQuantity(value)} ${UNIT_SHORT[unit]}`;
}

/** "4,5 літра" style prose, used by the bot and by rule messages. */
export function formatQuantityWithUnitLong(value: Numeric, unit: Unit): string {
  const count = Number(String(value));
  const label = pluralUk(Number.isFinite(count) ? count : 0, UNIT_PLURAL[unit]);
  return `${formatQuantity(value)} ${label}`;
}

const DAY_FORMS: UkPlural = { one: "день", few: "дні", many: "днів" };

/**
 * The shelf-life situation of a batch, as a complete phrase.
 *
 * This deliberately carries its own verb rather than returning a bare
 * "через 7 днів" for callers to prefix. The previous version did the latter
 * and all three of its call sites read it wrong: the badge rendered
 * «Придатне через 7 днів» — "becomes good in 7 days" — for something that
 * *expires* in 7 days, and the digest listed already-expired items under
 * «Псується» as a bare «3 дні тому». A phrase saying when a date falls
 * cannot be safely glued to a word saying what that date means.
 *
 * Lowercase initial so it drops into a bullet list; the badge capitalises.
 */
export function formatExpiryLabel(expiresAt: Date, today: Date): string {
  const days = daysBetween(today, expiresAt);
  if (days === 0) return "спливає сьогодні";
  if (days === 1) return "спливає завтра";
  if (days === -1) return "прострочено вчора";
  if (days > 1) return `придатне ще ${days} ${pluralUk(days, DAY_FORMS)}`;
  const overdue = Math.abs(days);
  return `прострочено ${overdue} ${pluralUk(overdue, DAY_FORMS)} тому`;
}

/** "5 днів" — the bare count, for chips that already say what it means. */
export function formatDays(days: number): string {
  return `${days} ${pluralUk(days, DAY_FORMS)}`;
}
