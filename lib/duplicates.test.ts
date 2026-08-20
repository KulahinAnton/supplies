import { describe, expect, it } from "vitest";
import {
  findDuplicateGroups,
  findSimilar,
  matchReason,
  normalizeName,
  type NamedItem,
} from "@/lib/duplicates";

const item = (id: string, name: string): NamedItem => ({ id, name });

describe("normalizeName", () => {
  it("lowercases Ukrainian text", () => {
    expect(normalizeName("Сіль")).toBe("сіль");
    expect(normalizeName("СІЛЬ КУХОННА")).toBe("сіль кухонна");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeName("  Сіль   кухонна  ")).toBe("сіль кухонна");
  });

  it("drops punctuation", () => {
    expect(normalizeName("Сіль, кухонна (велика)")).toBe("сіль кухонна велика");
    expect(normalizeName("«Молоко» 2,5%")).toBe("молоко 2 5");
  });
});

describe("matchReason", () => {
  it("finds an exact match regardless of case or spacing", () => {
    expect(matchReason("Сіль", "сіль")).toBe("exact");
    expect(matchReason("  Сіль ", "СІЛЬ")).toBe("exact");
  });

  it("finds one name contained in the other", () => {
    expect(matchReason("Сіль", "Сіль кухонна")).toBe("contains");
    expect(matchReason("Сіль кухонна", "Сіль")).toBe("contains");
  });

  it("finds the same words in a different order", () => {
    expect(matchReason("Сіль кухонна", "Кухонна сіль")).toBe("tokens");
  });

  it("does NOT match genuinely different products", () => {
    // The reason edit distance is excluded: "Сік" and "Сіль" are two edits
    // apart. Telling someone their salt is juice is worse than missing a typo.
    expect(matchReason("Сік", "Сіль")).toBeNull();
    expect(matchReason("Молоко", "Масло")).toBeNull();
    expect(matchReason("Хліб житній", "Хліб білий")).toBeNull();
  });

  it("does not let a one- or two-letter name match everything", () => {
    expect(matchReason("сі", "Сіль кухонна")).toBeNull();
    expect(matchReason("о", "Молоко")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(matchReason("", "Сіль")).toBeNull();
    expect(matchReason("Сіль", "   ")).toBeNull();
  });

  it("treats differing pack sizes as related, since the family should decide", () => {
    // "Вода 1,5 л" and "Вода" - worth flagging; the person judges.
    expect(matchReason("Вода", "Вода 1,5 л")).toBe("contains");
  });
});

describe("findSimilar", () => {
  const items = [
    item("salt", "Сіль"),
    item("saltKitchen", "Сіль кухонна"),
    item("milk", "Молоко"),
  ];

  it("returns matches strongest first", () => {
    const found = findSimilar("сіль", items);
    expect(found.map((m) => m.id)).toEqual(["salt", "saltKitchen"]);
    expect(found[0].reason).toBe("exact");
    expect(found[1].reason).toBe("contains");
  });

  it("excludes the item being edited from matching itself", () => {
    expect(findSimilar("Сіль", items, "salt").map((m) => m.id)).toEqual([
      "saltKitchen",
    ]);
  });

  it("returns nothing for an unrelated name", () => {
    expect(findSimilar("Печиво", items)).toEqual([]);
  });

  it("stays quiet until the name is worth checking", () => {
    // Warning after one keystroke would fire on nearly everything.
    expect(findSimilar("С", items)).toEqual([]);
    expect(findSimilar("", items)).toEqual([]);
  });
});

describe("findDuplicateGroups", () => {
  it("groups items that match each other", () => {
    const groups = findDuplicateGroups([
      item("a", "Сіль"),
      item("b", "сіль"),
      item("c", "Молоко"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("is transitive — one group of three, not three overlapping pairs", () => {
    const groups = findDuplicateGroups([
      item("a", "Сіль"),
      item("b", "Сіль кухонна"),
      item("c", "Сіль кухонна велика"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it("returns nothing when everything is distinct", () => {
    expect(
      findDuplicateGroups([
        item("a", "Молоко"),
        item("b", "Хліб"),
        item("c", "Яйця"),
      ]),
    ).toEqual([]);
  });

  it("never returns a group of one", () => {
    const groups = findDuplicateGroups([item("a", "Сіль"), item("b", "Молоко")]);
    expect(groups.every((g) => g.length > 1)).toBe(true);
  });

  it("sorts within and between groups by Ukrainian collation", () => {
    const groups = findDuplicateGroups([
      item("b", "Яблука сушені"),
      item("a", "Яблука"),
      item("d", "Апельсини сік"),
      item("c", "Апельсини"),
    ]);
    expect(groups.map((g) => g[0].name)).toEqual(["Апельсини", "Яблука"]);
    expect(groups[1].map((i) => i.name)).toEqual(["Яблука", "Яблука сушені"]);
  });

  it("copes with an empty list", () => {
    expect(findDuplicateGroups([])).toEqual([]);
  });
});
