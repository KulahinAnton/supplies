import { formatQuantityWithUnit } from "@supplies/core/format";
import type { ItemView } from "@/lib/queries";

/**
 * Feature 32 — what Claude is told about the pantry, and what to do with it.
 *
 * Pure and tested here, because the prompt IS the feature: everything that
 * decides whether the suggestion is any good lives in these strings, and none
 * of it should need an API key to check.
 *
 * The brief the model gets is deliberately narrow. It is not asked to be a
 * chef; it is asked to pick a few things the household already has, preferring
 * what will otherwise be thrown away, and say what to do with them.
 */

/** Item names alone would strip the two facts that make the answer useful. */
export type PantryLine = string;

const EXPIRY_NOTE: Record<ItemView["expiry"], string> = {
  EXPIRED: "прострочено",
  SOON: "скоро зіпсується",
  FRESH: "",
  NONE: "",
};

/**
 * The pantry as the model sees it: one line per item, shortest form that still
 * carries a decision.
 *
 * **Expired items are excluded outright.** Suggesting someone cook with food
 * the app itself flags as spoiled would be worse than suggesting nothing, and
 * no wording in a prompt is as reliable as not sending it.
 *
 * **Items at zero are excluded too** — a recipe is about what is in the house,
 * and the shopping list is a different screen.
 *
 * Ordered by urgency, soonest first. That ordering is the recommendation: the
 * model is told the list is sorted that way and to favour the top of it, which
 * is cheaper and more reliable than restating priorities per line.
 */
export function pantryLines(items: readonly ItemView[]): PantryLine[] {
  return items
    .filter((item) => item.expiry !== "EXPIRED")
    .filter((item) => item.quantity.greaterThan(0))
    .slice()
    .sort(byUrgencyThenName)
    .map((item) => {
      const note = EXPIRY_NOTE[item.expiry];
      const amount = formatQuantityWithUnit(item.quantity, item.unit);
      return note ? `${item.name} — ${amount} (${note})` : `${item.name} — ${amount}`;
    });
}

function byUrgencyThenName(a: ItemView, b: ItemView): number {
  const urgency = (item: ItemView) => (item.expiry === "SOON" ? 0 : 1);
  const byUrgency = urgency(a) - urgency(b);
  if (byUrgency !== 0) return byUrgency;

  const aDate = a.nextExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bDate = b.nextExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aDate !== bDate) return aDate - bDate;

  return a.name.localeCompare(b.name, "uk-UA");
}

/**
 * A ceiling on how much pantry goes in one request.
 *
 * The household this was built for holds tens of items, not hundreds, so this
 * is a guard against a pathological list rather than a routine trim — but it is
 * the difference between a request that costs a fraction of a cent and one that
 * quietly does not. The most urgent items survive the cut, because the list is
 * already sorted that way.
 */
export const MAX_PANTRY_LINES = 60;

/** Below this there is nothing to work with, and no request worth paying for. */
export const MIN_PANTRY_LINES = 2;

/**
 * The standing brief. Stable across requests on purpose — it is the part that
 * would be worth caching if it were ever long enough to qualify, and a prompt
 * that changes every call is one nobody can reason about.
 */
export const RECIPE_SYSTEM_PROMPT = [
  "Ти — помічник української родини, яка веде облік домашніх запасів.",
  "Тобі дають перелік того, що зараз є вдома, відсортований за терміном придатності: найтерміновіше — зверху.",
  "",
  "Запропонуй ОДНУ страву на сьогодні.",
  "",
  "Правила:",
  "- Використай від 1 до 6 позицій зі списку — рівно стільки, скільки справді потрібно страві. Не намагайся використати все.",
  "- Віддавай перевагу тому, що скоро зіпсується.",
  "- У списку можуть бути НЕхарчові речі: побутова хімія, ліки, гігієна, корм для тварин. Ігноруй їх повністю.",
  "- Можеш припустити, що вдома є сіль, перець, олія та вода — їх не треба брати зі списку.",
  "- Не вигадуй продуктів, яких немає у списку, окрім названих вище базових.",
  "- Страва має бути простою та реальною для домашньої кухні.",
  "",
  "Формат відповіді — звичайний текст українською, без markdown, рівно такий:",
  "Назва страви",
  "",
  "Знадобиться:",
  "- продукт — скільки",
  "",
  "Як готувати:",
  "1. крок",
  "2. крок",
  "",
  "Не пиши нічого поза цим форматом.",
].join("\n");

/**
 * The per-request half: just the pantry.
 *
 * The date goes in because "today" is in the question and a model with no clock
 * cannot otherwise honour it — and because two clicks on the same day should be
 * allowed to differ, which sampling handles, rather than being nudged by a
 * timestamp that changes every second.
 */
export function buildRecipePrompt(lines: readonly PantryLine[], today: Date): string {
  const dateKey = today.toISOString().slice(0, 10);
  return [
    `Сьогодні ${dateKey}. Удома є:`,
    "",
    ...lines.slice(0, MAX_PANTRY_LINES),
    "",
    "Що приготувати?",
  ].join("\n");
}

/**
 * Feature 32.1 — what a press actually cost, in money.
 *
 * "Токени: 1628 → 218" told nobody anything. Two numbers with no unit and no
 * scale invite exactly one question — is that a lot? — and the answer is the
 * point of showing them at all.
 *
 * Prices are per MILLION tokens, and input and output are billed differently:
 * output is five times dearer here, which is why `max_tokens` is the lever that
 * matters rather than the length of the pantry.
 *
 * Only models this table knows are priced. An `ANTHROPIC_MODEL` override that
 * is not listed shows the token counts without a figure, because a confidently
 * wrong price is worse than none.
 */
const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
};

export function estimateCostUsd(
  model: string,
  usage: { input: number; output: number },
): number | null {
  const price = PRICES_PER_MILLION[model];
  if (!price) return null;
  return (
    (usage.input * price.input + usage.output * price.output) / 1_000_000
  );
}
