import { prisma } from "./prisma";
import { addStock } from "./stock-service";
import type { Actor } from "./stock-service";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { ruleMessage } from "../../core/src/messages";
import { isValidListRow } from "../../core/src/shopping";
import { groupIdForStorage } from "../../core/src/shopping-groups";

/**
 * The shopping list's write path.
 *
 * Moved out of `lib/actions/shopping.ts` for Feature 34, on the same reasoning
 * as the stock and item services: «Загальна група» being `null` rather than a
 * row, an item-linked row taking its name from the item, and checking a row
 * being a stock-in are all *rules*, and a second front end must inherit them
 * rather than re-derive them.
 *
 * `revalidatePath` stays in the server action — this module does not know what
 * a route is.
 */

/**
 * A group id from a client is untrusted. Proving it belongs to the household
 * before pointing a row at it is what stops a row being filed into another
 * family's list.
 */
async function resolveGroup(
  householdId: string,
  raw: string | null | undefined,
): Promise<{ ok: true; groupId: string | null } | { ok: false }> {
  const groupId = raw ? groupIdForStorage(raw) : null;
  if (groupId === null) return { ok: true, groupId: null };

  const group = await prisma.shoppingGroup.findFirst({
    where: { id: groupId, householdId },
    select: { id: true },
  });
  return group ? { ok: true, groupId } : { ok: false };
}

async function ownRow(actor: Actor, rowId: string) {
  return prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: actor.householdId },
    select: { id: true, itemId: true },
  });
}

/**
 * Feature 14.1 — `groupId` is optional and defaults to «Загальна група»
 * (null). Each group has its own add field, so a thing can be written down
 * where it belongs without a second action to move it.
 */
export async function addListRow(
  actor: Actor,
  input: {
    itemId?: string | null;
    freeText?: string | null;
    quantity?: string | null;
    groupId?: string | null;
  },
): Promise<ActionResult> {
  const group = await resolveGroup(actor.householdId, input.groupId);
  if (!group.ok) return actionError(ruleMessage("shoppingGroup.notFound"));

  const row = {
    itemId: input.itemId ?? null,
    freeText: input.freeText?.trim() ? input.freeText.trim() : null,
  };
  if (!isValidListRow(row)) return actionError(ruleMessage("shopping.rowInvalid"));

  if (row.itemId) {
    const item = await prisma.item.findFirst({
      where: { id: row.itemId, householdId: actor.householdId },
      select: { id: true },
    });
    if (!item) return actionError(ruleMessage("item.notFound"));

    const already = await prisma.shoppingListItem.findFirst({
      where: {
        householdId: actor.householdId,
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
      householdId: actor.householdId,
      groupId: group.groupId,
      itemId: row.itemId,
      freeText: row.freeText,
      quantity: input.quantity ? input.quantity.replace(",", ".") : null,
      addedById: actor.userId,
    },
  });

  return actionOk();
}

/**
 * Feature 6 — checking a row off IS a stock-in.
 *
 * For a row naming a real item, the caller passes the batches it was bought
 * as, and this delegates to `addStock` so the purchase goes through exactly
 * the same rules and audit trail as any other stock-in. A free-text one-off
 * («свічки») has nothing to stock, so it just gets ticked.
 */
export async function checkListRow(
  actor: Actor,
  rowId: string,
  rows?: { quantity: string; expiresAt?: string; openedAt?: string }[],
): Promise<ActionResult> {
  const row = await ownRow(actor, rowId);
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  if (row.itemId && rows && rows.length > 0) {
    const stocked = await addStock(actor, row.itemId, rows);
    if (!stocked.ok) return stocked;
  }

  await prisma.shoppingListItem.update({
    where: { id: row.id },
    data: { isChecked: true, checkedAt: new Date(), checkedById: actor.userId },
  });

  return actionOk();
}

/**
 * Feature 12.1 — edit a row.
 *
 * What is editable depends on what the row is. A free-text one-off owns its
 * text. A row naming a real item does NOT: its label is the item's name, and
 * renaming it here would silently rename the item in the stock list, the
 * dashboard and every past movement. Refused outright rather than ignored,
 * because silently dropping an edit is a lie.
 */
export async function updateListRow(
  actor: Actor,
  rowId: string,
  input: { freeText?: string | null; note?: string | null },
): Promise<ActionResult> {
  const row = await ownRow(actor, rowId);
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  const note = input.note?.trim() ? input.note.trim().slice(0, 200) : null;

  if (row.itemId) {
    if (input.freeText !== undefined && input.freeText !== null) {
      return actionError(ruleMessage("shopping.nameFromItem"));
    }
    await prisma.shoppingListItem.update({ where: { id: row.id }, data: { note } });
    return actionOk();
  }

  const freeText = input.freeText?.trim();
  if (!freeText) return actionError(ruleMessage("shopping.textRequired"));

  await prisma.shoppingListItem.update({
    where: { id: row.id },
    data: { freeText: freeText.slice(0, 120), note },
  });
  return actionOk();
}

export async function uncheckListRow(actor: Actor, rowId: string): Promise<ActionResult> {
  const row = await ownRow(actor, rowId);
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  await prisma.shoppingListItem.update({
    where: { id: rowId },
    data: { isChecked: false, checkedAt: null, checkedById: null },
  });
  return actionOk();
}

export async function deleteListRow(actor: Actor, rowId: string): Promise<ActionResult> {
  const row = await ownRow(actor, rowId);
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  await prisma.shoppingListItem.delete({ where: { id: rowId } });
  return actionOk();
}

/**
 * Feature 14.2 — archiving hides a row from its group without losing it.
 *
 * Distinct from `isChecked`: you tick a row while shopping and archive it when
 * tidying up afterwards. An unticked row can be archived too — "I have changed
 * my mind about buying this, but do not delete it".
 */
export async function setListRowArchived(
  actor: Actor,
  rowId: string,
  archived: boolean,
): Promise<ActionResult> {
  const row = await ownRow(actor, rowId);
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  await prisma.shoppingListItem.update({
    where: { id: rowId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return actionOk();
}

/**
 * Bulk tidy-up after a shop. It **archives rather than deletes**, so the action
 * is recoverable — each row can be brought back from its group's "show
 * archived" view.
 */
export async function archiveCheckedRows(actor: Actor): Promise<ActionResult> {
  await prisma.shoppingListItem.updateMany({
    where: { householdId: actor.householdId, isChecked: true, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  return actionOk();
}

/** Permanently remove every archived row in the household. */
export async function deleteArchivedRows(actor: Actor): Promise<ActionResult> {
  await prisma.shoppingListItem.deleteMany({
    where: { householdId: actor.householdId, archivedAt: { not: null } },
  });
  return actionOk();
}
