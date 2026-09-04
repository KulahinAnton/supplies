import { describe, expect, it } from "vitest";
import { Decimal } from "@/lib/decimal";
import type { Unit } from "@/lib/units";
import {
  buildGroupView,
  canJoinGroup,
  groupNeedsRestock,
  groupQuantity,
  groupUnit,
  type GroupMemberInput,
} from "@/lib/item-group";

const d = (value: string) => new Decimal(value);
const member = (id: string, quantity: string, unit: Unit = "PIECE"): GroupMemberInput => ({
  id,
  name: id,
  unit,
  quantity: d(quantity),
});
const group = (minQty: string) => ({ id: "g", name: "Молоко", minQty: d(minQty) });

describe("groupQuantity", () => {
  it("sums the members", () => {
    expect(groupQuantity([member("a", "2"), member("b", "3.5")]).toString()).toBe("5.5");
  });

  it("is zero for an empty group", () => {
    expect(groupQuantity([]).toString()).toBe("0");
  });
});

describe("groupUnit", () => {
  it("is taken from the members, not stored", () => {
    expect(groupUnit([member("a", "1", "LITRE")])).toBe("LITRE");
  });

  it("is null when the group is empty", () => {
    expect(groupUnit([])).toBe(null);
  });
});

describe("buildGroupView", () => {
  /**
   * The point of the feature: two brands, neither low on its own, but the
   * household is short of the thing they both are.
   */
  it("reports LOW on the combined total, not per member", () => {
    const view = buildGroupView(group("6"), [member("a", "2"), member("b", "3")]);
    expect(view.quantity.toString()).toBe("5");
    expect(view.state).toBe("LOW");
  });

  it("reports OK once the members together clear the threshold", () => {
    const view = buildGroupView(group("4"), [member("a", "2"), member("b", "3")]);
    expect(view.state).toBe("OK");
  });

  it("reports OUT when every member is empty", () => {
    const view = buildGroupView(group("2"), [member("a", "0"), member("b", "0")]);
    expect(view.state).toBe("OUT");
  });
});

describe("groupNeedsRestock", () => {
  it("nags when the total is below the threshold", () => {
    expect(groupNeedsRestock(buildGroupView(group("6"), [member("a", "1")]))).toBe(true);
  });

  /** Feature 25's rule, one level up: 0 means no reminders at all. */
  it("respects minQty 0 as an opt-out", () => {
    expect(groupNeedsRestock(buildGroupView(group("0"), [member("a", "0")]))).toBe(false);
  });

  /**
   * An empty group is someone mid-setup, not a shopping need. Without this it
   * would appear in the digest the moment it was created, before it could
   * possibly mean anything.
   */
  it("never nags about a group with no members", () => {
    expect(groupNeedsRestock(buildGroupView(group("5"), []))).toBe(false);
  });
});

describe("canJoinGroup", () => {
  it("lets the first member set the unit", () => {
    expect(canJoinGroup(null, "LITRE").ok).toBe(true);
  });

  it("accepts a matching unit", () => {
    expect(canJoinGroup("LITRE", "LITRE").ok).toBe(true);
  });

  /**
   * 2 litres plus 3 pieces is 5 of nothing, and a reminder built on it —
   * "you have 5, minimum 6" — is advice nobody can act on. The join is the
   * last moment the person still knows which item they meant.
   */
  it("refuses a mismatched unit rather than summing nonsense", () => {
    const result = canJoinGroup("LITRE", "PIECE");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.key).toBe("group.unitMismatch");
  });
});
