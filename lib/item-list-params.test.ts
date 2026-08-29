import { describe, expect, it } from "vitest";
import {
  itemListSearch,
  parseFilter,
  parseSort,
  type ItemListState,
} from "@/lib/item-list-params";

const state = (over: Partial<ItemListState> = {}): ItemListState => ({
  query: "",
  filter: "all",
  category: "all",
  sort: "name",
  ...over,
});

describe("itemListSearch", () => {
  it("is empty for an untouched list, so /items stays /items", () => {
    expect(itemListSearch(state())).toBe("");
  });

  it("carries only what differs from the default", () => {
    expect(itemListSearch(state({ filter: "OUT" }))).toBe("filter=OUT");
    expect(itemListSearch(state({ sort: "expiring" }))).toBe("sort=expiring");
  });

  it("trims the search text", () => {
    // Trailing spaces change the URL without changing what is on screen, so
    // Back would restore a view that looks identical but is not.
    expect(itemListSearch(state({ query: "  молоко  " }))).toBe("q=%D0%BC%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE");
    expect(itemListSearch(state({ query: "   " }))).toBe("");
  });

  it("encodes everything a category name might contain", () => {
    const search = itemListSearch(state({ category: "Побутова хімія" }));
    expect(new URLSearchParams(search).get("cat")).toBe("Побутова хімія");
  });

  it("round-trips a fully specified view", () => {
    const full = state({ query: "сік", filter: "LOW", category: "Напої", sort: "newest" });
    const params = new URLSearchParams(itemListSearch(full));
    expect(params.get("q")).toBe("сік");
    expect(parseFilter(params.get("filter"))).toBe("LOW");
    expect(params.get("cat")).toBe("Напої");
    expect(parseSort(params.get("sort"), "name")).toBe("newest");
  });
});

describe("parseFilter / parseSort", () => {
  it("accepts the real values", () => {
    expect(parseFilter("attention")).toBe("attention");
    expect(parseSort("expiring", "name")).toBe("expiring");
  });

  /** A link someone edited by hand must not produce an empty or broken list. */
  it("falls back on anything else", () => {
    expect(parseFilter("nonsense")).toBe("all");
    expect(parseFilter(null)).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(parseSort("by-price", "name")).toBe("name");
    expect(parseSort(undefined, "oldest")).toBe("oldest");
  });
});
