import { Prisma } from "./generated/prisma/client";
import { prisma } from "./prisma";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { canJoinGroup } from "../../core/src/item-group";
import { ruleMessage, type RuleMessage } from "../../core/src/messages";
import { canContribute, contributeProduct } from "../../core/src/off-contribute";
import type { Unit } from "../../core/src/units";
import type { Actor } from "./stock-service";

/**
 * Creating, editing and archiving items — the write path for everything about
 * an item that is not its stock.
 *
 * Moved out of `lib/actions/items.ts` when Feature 34 gave the app a third
 * front end. The rules in here are not presentation: the barcode uniqueness
 * check, §3.2's locked unit and Feature 26's one-unit rule all have to hold
 * whether the request came from a form, an endpoint or a bot, and a copy per
 * caller is a copy that eventually disagrees.
 *
 * `revalidatePath` stays behind in the server action. That is Next's business,
 * and this module has no idea what a route is.
 */

export type ItemInput = {
  name: string;
  categoryId: string;
  locationId?: string;
  groupId?: string;
  unit: Unit;
  minQty: string;
  barcode?: string;
  notes?: string;
  shareToOff?: boolean;
};

/**
 * Feature 26 — may this item join that set?
 *
 * Proves the set belongs to the caller's household, then enforces the one-unit
 * rule. Mixed units are refused rather than summed: 2 litres plus 3 pieces is
 * 5 of nothing, and a reminder computed from it is advice nobody can act on.
 */
async function checkGroup(
  householdId: string,
  groupId: string | null,
  unit: Unit,
  itemId?: string,
): Promise<RuleMessage | null> {
  if (!groupId) return null;

  const group = await prisma.itemGroup.findFirst({
    where: { id: groupId, householdId },
    include: {
      items: {
        // Excluding this item matters on edit: one already in the set would
        // otherwise be compared against itself and could never be re-saved.
        where: itemId ? { id: { not: itemId } } : {},
        select: { unit: true },
        take: 1,
      },
    },
  });
  if (!group) return ruleMessage("group.notFound");

  const verdict = canJoinGroup(group.items[0]?.unit ?? null, unit);
  return verdict.ok ? null : verdict.error;
}

async function barcodeClash(
  householdId: string,
  barcode: string,
  exceptItemId?: string,
): Promise<RuleMessage | null> {
  const clash = await prisma.item.findFirst({
    where: {
      householdId,
      barcode,
      ...(exceptItemId ? { id: { not: exceptItemId } } : {}),
    },
    select: { name: true },
  });
  return clash ? ruleMessage("item.duplicateBarcode", { name: clash.name }) : null;
}

/** The columns both create and update write, so they cannot drift apart. */
function itemColumns(data: ItemInput) {
  return {
    name: data.name,
    categoryId: data.categoryId,
    locationId: data.locationId || null,
    groupId: data.groupId || null,
    unit: data.unit,
    minQty: new Prisma.Decimal(data.minQty).toFixed(3),
    barcode: data.barcode ?? null,
    notes: data.notes ?? null,
  };
}

export async function createItem(
  actor: Actor,
  data: ItemInput,
): Promise<ActionResult<{ id: string }>> {
  if (data.barcode) {
    const clash = await barcodeClash(actor.householdId, data.barcode);
    if (clash) return actionError(clash);
  }

  const groupProblem = await checkGroup(
    actor.householdId,
    data.groupId || null,
    data.unit,
  );
  if (groupProblem) return actionError(groupProblem);

  const item = await prisma.item.create({
    data: { householdId: actor.householdId, ...itemColumns(data) },
    select: { id: true },
  });

  // Feature 18.2 — opt-in, and never allowed to fail the create. The item is
  // already saved; a rejected contribution is not the user's problem.
  if (data.shareToOff && data.barcode && canContribute()) {
    void contributeProduct({ barcode: data.barcode, name: data.name });
  }

  return actionOk({ id: item.id });
}

/**
 * §3.2 — the unit is fixed once the item has batches. Changing it would
 * silently reinterpret every existing quantity ("2" litres becoming "2"
 * pieces), so this refuses and the UI suggests a separate item instead.
 */
export async function updateItem(
  actor: Actor,
  itemId: string,
  data: ItemInput,
): Promise<ActionResult> {
  const existing = await prisma.item.findFirst({
    where: { id: itemId, householdId: actor.householdId },
    include: { _count: { select: { batches: true } } },
  });
  if (!existing) return actionError(ruleMessage("item.notFound"));

  if (existing.unit !== data.unit && existing._count.batches > 0) {
    return actionError(ruleMessage("item.unitLocked"));
  }

  const groupProblem = await checkGroup(
    actor.householdId,
    data.groupId || null,
    data.unit,
    itemId,
  );
  if (groupProblem) return actionError(groupProblem);

  if (data.barcode && data.barcode !== existing.barcode) {
    const clash = await barcodeClash(actor.householdId, data.barcode, itemId);
    if (clash) return actionError(clash);
  }

  await prisma.item.update({ where: { id: itemId }, data: itemColumns(data) });
  return actionOk();
}

/**
 * Archive, never delete: `StockMovement` rows reference the item, and the
 * history of "who used the last of it" outlives the family's interest in
 * buying it again.
 */
export async function setItemArchived(
  actor: Actor,
  itemId: string,
  isArchived: boolean,
): Promise<ActionResult> {
  const existing = await prisma.item.findFirst({
    where: { id: itemId, householdId: actor.householdId },
    select: { id: true },
  });
  if (!existing) return actionError(ruleMessage("item.notFound"));

  await prisma.item.update({ where: { id: itemId }, data: { isArchived } });
  return actionOk();
}
