"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { itemSchema, updateItemSchema } from "@/lib/validation/item";
import { firstIssueAsRuleMessage } from "@/lib/validation/shared";

function refresh(itemId?: string) {
  revalidatePath("/items");
  revalidatePath("/dashboard");
  if (itemId) revalidatePath(`/items/${itemId}`);
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

  const item = await prisma.item.create({
    data: {
      householdId: session.householdId,
      name: data.name,
      categoryId: data.categoryId,
      locationId: data.locationId || null,
      unit: data.unit,
      minQty: new Prisma.Decimal(data.minQty).toFixed(3),
      barcode: data.barcode ?? null,
      notes: data.notes ?? null,
    },
    select: { id: true },
  });

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
