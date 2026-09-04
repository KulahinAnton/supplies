/**
 * Feature 26 — sets of interchangeable items, counted as one for restocking.
 *
 * The case: the same product under a new barcode after a manufacturer change,
 * or two brands the household treats as the same thing. They stay separate
 * items — separate batches, separate expiry dates, and you can still see which
 * brand is in the cupboard — but you are short of "milk", not of a brand.
 *
 * Pure, like the rest of the engine. No Prisma client, no React.
 */

import { Decimal, ZERO } from "@/lib/decimal";
import type { Unit } from "@/lib/units";
import { stateFor, type StockState } from "@/lib/stock";
import { ruleMessage, type RuleMessage } from "@/lib/messages";


/** The member fields this module reads. Real `ItemView`s satisfy it. */
export type GroupMemberInput = {
  id: string;
  name: string;
  unit: Unit;
  quantity: Decimal;
};

export type ItemGroupInput = {
  id: string;
  name: string;
  minQty: Decimal;
};

export type GroupView = {
  id: string;
  name: string;
  minQty: Decimal;
  /** Sum across members — meaningful only because they share a unit. */
  quantity: Decimal;
  /** Null for an empty group: no members, no unit to count in. */
  unit: Unit | null;
  state: StockState;
  memberCount: number;
};

/**
 * A group's unit is DERIVED from its members, never stored.
 *
 * Storing it would create an invariant that can drift — a member's unit could
 * be edited afterwards and the two would silently disagree. Deriving it means
 * the group is always counted in the unit its members actually use.
 */
export function groupUnit(members: readonly GroupMemberInput[]): Unit | null {
  return members[0]?.unit ?? null;
}

export function groupQuantity(members: readonly GroupMemberInput[]): Decimal {
  return members.reduce((sum, member) => sum.plus(member.quantity), ZERO);
}

export function buildGroupView(
  group: ItemGroupInput,
  members: readonly GroupMemberInput[],
): GroupView {
  const quantity = groupQuantity(members);
  return {
    id: group.id,
    name: group.name,
    minQty: group.minQty,
    quantity,
    unit: groupUnit(members),
    // The same rule an item uses, applied to the sum — see `stateFor`.
    state: stateFor(quantity, group.minQty),
    memberCount: members.length,
  };
}

/**
 * Whether this group should be nagged about (Feature 25's rule, one level up):
 * `minQty` 0 means no reminders at all.
 *
 * An EMPTY group never reminds either. "You have none of a set containing
 * nothing" is not a shopping list item, it is a group someone has not finished
 * setting up.
 */
export function groupNeedsRestock(view: GroupView): boolean {
  if (view.memberCount === 0) return false;
  if (!view.minQty.greaterThan(ZERO)) return false;
  return view.state === "OUT" || view.state === "LOW";
}

/**
 * Whether an item may join a group.
 *
 * Mixed units are refused rather than summed. Adding 2 litres to 3 pieces
 * gives 5 of nothing, and a reminder computed from it — "you have 5, minimum
 * 6" — is advice the household cannot act on. Refusing at the join is the only
 * point where the person still knows which item they meant.
 */
export function canJoinGroup(
  existingUnit: Unit | null,
  itemUnit: Unit,
): { ok: true } | { ok: false; error: RuleMessage } {
  if (existingUnit === null || existingUnit === itemUnit) return { ok: true };
  return { ok: false, error: ruleMessage("group.unitMismatch") };
}
