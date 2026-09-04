import { describe, expect, it } from "vitest";
import { Decimal } from "@/lib/decimal";
import type { ItemView } from "@/lib/queries";
import {
  MAX_PANTRY_LINES,
  RECIPE_SYSTEM_PROMPT,
  buildRecipePrompt,
  estimateCostUsd,
  pantryLines,
} from "@/lib/recipes";

const dec = (n: string) => new Decimal(n);

function item(over: Partial<ItemView> & { name: string }): ItemView {
  return {
    id: over.name,
    unit: "PIECE",
    minQty: dec("0"),
    quantity: dec("1"),
    stock: "OK",
    expiry: "FRESH",
    categoryName: "Продукти",
    locationName: null,
    nextExpiry: null,
    batchCount: 1,
    createdAt: new Date("2026-01-01"),
    warnDays: 7,
    groupId: null,
    groupName: null,
    ...over,
    name: over.name,
  };
}

describe("pantryLines", () => {
  it("never offers expired food", () => {
    // The app's own screens call this spoiled. Suggesting someone cook with it
    // would be worse than suggesting nothing, and no prompt wording is as
    // reliable as not sending it.
    const lines = pantryLines([
      item({ name: "Молоко", expiry: "EXPIRED" }),
      item({ name: "Яйця" }),
    ]);
    expect(lines.join("\n")).not.toContain("Молоко");
    expect(lines).toHaveLength(1);
  });

  it("leaves out what the household does not have", () => {
    const lines = pantryLines([
      item({ name: "Хліб", quantity: dec("0"), stock: "OUT" }),
      item({ name: "Яйця" }),
    ]);
    expect(lines.join("\n")).not.toContain("Хліб");
  });

  it("puts what is about to spoil first, soonest date leading", () => {
    const lines = pantryLines([
      item({ name: "Сіль" }),
      item({
        name: "Йогурт",
        expiry: "SOON",
        nextExpiry: new Date("2026-09-05"),
      }),
      item({
        name: "Сир",
        expiry: "SOON",
        nextExpiry: new Date("2026-09-02"),
      }),
    ]);
    expect(lines[0]).toContain("Сир");
    expect(lines[1]).toContain("Йогурт");
    expect(lines[2]).toContain("Сіль");
  });

  it("says how much there is, and flags the urgent ones", () => {
    const lines = pantryLines([
      item({ name: "Молоко", unit: "LITRE", quantity: dec("2"), expiry: "SOON" }),
      item({ name: "Борошно", unit: "KILOGRAM", quantity: dec("1.5") }),
    ]);
    expect(lines[0]).toBe("Молоко — 2 л (скоро зіпсується)");
    expect(lines[1]).toBe("Борошно — 1,5 кг");
  });

  it("is empty for an empty house rather than throwing", () => {
    expect(pantryLines([])).toEqual([]);
  });
});

describe("buildRecipePrompt", () => {
  it("carries the date, because the question says today", () => {
    const prompt = buildRecipePrompt(["Яйця — 6 шт."], new Date("2026-09-01T00:00:00Z"));
    expect(prompt).toContain("2026-09-01");
    expect(prompt).toContain("Яйця — 6 шт.");
  });

  it("caps how much pantry one request pays for", () => {
    const many = Array.from({ length: MAX_PANTRY_LINES + 25 }, (_, i) => `Товар ${i}`);
    const prompt = buildRecipePrompt(many, new Date("2026-09-01T00:00:00Z"));
    expect(prompt).toContain("Товар 0");
    expect(prompt).not.toContain(`Товар ${MAX_PANTRY_LINES + 1}`);
  });
});

describe("RECIPE_SYSTEM_PROMPT", () => {
  it("asks for some of the pantry, not all of it", () => {
    // The brief the feature was asked for: pick what is worth using, and do
    // not try to empty the fridge into one dish.
    expect(RECIPE_SYSTEM_PROMPT).toContain("від 1 до 6");
    expect(RECIPE_SYSTEM_PROMPT).toContain("Не намагайся використати все");
  });

  it("asks in Ukrainian, for one dish, favouring what will spoil", () => {
    expect(RECIPE_SYSTEM_PROMPT).toContain("українською");
    expect(RECIPE_SYSTEM_PROMPT).toContain("ОДНУ страву");
    expect(RECIPE_SYSTEM_PROMPT).toContain("скоро зіпсується");
  });

  it("forbids inventing food the household does not have", () => {
    expect(RECIPE_SYSTEM_PROMPT).toContain("Не вигадуй продуктів");
  });
});

describe("non-food in the pantry", () => {
  it("warns the model that the list is not all edible", () => {
    // The list is the household's whole inventory: shampoo, paracetamol and
    // cat food sit in it beside the eggs. Filtering by category would be
    // sturdier, but categories are named by each household and cannot be
    // matched reliably — so the model is told, which costs one line.
    expect(RECIPE_SYSTEM_PROMPT).toContain("НЕхарчові");
    expect(RECIPE_SYSTEM_PROMPT).toContain("Ігноруй їх повністю");
  });
});

describe("estimateCostUsd", () => {
  it("prices the two halves separately, because they are billed separately", () => {
    // Haiku 4.5: $1 in, $5 out per million. A real press: 1628 in, 218 out.
    const cost = estimateCostUsd("claude-haiku-4-5", { input: 1628, output: 218 });
    expect(cost).toBeCloseTo(1628 / 1e6 + (218 * 5) / 1e6, 10);
    // A quarter of a cent — the number the UI exists to make legible.
    expect(cost!).toBeLessThan(0.005);
  });

  it("returns nothing for a model it has no price for", () => {
    // ANTHROPIC_MODEL can name anything. A confidently wrong price would be
    // worse than no price, so the UI shows tokens alone in that case.
    expect(estimateCostUsd("some-future-model", { input: 100, output: 100 })).toBeNull();
  });

  it("charges nothing for nothing", () => {
    expect(estimateCostUsd("claude-haiku-4-5", { input: 0, output: 0 })).toBe(0);
  });
});
