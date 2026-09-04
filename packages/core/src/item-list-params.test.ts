import { describe, expect, it } from "vitest";
import {
  itemListSearch,
  parseFilter,
  parseSort,
  DEFAULT_PER_PAGE,
  parsePage,
  parsePerPage,
  sanitizeListSearch,
  type ItemListState,
} from "./item-list-params";

const state = (over: Partial<ItemListState> = {}): ItemListState => ({
  query: "",
  filter: "all",
  category: "all",
  sort: "name",
  page: 1,
  perPage: DEFAULT_PER_PAGE,
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

describe("sanitizeListSearch", () => {
  it("round-trips a real list query", () => {
    const search = itemListSearch(
      state({ query: "кава", filter: "LOW", category: "Напої", sort: "expiring" }),
    );
    expect(sanitizeListSearch(search)).toBe(search);
  });

  it("is empty for nothing, so the back link stays plain /items", () => {
    expect(sanitizeListSearch(undefined)).toBe("");
    expect(sanitizeListSearch("")).toBe("");
  });

  /**
   * The value arrives inside a URL, so it is re-parsed rather than pasted
   * through. Anything the list cannot render is dropped.
   */
  it("drops unknown keys and invalid values", () => {
    expect(sanitizeListSearch("q=сік&evil=1&filter=nonsense&sort=by-price")).toBe(
      "q=%D1%81%D1%96%D0%BA",
    );
  });

  it("cannot be made to describe anything but a list", () => {
    // No amount of input turns this into a path, a host or a scheme.
    const nasty = sanitizeListSearch("q=../../etc&cat=//evil.example.com");
    const params = new URLSearchParams(nasty);
    expect([...params.keys()].every((k) => ["q", "filter", "cat", "sort"].includes(k))).toBe(true);
  });
});

describe("paging parameters", () => {
  it("leaves page 1 and the default size out of the URL", () => {
    expect(itemListSearch(state({ page: 1, perPage: DEFAULT_PER_PAGE }))).toBe("");
  });

  it("carries a real page and size", () => {
    expect(itemListSearch(state({ page: 3, perPage: 50 }))).toBe("per=50&page=3");
    expect(itemListSearch(state({ perPage: "all" }))).toBe("per=all");
  });

  it("accepts only the sizes actually offered", () => {
    expect(parsePerPage("10")).toBe(10);
    expect(parsePerPage("all")).toBe("all");
    // 37 is not on the menu; a hand-edited URL falls back rather than
    // producing a page size nothing in the UI can undo.
    expect(parsePerPage("37")).toBe(DEFAULT_PER_PAGE);
    expect(parsePerPage(null)).toBe(DEFAULT_PER_PAGE);
  });

  it("refuses page numbers that are not positive whole numbers", () => {
    expect(parsePage("4")).toBe(4);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
    expect(parsePage("тест")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });
});
