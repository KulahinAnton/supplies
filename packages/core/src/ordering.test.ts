import { describe, expect, it } from "vitest";
import { defaultRowId, moveIdInList, moveInList } from "./ordering";

const LIST = ["a", "b", "c", "d"];

describe("moveInList", () => {
  it("moves an item down, shifting the rest up", () => {
    expect(moveInList(LIST, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(moveInList(LIST, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves to the very start and the very end", () => {
    expect(moveInList(LIST, 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveInList(LIST, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("is a no-op when from and to are the same", () => {
    expect(moveInList(LIST, 1, 1)).toEqual(LIST);
  });

  it("is a no-op for out-of-range indexes rather than throwing", () => {
    // A drag that ends somewhere unexpected should do nothing, not crash.
    expect(moveInList(LIST, -1, 2)).toEqual(LIST);
    expect(moveInList(LIST, 0, 99)).toEqual(LIST);
    expect(moveInList(LIST, 99, 0)).toEqual(LIST);
  });

  it("does not mutate the input", () => {
    const original = [...LIST];
    moveInList(LIST, 0, 3);
    expect(LIST).toEqual(original);
  });

  it("copes with an empty or single-item list", () => {
    expect(moveInList([], 0, 0)).toEqual([]);
    expect(moveInList(["only"], 0, 0)).toEqual(["only"]);
  });
});

describe("moveIdInList", () => {
  it("reorders by id, which is what a drag gives us", () => {
    expect(moveIdInList(LIST, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("leaves the list alone for an unknown id", () => {
    expect(moveIdInList(LIST, "zzz", "c")).toEqual(LIST);
    expect(moveIdInList(LIST, "a", "zzz")).toEqual(LIST);
  });

  it("is a no-op when dropped on itself", () => {
    expect(moveIdInList(LIST, "b", "b")).toEqual(LIST);
  });
});

describe("defaultRowId", () => {
  const rows = [
    { id: "first", isDefault: false },
    { id: "starred", isDefault: true },
  ];

  it("prefers the starred row", () => {
    expect(defaultRowId(rows, true)).toBe("starred");
  });

  it("falls back to the first row when asked to — categories are required", () => {
    const none = [{ id: "first", isDefault: false }];
    expect(defaultRowId(none, true)).toBe("first");
  });

  it("returns null instead when there is no fallback — «Не вказано» is valid", () => {
    const none = [{ id: "first", isDefault: false }];
    expect(defaultRowId(none, false)).toBeNull();
  });

  it("is null for an empty list either way", () => {
    expect(defaultRowId([], true)).toBeNull();
    expect(defaultRowId([], false)).toBeNull();
  });

  it("takes the first starred row if the invariant were ever violated", () => {
    const two = [
      { id: "one", isDefault: true },
      { id: "two", isDefault: true },
    ];
    expect(defaultRowId(two, true)).toBe("one");
  });
});
