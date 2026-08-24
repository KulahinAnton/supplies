import { describe, expect, it } from "vitest";
import { isItemSort, sortItems, type SortableItem } from "@/lib/item-sort";

const item = (
  name: string,
  createdAtMs: number,
  nextExpiryIso: string | null = null,
): SortableItem => ({ name, createdAtMs, nextExpiryIso });

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

describe("sortItems — expiring", () => {
  const day = (iso: string | null) => iso;

  it("puts the most overdue first and the next-to-go behind it", () => {
    const rows = [
      item("Сир", 1, day("2026-09-01")), // fresh
      item("Молоко", 2, day("2026-08-01")), // expired longest ago
      item("Йогурт", 3, day("2026-08-20")), // expired more recently
    ];
    expect(sortItems(rows, "expiring").map((r) => r.name)).toEqual([
      "Молоко",
      "Йогурт",
      "Сир",
    ]);
  });

  /**
   * The rule that matters most: an item with no date is not urgent, it is
   * unknown. Floating it to the top would bury a carton that went off last
   * week under a bag of rice nobody dated.
   */
  it("sinks undated items to the bottom", () => {
    const rows = [
      item("Рис", 1, null),
      item("Сіль", 2, null),
      item("Молоко", 3, day("2026-08-01")),
    ];
    expect(sortItems(rows, "expiring").map((r) => r.name)).toEqual([
      "Молоко",
      "Рис",
      "Сіль",
    ]);
  });

  it("treats an unparseable date as undated, never as most urgent", () => {
    const rows = [
      item("Зіпсована дата", 1, "not-a-date"),
      item("Молоко", 2, day("2026-08-01")),
    ];
    expect(sortItems(rows, "expiring").map((r) => r.name)).toEqual([
      "Молоко",
      "Зіпсована дата",
    ]);
  });

  it("breaks ties on the same date by name, so the order is total", () => {
    const rows = [
      item("Яблука", 1, day("2026-08-10")),
      item("Апельсини", 2, day("2026-08-10")),
    ];
    expect(sortItems(rows, "expiring").map((r) => r.name)).toEqual([
      "Апельсини",
      "Яблука",
    ]);
  });

  it("leaves the input array alone", () => {
    const rows = [item("Б", 1, "2026-09-01"), item("А", 2, "2026-08-01")];
    const before = rows.map((r) => r.name);
    sortItems(rows, "expiring");
    expect(rows.map((r) => r.name)).toEqual(before);
  });

  it("accepts the new mode as a stored preference", () => {
    expect(isItemSort("expiring")).toBe(true);
  });
});

describe("sortItems — freshest", () => {
  it("puts the longest shelf life first", () => {
    const rows = [
      item("Молоко", 1, "2026-08-01"),
      item("Консерва", 2, "2028-01-01"),
      item("Сир", 3, "2026-09-01"),
    ];
    expect(sortItems(rows, "freshest").map((r) => r.name)).toEqual([
      "Консерва",
      "Сир",
      "Молоко",
    ]);
  });

  /**
   * The rule holds in BOTH directions: no date means unknown, and unknown
   * never outranks a date. Reversing the comparator without reversing this
   * would float undated items to the top of the "can wait" list, which is
   * the one place nobody would think to check for a mistake.
   */
  it("still sinks undated items, rather than reversing them to the top", () => {
    const rows = [
      item("Рис", 1, null),
      item("Консерва", 2, "2028-01-01"),
      item("Молоко", 3, "2026-08-01"),
    ];
    expect(sortItems(rows, "freshest").map((r) => r.name)).toEqual([
      "Консерва",
      "Молоко",
      "Рис",
    ]);
  });

  it("is the exact reverse of expiring, ignoring undated items", () => {
    const dated = [
      item("А", 1, "2026-08-01"),
      item("Б", 2, "2026-09-01"),
      item("В", 3, "2027-01-01"),
    ];
    const up = sortItems(dated, "expiring").map((r) => r.name);
    const down = sortItems(dated, "freshest").map((r) => r.name);
    expect(down).toEqual([...up].reverse());
  });

  it("is accepted as a stored preference", () => {
    expect(isItemSort("freshest")).toBe(true);
  });
});

describe("stored sort preferences", () => {
  it("still accepts every previously valid value", () => {
    // Renaming the labels must not invalidate what is already in localStorage.
    for (const stored of ["name", "newest", "oldest"]) {
      expect(isItemSort(stored)).toBe(true);
    }
  });

  it("rejects anything else, so a stale value falls back instead of breaking", () => {
    expect(isItemSort("by-price")).toBe(false);
    expect(isItemSort(null)).toBe(false);
  });
});
