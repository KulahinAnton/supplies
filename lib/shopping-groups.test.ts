import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
  groupIdForStorage,
  groupShoppingRows,
  moveTargets,
  type GroupRow,
} from "@/lib/shopping-groups";

const row = (
  id: string,
  groupId: string | null,
  isChecked = false,
  archivedAt: Date | null = null,
) => ({ id, groupId, isChecked, archivedAt });

const ARCHIVED = new Date("2026-08-20T10:00:00Z");

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
    expect(result[0].visible.map((r) => r.id)).toEqual(["a"]);
  });

  it("routes a named groupId to its group", () => {
    const result = groupShoppingRows([row("a", "pharmacy")], GROUPS);
    expect(result.find((g) => g.id === "pharmacy")!.visible.map((r) => r.id)).toEqual([
      "a",
    ]);
  });

  it("keeps the default group even when it is empty — it is a drop target", () => {
    const result = groupShoppingRows([row("a", "pharmacy")], GROUPS);
    expect(result[0].isDefault).toBe(true);
    expect(result[0].visible).toEqual([]);
  });

  it("lists empty named groups too, for the same reason", () => {
    const result = groupShoppingRows([], GROUPS);
    expect(result).toHaveLength(3);
    expect(result.every((g) => g.visible.length === 0)).toBe(true);
  });

  it("keeps ticked rows IN their group, after the unticked ones (§14.2)", () => {
    // The old behaviour moved them to a separate section at the bottom of the
    // page, which reordered the list under you while shopping.
    const result = groupShoppingRows(
      [row("done", "market", true), row("open", "market")],
      GROUPS,
    );
    const market = result.find((g) => g.id === "market")!;
    expect(market.visible.map((r) => r.id)).toEqual(["open", "done"]);
    expect(market.openCount).toBe(1);
  });

  it("preserves incoming order within the unticked and ticked halves", () => {
    const result = groupShoppingRows(
      [
        row("open1", "market"),
        row("done1", "market", true),
        row("open2", "market"),
        row("done2", "market", true),
      ],
      GROUPS,
    );
    expect(
      result.find((g) => g.id === "market")!.visible.map((r) => r.id),
    ).toEqual(["open1", "open2", "done1", "done2"]);
  });

  it("hides archived rows from the group and lists them separately", () => {
    const result = groupShoppingRows(
      [
        row("live", "market"),
        row("gone", "market", true, ARCHIVED),
      ],
      GROUPS,
    );
    const market = result.find((g) => g.id === "market")!;
    expect(market.visible.map((r) => r.id)).toEqual(["live"]);
    expect(market.archived.map((r) => r.id)).toEqual(["gone"]);
  });

  it("archives an unticked row too — archiving is not 'bought'", () => {
    const result = groupShoppingRows(
      [row("gone", "market", false, ARCHIVED)],
      GROUPS,
    );
    const market = result.find((g) => g.id === "market")!;
    expect(market.visible).toEqual([]);
    expect(market.archived.map((r) => r.id)).toEqual(["gone"]);
  });

  it("excludes archived rows from openCount", () => {
    const result = groupShoppingRows(
      [
        row("a", "market"),
        row("b", "market", false, ARCHIVED),
        row("c", "market", true),
      ],
      GROUPS,
    );
    expect(result.find((g) => g.id === "market")!.openCount).toBe(1);
  });

  it("falls back to the default group for a groupId that no longer exists", () => {
    // SetNull should prevent this, but a row worth buying is not worth losing.
    const result = groupShoppingRows([row("orphan", "deleted-group")], GROUPS);
    expect(result[0].visible.map((r) => r.id)).toEqual(["orphan"]);
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
    expect(result[0].visible.map((r) => r.id)).toEqual(["a"]);
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
