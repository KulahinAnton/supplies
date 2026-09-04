"use server";

import type { Unit } from "@supplies/core/units";
import { canJoinGroup } from "@supplies/core/item-group";
import type { RuleMessage } from "@supplies/core/messages";

import { revalidatePath } from "next/cache";
import { Prisma } from "@supplies/db/generated/prisma/client";
import { prisma } from "@supplies/db/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import { ruleMessage } from "@supplies/core/messages";
import { itemSchema, updateItemSchema } from "@supplies/core/validation/item";
import { firstIssueAsRuleMessage } from "@supplies/core/validation/shared";
import { canContribute, contributeProduct } from "@supplies/core/off-contribute";

function refresh(itemId?: string) {
  revalidatePath("/items");
  revalidatePath("/dashboard");
  if (itemId) revalidatePath(`/items/${itemId}`);
}

/**
 * Feature 26 — may this item join that set?
 *
 * Proves the set belongs to the caller's household, then enforces the one-unit
 * rule. Mixed units are refused rather than summed: 2 litres plus 3 pieces is
 * 5 of nothing, and a reminder computed from it is advice nobody can act on.
 * This is the last moment the person still knows which item they meant.
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

export async function createItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const data = parsed.data;

  if (data.barcode) {
    const clash = await prisma.item.findFirst({
      where: { householdId: session.householdId, barcode: data.barcode },
      select: { name: true },
    });
    if (clash) {
      return actionError(
        ruleMessage("item.duplicateBarcode", { name: clash.name }),
      );
    }
  }

  const groupProblem = await checkGroup(
    session.householdId,
    data.groupId || null,
    data.unit,
  );
  if (groupProblem) return actionError(groupProblem);

  const item = await prisma.item.create({
    data: {
      householdId: session.householdId,
      name: data.name,
      categoryId: data.categoryId,
      locationId: data.locationId || null,
      groupId: data.groupId || null,
      unit: data.unit,
      minQty: new Prisma.Decimal(data.minQty).toFixed(3),
      barcode: data.barcode ?? null,
      notes: data.notes ?? null,
    },
    select: { id: true },
  });

  // Feature 18.2 — opt-in, and never allowed to fail the create. The item is
  // already saved; a rejected contribution is not the user's problem.
  if (data.shareToOff && data.barcode && canContribute()) {
    void contributeProduct({ barcode: data.barcode, name: data.name });
  }

  refresh(item.id);
  return actionOk({ id: item.id });
}

/**
 * §3.2 — the unit is fixed once the item has batches. Changing it would
 * silently reinterpret every existing quantity ("2" litres becoming "2"
 * pieces), so the app refuses and suggests a separate item instead.
 */
export async function updateItemAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const data = parsed.data;
  const existing = await prisma.item.findFirst({
    where: { id: data.id, householdId: session.householdId },
    include: { _count: { select: { batches: true } } },
  });
  if (!existing) return actionError(ruleMessage("item.notFound"));

  if (existing.unit !== data.unit && existing._count.batches > 0) {
    return actionError(ruleMessage("item.unitLocked"));
  }

  // Feature 26 — excludes this item from the unit check, or an item already in
  // the set would be compared against itself and could never be re-saved.
  const groupProblem = await checkGroup(
    session.householdId,
    data.groupId || null,
    data.unit,
    data.id,
  );
  if (groupProblem) return actionError(groupProblem);

  if (data.barcode && data.barcode !== existing.barcode) {
    const clash = await prisma.item.findFirst({
      where: {
        householdId: session.householdId,
        barcode: data.barcode,
        id: { not: data.id },
      },
      select: { name: true },
    });
    if (clash) {
      return actionError(
        ruleMessage("item.duplicateBarcode", { name: clash.name }),
      );
    }
  }

  await prisma.item.update({
    where: { id: data.id },
    data: {
      name: data.name,
      categoryId: data.categoryId,
      locationId: data.locationId || null,
      groupId: data.groupId || null,
      unit: data.unit,
      minQty: new Prisma.Decimal(data.minQty).toFixed(3),
      barcode: data.barcode ?? null,
      notes: data.notes ?? null,
    },
  });

  refresh(data.id);
  return actionOk();
}

/**
 * Archive, never delete: StockMovement rows reference the item and the history
 * of "who used the last of it" outlives the family's interest in buying it.
 */
export async function setItemArchivedAction(
  itemId: string,
  isArchived: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  const existing = await prisma.item.findFirst({
    where: { id: itemId, householdId: session.householdId },
    select: { id: true },
  });
  if (!existing) return actionError(ruleMessage("item.notFound"));

  await prisma.item.update({ where: { id: itemId }, data: { isArchived } });
  refresh(itemId);
  return actionOk();
}
