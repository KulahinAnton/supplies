import { describe, expect, it } from "vitest";
import { isItemSort, sortItems, type SortableItem } from "@/lib/item-sort";

const item = (name: string, createdAtMs: number): SortableItem => ({
  name,
  createdAtMs,
});

describe("sortItems", () => {
  const rows = [
    item("Яблука", 300),
    item("Апельсини", 100),
    item("Молоко", 200),
  ];

  it("sorts by name using Ukrainian collation", () => {
    expect(sortItems(rows, "name").map((r) => r.name)).toEqual([
      "Апельсини",
      "Молоко",
      "Яблука",
    ]);
  });

  it("puts the newest first", () => {
    expect(sortItems(rows, "newest").map((r) => r.name)).toEqual([
      "Яблука",
      "Молоко",
      "Апельсини",
    ]);
  });

  it("puts the oldest first", () => {
    expect(sortItems(rows, "oldest").map((r) => r.name)).toEqual([
      "Апельсини",
      "Молоко",
      "Яблука",
    ]);
  });

  it("breaks a timestamp tie by name, so the order is total", () => {
    // The seed creates many items in the same second; without a tie-break they
    // would shuffle between renders.
    const tied = [item("Яблука", 500), item("Апельсини", 500)];
    expect(sortItems(tied, "newest").map((r) => r.name)).toEqual([
      "Апельсини",
      "Яблука",
    ]);
    expect(sortItems(tied, "oldest").map((r) => r.name)).toEqual([
      "Апельсини",
      "Яблука",
    ]);
  });

  it("does not mutate the input", () => {
    const original = [...rows];
    sortItems(rows, "newest");
    expect(rows).toEqual(original);
  });

  it("copes with an empty list and a single row", () => {
    expect(sortItems([], "newest")).toEqual([]);
    expect(sortItems([item("Сіль", 1)], "name").map((r) => r.name)).toEqual([
      "Сіль",
    ]);
  });

  it("sorts Latin and Cyrillic names together without throwing", () => {
    const mixed = [item("Nutella", 1), item("Молоко", 2), item("Coca-cola", 3)];
    expect(sortItems(mixed, "name")).toHaveLength(3);
  });
});

describe("isItemSort", () => {
  it("accepts the three known modes", () => {
    expect(isItemSort("name")).toBe(true);
    expect(isItemSort("newest")).toBe(true);
    expect(isItemSort("oldest")).toBe(true);
  });

  it("rejects anything else — a stale localStorage value must not break the list", () => {
    expect(isItemSort("by-price")).toBe(false);
    expect(isItemSort("")).toBe(false);
    expect(isItemSort(null)).toBe(false);
    expect(isItemSort(undefined)).toBe(false);
    expect(isItemSort(42)).toBe(false);
  });
});
