"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { isValidListRow } from "@/lib/shopping";
import { addStockAction } from "@/lib/actions/stock";

function refresh() {
  revalidatePath("/shopping");
  revalidatePath("/dashboard");
}

export async function addListRowAction(input: {
  itemId?: string | null;
  freeText?: string | null;
  quantity?: string | null;
}): Promise<ActionResult> {
  const session = await requireSession();

  const row = {
    itemId: input.itemId ?? null,
    freeText: input.freeText?.trim() ? input.freeText.trim() : null,
  };
  if (!isValidListRow(row)) return actionError(ruleMessage("shopping.rowInvalid"));

  if (row.itemId) {
    const item = await prisma.item.findFirst({
      where: { id: row.itemId, householdId: session.householdId },
      select: { id: true },
    });
    if (!item) return actionError(ruleMessage("item.notFound"));

    const already = await prisma.shoppingListItem.findFirst({
      where: {
        householdId: session.householdId,
        itemId: row.itemId,
        isChecked: false,
      },
      select: { id: true },
    });
    if (already) return actionError(ruleMessage("shopping.alreadyOnList"));
  }

  await prisma.shoppingListItem.create({
    data: {
      householdId: session.householdId,
      itemId: row.itemId,
      freeText: row.freeText,
      quantity: input.quantity ? input.quantity.replace(",", ".") : null,
      addedById: session.userId,
    },
  });

  refresh();
  return actionOk();
}

/**
 * Feature 6 — checking a row off IS a stock-in.
 *
 * For a row that names a real item, the caller passes the batch rows it was
 * bought as, and this delegates to `addStockAction` so the purchase goes
 * through exactly the same rules and audit trail as any other stock-in. A
 * free-text one-off ("свічки") has nothing to stock, so it just gets checked.
 */
export async function checkListRowAction(input: {
  rowId: string;
  rows?: { quantity: string; expiresAt?: string; openedAt?: string }[];
}): Promise<ActionResult> {
  const session = await requireSession();

  const row = await prisma.shoppingListItem.findFirst({
    where: { id: input.rowId, householdId: session.householdId },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  if (row.itemId && input.rows && input.rows.length > 0) {
    const stocked = await addStockAction({ itemId: row.itemId, rows: input.rows });
    if (!stocked.ok) return stocked;
  }

  await prisma.shoppingListItem.update({
    where: { id: row.id },
    data: {
      isChecked: true,
      checkedAt: new Date(),
      checkedById: session.userId,
    },
  });

  refresh();
  return actionOk();
}

export async function uncheckListRowAction(rowId: string): Promise<ActionResult> {
  const session = await requireSession();
  const row = await prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: session.householdId },
    select: { id: true },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  await prisma.shoppingListItem.update({
    where: { id: rowId },
    data: { isChecked: false, checkedAt: null, checkedById: null },
  });

  refresh();
  return actionOk();
}

export async function deleteListRowAction(rowId: string): Promise<ActionResult> {
  const session = await requireSession();
  const row = await prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: session.householdId },
    select: { id: true },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  await prisma.shoppingListItem.delete({ where: { id: rowId } });
  refresh();
  return actionOk();
}

/** "Прибрати куплені" — the movements are the real record, not these rows. */
export async function clearCheckedRowsAction(): Promise<ActionResult> {
  const session = await requireSession();
  await prisma.shoppingListItem.deleteMany({
    where: { householdId: session.householdId, isChecked: true },
  });
  refresh();
  return actionOk();
}
