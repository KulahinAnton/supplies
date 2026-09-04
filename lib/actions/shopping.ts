"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import { ruleMessage } from "@supplies/core/messages";
import { isValidListRow } from "@supplies/core/shopping";
import { groupIdForStorage } from "@supplies/core/shopping-groups";
import { addStockAction } from "@/lib/actions/stock";

function refresh() {
  revalidatePath("/shopping");
  revalidatePath("/dashboard");
}

/**
 * Feature 14.1 — `groupId` is optional and defaults to «Загальна група»
 * (null), which is what the top-level add field still does. Each group also
 * has its own add field, so a thing can be written down where it belongs
 * without a second action to move it.
 */
export async function addListRowAction(input: {
  itemId?: string | null;
  freeText?: string | null;
  quantity?: string | null;
  groupId?: string | null;
}): Promise<ActionResult> {
  const session = await requireSession();

  // A group id from the client is untrusted: prove it belongs to this
  // household before pointing a row at it.
  const groupId = input.groupId
    ? groupIdForStorage(input.groupId)
    : null;
  if (groupId !== null) {
    const group = await prisma.shoppingGroup.findFirst({
      where: { id: groupId, householdId: session.householdId },
      select: { id: true },
    });
    if (!group) return actionError(ruleMessage("shoppingGroup.notFound"));
  }

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
        // An archived row is not on the list, so it must not block a re-add.
        archivedAt: null,
      },
      select: { id: true },
    });
    if (already) return actionError(ruleMessage("shopping.alreadyOnList"));
  }

  await prisma.shoppingListItem.create({
    data: {
      householdId: session.householdId,
      groupId,
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

/**
 * Feature 12.1 — edit a row.
 *
 * What is editable depends on what the row is. A free-text one-off owns its
 * text. A row that names a real item does NOT: its label is the item's name,
 * and renaming it here would silently rename the item in the stock list, the
 * dashboard and every past movement. So `freeText` is ignored for those, and
 * the caller is told to rename the item itself.
 *
 * Both kinds carry a `note`.
 */
export async function updateListRowAction(input: {
  rowId: string;
  freeText?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  const session = await requireSession();

  const row = await prisma.shoppingListItem.findFirst({
    where: { id: input.rowId, householdId: session.householdId },
    select: { id: true, itemId: true },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  const note = input.note?.trim() ? input.note.trim().slice(0, 200) : null;

  if (row.itemId) {
    // Item-linked: note only. Silently ignoring a freeText here would be a
    // lie, so refuse it outright.
    if (input.freeText !== undefined && input.freeText !== null) {
      return actionError(ruleMessage("shopping.nameFromItem"));
    }
    await prisma.shoppingListItem.update({
      where: { id: row.id },
      data: { note },
    });
    refresh();
    return actionOk();
  }

  const freeText = input.freeText?.trim();
  if (!freeText) return actionError(ruleMessage("shopping.textRequired"));

  await prisma.shoppingListItem.update({
    where: { id: row.id },
    data: { freeText: freeText.slice(0, 120), note },
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

/**
 * Feature 14.2 — archiving hides a row from its group without losing it.
 *
 * Distinct from `isChecked`: you tick a row while shopping and archive it when
 * tidying up afterwards. An unticked row can be archived too — "I have changed
 * my mind about buying this, but do not delete it".
 */
export async function setListRowArchivedAction(
  rowId: string,
  archived: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  const row = await prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: session.householdId },
    select: { id: true },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  await prisma.shoppingListItem.update({
    where: { id: rowId },
    data: { archivedAt: archived ? new Date() : null },
  });

  refresh();
  return actionOk();
}

/**
 * Bulk tidy-up after a shop: archive every ticked row. It **archives rather
 * than deletes** (which is what this used to do), so the action is recoverable
 * — each row can be brought back from its group's "show archived" view.
 */
export async function archiveCheckedRowsAction(): Promise<ActionResult> {
  const session = await requireSession();
  await prisma.shoppingListItem.updateMany({
    where: {
      householdId: session.householdId,
      isChecked: true,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  refresh();
  return actionOk();
}

/** Permanently remove every archived row in the household. */
export async function deleteArchivedRowsAction(): Promise<ActionResult> {
  const session = await requireSession();
  await prisma.shoppingListItem.deleteMany({
    where: { householdId: session.householdId, archivedAt: { not: null } },
  });
  refresh();
  return actionOk();
}
