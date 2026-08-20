"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { DEFAULT_GROUP_ID, groupIdForStorage } from "@/lib/shopping-groups";

/**
 * Feature 11 — shopping list groups.
 *
 * «Загальна група» is never a row here: it is `groupId = null`, so none of
 * these actions can rename or delete it, and no household can end up without
 * one. Every query is scoped by `householdId` like the rest of the app.
 */

function refresh() {
  revalidatePath("/shopping");
}

const MAX_NAME = 40;

export async function createShoppingGroupAction(
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();

  const trimmed = name.trim();
  if (!trimmed) return actionError(ruleMessage("shoppingGroup.nameRequired"));
  if (trimmed.length > MAX_NAME) {
    return actionError(ruleMessage("shoppingGroup.nameTooLong"));
  }

  const clash = await prisma.shoppingGroup.findFirst({
    where: { householdId: session.householdId, name: trimmed },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("shoppingGroup.nameTaken"));

  const count = await prisma.shoppingGroup.count({
    where: { householdId: session.householdId },
  });

  const group = await prisma.shoppingGroup.create({
    data: { householdId: session.householdId, name: trimmed, sortOrder: count },
    select: { id: true },
  });

  refresh();
  return actionOk({ id: group.id });
}

export async function renameShoppingGroupAction(
  groupId: string,
  name: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const trimmed = name.trim();
  if (!trimmed) return actionError(ruleMessage("shoppingGroup.nameRequired"));
  if (trimmed.length > MAX_NAME) {
    return actionError(ruleMessage("shoppingGroup.nameTooLong"));
  }

  const owned = await prisma.shoppingGroup.findFirst({
    where: { id: groupId, householdId: session.householdId },
    select: { id: true },
  });
  if (!owned) return actionError(ruleMessage("shoppingGroup.notFound"));

  const clash = await prisma.shoppingGroup.findFirst({
    where: {
      householdId: session.householdId,
      name: trimmed,
      id: { not: groupId },
    },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("shoppingGroup.nameTaken"));

  await prisma.shoppingGroup.update({
    where: { id: groupId },
    data: { name: trimmed },
  });

  refresh();
  return actionOk();
}

/**
 * Deleting a group never deletes what is in it — the rows fall back to
 * «Загальна група». The schema's `SetNull` does this; the explicit update
 * keeps it true even if that ever changes, and makes the intent legible.
 */
export async function deleteShoppingGroupAction(
  groupId: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const owned = await prisma.shoppingGroup.findFirst({
    where: { id: groupId, householdId: session.householdId },
    select: { id: true },
  });
  if (!owned) return actionError(ruleMessage("shoppingGroup.notFound"));

  await prisma.$transaction(async (tx) => {
    await tx.shoppingListItem.updateMany({
      where: { groupId, householdId: session.householdId },
      data: { groupId: null },
    });
    await tx.shoppingGroup.delete({ where: { id: groupId } });
  });

  refresh();
  return actionOk();
}

/** Drag-and-drop and the "move to" menu both land here. */
export async function moveListRowToGroupAction(
  rowId: string,
  targetGroupId: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const row = await prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: session.householdId },
    select: { id: true },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  const groupId = groupIdForStorage(targetGroupId);

  // A group id from the client is untrusted: prove it belongs to this
  // household before pointing a row at it.
  if (groupId !== null) {
    const group = await prisma.shoppingGroup.findFirst({
      where: { id: groupId, householdId: session.householdId },
      select: { id: true },
    });
    if (!group) return actionError(ruleMessage("shoppingGroup.notFound"));
  }

  await prisma.shoppingListItem.update({
    where: { id: rowId },
    data: { groupId },
  });

  refresh();
  return actionOk();
}

/** Reorder the named groups. The default group is not in this list. */
export async function reorderShoppingGroupsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();

  const ids = orderedIds.filter((id) => id !== DEFAULT_GROUP_ID);
  const owned = await prisma.shoppingGroup.findMany({
    where: { id: { in: ids }, householdId: session.householdId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    return actionError(ruleMessage("shoppingGroup.notFound"));
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.shoppingGroup.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  refresh();
  return actionOk();
}
