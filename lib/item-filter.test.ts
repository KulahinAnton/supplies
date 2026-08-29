import { describe, expect, it } from "vitest";
import { matchesSelection, selectItems, type FilterableItem } from "@/lib/item-filter";

const item = (over: Partial<FilterableItem> = {}): FilterableItem => ({
  name: "Молоко",
  createdAtMs: 1,
  nextExpiryIso: null,
  categoryName: "Продукти",
  stock: "OK",
  expiry: "FRESH",
  ...over,
});

const all = { query: "", filter: "all" as const, category: "all" };

describe("matchesSelection", () => {
  it("matches names case-insensitively, anywhere in the name", () => {
    expect(matchesSelection(item(), { ...all, query: "МОЛО" })).toBe(true);
    expect(matchesSelection(item(), { ...all, query: "локо" })).toBe(true);
    expect(matchesSelection(item(), { ...all, query: "  молоко  " })).toBe(true);
    expect(matchesSelection(item(), { ...all, query: "сік" })).toBe(false);
  });

  it("filters by category", () => {
    expect(matchesSelection(item(), { ...all, category: "Продукти" })).toBe(true);
    expect(matchesSelection(item(), { ...all, category: "Напої" })).toBe(false);
  });

  it("filters by stock state", () => {
    expect(matchesSelection(item({ stock: "OUT" }), { ...all, filter: "OUT" })).toBe(true);
    expect(matchesSelection(item({ stock: "LOW" }), { ...all, filter: "OUT" })).toBe(false);
  });

  /**
   * "Needs attention" spans both axes on purpose: an item can be well stocked
   * and half-expired, and this list is what to look at, not why.
   */
  it("treats either axis as needing attention", () => {
    expect(matchesSelection(item({ stock: "LOW" }), { ...all, filter: "attention" })).toBe(true);
    expect(matchesSelection(item({ expiry: "EXPIRED" }), { ...all, filter: "attention" })).toBe(true);
    expect(matchesSelection(item({ expiry: "SOON" }), { ...all, filter: "attention" })).toBe(true);
    expect(matchesSelection(item(), { ...all, filter: "attention" })).toBe(false);
  });

  it("combines the three, rather than treating them as alternatives", () => {
    const target = item({ name: "Молоко", categoryName: "Напої", stock: "LOW" });
    expect(matchesSelection(target, { query: "мол", filter: "LOW", category: "Напої" })).toBe(true);
    expect(matchesSelection(target, { query: "мол", filter: "OUT", category: "Напої" })).toBe(false);
    expect(matchesSelection(target, { query: "мол", filter: "LOW", category: "Продукти" })).toBe(false);
  });
});

describe("selectItems", () => {
  it("filters and then orders, leaving the input alone", () => {
    const rows = [
      item({ name: "Яблука", stock: "LOW" }),
      item({ name: "Апельсини", stock: "LOW" }),
      item({ name: "Банани", stock: "OK" }),
    ];
    const source = [...rows];
    const result = selectItems(rows, { ...all, filter: "LOW" }, "name");
    expect(result.map((r) => r.name)).toEqual(["Апельсини", "Яблука"]);
    expect(rows).toEqual(source);
  });
});
