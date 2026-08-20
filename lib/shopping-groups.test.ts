import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
  groupIdForStorage,
  groupShoppingRows,
  moveTargets,
  type GroupRow,
} from "@/lib/shopping-groups";

const row = (id: string, groupId: string | null, isChecked = false) => ({
  id,
  groupId,
  isChecked,
});

const GROUPS: GroupRow[] = [
  { id: "pharmacy", name: "Аптека", sortOrder: 1 },
  { id: "market", name: "Ринок", sortOrder: 0 },
];

describe("groupShoppingRows", () => {
  it("puts «Загальна група» first and named groups in sortOrder", () => {
    const result = groupShoppingRows([], GROUPS);
    expect(result.map((g) => g.name)).toEqual([
      DEFAULT_GROUP_NAME,
      "Ринок",
      "Аптека",
    ]);
  });

  it("routes a null groupId to the default group", () => {
    const result = groupShoppingRows([row("a", null)], GROUPS);
    expect(result[0].open.map((r) => r.id)).toEqual(["a"]);
  });

  it("routes a named groupId to its group", () => {
    const result = groupShoppingRows([row("a", "pharmacy")], GROUPS);
    expect(result.find((g) => g.id === "pharmacy")!.open.map((r) => r.id)).toEqual([
      "a",
    ]);
  });

  it("keeps the default group even when it is empty — it is a drop target", () => {
    const result = groupShoppingRows([row("a", "pharmacy")], GROUPS);
    expect(result[0].isDefault).toBe(true);
    expect(result[0].open).toEqual([]);
  });

  it("lists empty named groups too, for the same reason", () => {
    const result = groupShoppingRows([], GROUPS);
    expect(result).toHaveLength(3);
    expect(result.every((g) => g.open.length === 0)).toBe(true);
  });

  it("splits checked rows out of each group", () => {
    const result = groupShoppingRows(
      [row("open", "market"), row("done", "market", true)],
      GROUPS,
    );
    const market = result.find((g) => g.id === "market")!;
    expect(market.open.map((r) => r.id)).toEqual(["open"]);
    expect(market.checked.map((r) => r.id)).toEqual(["done"]);
  });

  it("falls back to the default group for a groupId that no longer exists", () => {
    // SetNull should prevent this, but a row worth buying is not worth losing.
    const result = groupShoppingRows([row("orphan", "deleted-group")], GROUPS);
    expect(result[0].open.map((r) => r.id)).toEqual(["orphan"]);
  });

  it("marks only the default group as default", () => {
    const result = groupShoppingRows([], GROUPS);
    expect(result.filter((g) => g.isDefault)).toHaveLength(1);
  });

  it("breaks a sortOrder tie by Ukrainian collation", () => {
    const tied: GroupRow[] = [
      { id: "b", name: "Яблуневий", sortOrder: 0 },
      { id: "a", name: "Ашан", sortOrder: 0 },
    ];
    expect(groupShoppingRows([], tied).map((g) => g.name)).toEqual([
      DEFAULT_GROUP_NAME,
      "Ашан",
      "Яблуневий",
    ]);
  });

  it("copes with no named groups at all", () => {
    const result = groupShoppingRows([row("a", null)], []);
    expect(result).toHaveLength(1);
    expect(result[0].open.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("groupIdForStorage", () => {
  it("stores the default group as null", () => {
    expect(groupIdForStorage(DEFAULT_GROUP_ID)).toBeNull();
  });

  it("stores a named group by id", () => {
    expect(groupIdForStorage("pharmacy")).toBe("pharmacy");
  });
});

describe("moveTargets", () => {
  it("excludes the group the row is already in", () => {
    expect(moveTargets("pharmacy", GROUPS).map((t) => t.id)).toEqual([
      DEFAULT_GROUP_ID,
      "market",
    ]);
  });

  it("excludes the default group when the row is already there", () => {
    expect(moveTargets(null, GROUPS).map((t) => t.id)).toEqual([
      "market",
      "pharmacy",
    ]);
  });

  it("offers the default group as somewhere to move back to", () => {
    expect(moveTargets("market", GROUPS)[0]).toEqual({
      id: DEFAULT_GROUP_ID,
      name: DEFAULT_GROUP_NAME,
    });
  });

  it("is empty when there is nowhere else to go", () => {
    expect(moveTargets(null, [])).toEqual([]);
  });
});
