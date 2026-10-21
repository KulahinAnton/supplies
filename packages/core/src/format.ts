/**
 * Ukrainian display formatting (PROJECT_PROMPT.md §8).
 *
 * Every date and number the user sees goes through here. Do not call
 * `toLocaleString()` ad hoc in a component — the point of this file is that
 * "4,5 л" and "19.08.2026" look the same on every screen.
 *
 * Deliberately Prisma-free: client components import this, and pulling the
 * generated client into a browser bundle drags `node:module` in with it. Any
 * decimal — the engine's, or one straight off a database row — satisfies
 * `Numeric` via its `toString()`, so callers pass one without this module ever
 * importing a runtime.
 */

import type { Unit } from "./units";
import { daysBetween } from "./period";

/** Anything that stringifies to a decimal: Decimal, string, or number. */
export type Numeric = string | number | { toString(): string };

const LOCALE = "uk-UA";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC", // date-only values are UTC-midnight; see lib/period.ts
});

/**
 * Movement timestamps are real instants, so the zone they render in is a
 * decision — and leaving it to the process was the wrong one. Locally that is
 * Kyiv and looks right; on Vercel it is UTC, so every «Останні дії» entry in
 * production has been showing 2–3 hours earlier than it happened.
 *
 * Hardcoded rather than a `Household.timezone` column, which is what the
 * "settings are data, not constants" rule would otherwise ask for. There is
 * one household in one city, and `lib/digest.ts` already hardcodes the same
 * zone to decide when noon is. Add the column the day a second timezone
 * exists, and change both places together.
 */
const HOUSEHOLD_TIME_ZONE = "Europe/Kyiv";

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: HOUSEHOLD_TIME_ZONE,
});

/** `DD.MM.YYYY` — for date-only values (expiry, opened). */
export function formatDate(value: Date): string {
  return dateFormatter.format(value);
}

/** `DD.MM.YYYY, HH:MM` — for real instants (movement timestamps). */
export function formatDateTime(value: Date): string {
  return dateTimeFormatter.format(value);
}

/**
 * uk-UA groups thousands with U+00A0, a NO-BREAK space — so a quantity never
 * wraps across a line between its thousands. The decimal separator is a comma.
 */
const GROUP_SEPARATOR = "\u00A0";
const DECIMAL_SEPARATOR = ",";

/**
 * Thousands separators, on the digit STRING rather than through
 * `Intl.NumberFormat`.
 *
 * This used to be `groupFormatter.format(BigInt(whole))`, and **it silently
 * did nothing on a phone.** Hermes's `Intl.NumberFormat.prototype.format`
 * refuses a BigInt — `TypeError: Cannot convert BigInt to number` — so every
 * quantity hit the "not a number, show it raw" fallback and came back as the
 * wire string: «0.8 кг» with a decimal POINT where the web showed «0,8 кг»,
 * and no grouping at all. Nobody noticed because the seed has no four-digit
 * quantities and an ungrouped integer looks exactly like a grouped one.
 *
 * A `Number` argument does work on Hermes, and the values here are
 * `Decimal(12,3)` so nine integer digits never leave the safe range. It is
 * still not used: this is the second time an `Intl` constructor has behaved
 * differently on the phone (see `selectUkPlural`), and a package that is
 * portable by contract should not keep discovering that one screen at a time.
 * Grouping digits is four lines and `format.test.ts` pins it against Node's
 * real `Intl.NumberFormat` across four orders of magnitude.
 */
function groupDigits(digits: string): string {
  let grouped = "";
  for (let end = digits.length; end > 0; end -= 3) {
    const chunk = digits.slice(Math.max(0, end - 3), end);
    grouped = grouped ? `${chunk}${GROUP_SEPARATOR}${grouped}` : chunk;
  }
  return grouped;
}

/**
 * Quantity with the Ukrainian decimal comma and no trailing zeros:
 * `4.500` → "4,5", `10.000` → "10", `0.250` → "0,25".
 */
export function formatQuantity(value: Numeric): string {
  const raw = String(value).trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;

  const [wholeRaw = "", fractionRaw = ""] = unsigned.split(".");
  // Postgres hands back Decimal(12,3) with its zeros intact; drop them.
  const fraction = fractionRaw.replace(/0+$/, "");
  // `.5` is a quantity; `007` is not written that way but formats as 7.
  const whole = (wholeRaw === "" ? "0" : wholeRaw).replace(/^0+(?=\d)/, "");

  // NaN, Infinity, "1e5" — show it rather than invent a number from it.
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fractionRaw)) return raw;

  const sign = negative ? "-" : "";
  const grouped = groupDigits(whole);
  return fraction
    ? `${sign}${grouped}${DECIMAL_SEPARATOR}${fraction}`
    : `${sign}${grouped}`;
}

/**
 * Ukrainian plural selection — CLDR's `uk` rule, written out rather than asked
 * for.
 *
 * This used to be `new Intl.PluralRules(LOCALE)`, and it crashed the React
 * Native app on load: **Hermes ships `Intl.DateTimeFormat`, `Intl.NumberFormat`
 * and `Intl.Collator`, but not `Intl.PluralRules`.** The other three
 * constructors in this file are fine on the same engine, which is why the
 * failure was one line rather than the whole module.
 *
 * The alternative was `@formatjs/intl-pluralrules` in the phone's entry file.
 * Rejected: `packages/core` is portable by contract, and a polyfill in one
 * client papers over a runtime assumption the *package* got wrong — the next
 * consumer with a partial ICU hits it again. This app is Ukrainian-only by
 * design (§8), so it needs one language's rule, not CLDR's machinery.
 *
 * The rule is fixed and short. `format.test.ts` compares it against Node's own
 * `Intl.PluralRules` across every integer 0–1000 plus decimals, so "written
 * out" does not mean "guessed at".
 *
 *   one   v = 0 and i % 10 = 1      and i % 100 ≠ 11
 *   few   v = 0 and i % 10 = 2..4   and i % 100 ≠ 12..14
 *   many  v = 0 and (i % 10 = 0 or i % 10 = 5..9 or i % 100 = 11..14)
 *   other everything else — i.e. anything with a fractional part
 */
export type UkPluralCategory = "one" | "few" | "many" | "other";

export function selectUkPlural(count: number): UkPluralCategory {
  // `v` in CLDR terms: a number with visible fraction digits is always "other"
  // in Ukrainian — «1,5 літра» takes no plural form of its own.
  if (!Number.isInteger(count)) return "other";

  const i = Math.abs(count);
  const mod10 = i % 10;
  const mod100 = i % 100;

  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}

export type UkPlural = { one: string; few: string; many: string };

export function pluralUk(count: number, forms: UkPlural): string {
  const rule = selectUkPlural(count);
  if (rule === "one") return forms.one;
  if (rule === "few") return forms.few;
  // "many" and "other" share a form: «5 штук», «1,5 штук». Ukrainian has no
  // separate word for the fractional case and this is what the previous
  // `Intl`-backed version did too.
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

/**
 * Feature 32.1 — a price in dollars, at the scale these actually land on.
 *
 * Four decimals because a recipe suggestion costs a fraction of a cent, and
 * rounding it to two would print "0,00 $" — which reads as free rather than as
 * cheap, and loses the only information the number carries.
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount);
}
