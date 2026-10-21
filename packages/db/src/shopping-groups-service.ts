import { prisma } from "./prisma";
import type { Actor } from "./stock-service";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { ruleMessage } from "../../core/src/messages";
import {
  DEFAULT_GROUP_ID,
  groupIdForStorage,
} from "../../core/src/shopping-groups";

/**
 * Feature 11 — shopping list groups.
 *
 * Moved out of `apps/web/lib/actions/shopping-groups.ts` when the SPA needed
 * them, on the same reasoning as every other service here: a second front end
 * must inherit the rules rather than re-derive them. Writing these again in
 * the API would have been the third copy of "a group name is unique within a
 * household" and the second of "deleting a group never deletes what is in it".
 *
 * **«Загальна група» is never a row.** It is `groupId = null`, which is why
 * nothing below can rename or delete it and why no household can end up
 * without one. `groupIdForStorage` is the single place that translates the
 * client's sentinel id into that null.
 *
 * `revalidatePath` stays in the server action — this module does not know what
 * a route is.
 */

/** Long enough for «Епіцентр на Кільцевій», short enough to fit a heading. */
const MAX_NAME = 40;

function validName(name: string): { ok: true; name: string } | { ok: false; key: "shoppingGroup.nameRequired" | "shoppingGroup.nameTooLong" } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, key: "shoppingGroup.nameRequired" };
  if (trimmed.length > MAX_NAME) return { ok: false, key: "shoppingGroup.nameTooLong" };
  return { ok: true, name: trimmed };
}

/** Scoped by household, so another family's group reads as "not found". */
async function ownGroup(actor: Actor, groupId: string) {
  return prisma.shoppingGroup.findFirst({
    where: { id: groupId, householdId: actor.householdId },
    select: { id: true },
  });
}

async function nameTaken(actor: Actor, name: string, exceptId?: string) {
  const clash = await prisma.shoppingGroup.findFirst({
    where: {
      householdId: actor.householdId,
      name,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return clash !== null;
}

export async function createShoppingGroup(
  actor: Actor,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const valid = validName(name);
  if (!valid.ok) return actionError(ruleMessage(valid.key));
  if (await nameTaken(actor, valid.name)) {
    return actionError(ruleMessage("shoppingGroup.nameTaken"));
  }

  const count = await prisma.shoppingGroup.count({
    where: { householdId: actor.householdId },
  });

  const group = await prisma.shoppingGroup.create({
    data: { householdId: actor.householdId, name: valid.name, sortOrder: count },
    select: { id: true },
  });

  return actionOk({ id: group.id });
}

export async function renameShoppingGroup(
  actor: Actor,
  groupId: string,
  name: string,
): Promise<ActionResult> {
  const valid = validName(name);
  if (!valid.ok) return actionError(ruleMessage(valid.key));
  if (!(await ownGroup(actor, groupId))) {
    return actionError(ruleMessage("shoppingGroup.notFound"));
  }
  if (await nameTaken(actor, valid.name, groupId)) {
    return actionError(ruleMessage("shoppingGroup.nameTaken"));
  }

  await prisma.shoppingGroup.update({
    where: { id: groupId },
    data: { name: valid.name },
  });

  return actionOk();
}

/**
 * Deleting a group never deletes what is in it — the rows fall back to
 * «Загальна група». The schema's `SetNull` does this on its own; the explicit
 * update keeps it true even if that ever changes, and makes the intent legible
 * at the place someone reads to find out what delete does.
 */
export async function deleteShoppingGroup(
  actor: Actor,
  groupId: string,
): Promise<ActionResult> {
  if (!(await ownGroup(actor, groupId))) {
    return actionError(ruleMessage("shoppingGroup.notFound"));
  }

  await prisma.$transaction(async (tx) => {
    await tx.shoppingListItem.updateMany({
      where: { groupId, householdId: actor.householdId },
      data: { groupId: null },
    });
    await tx.shoppingGroup.delete({ where: { id: groupId } });
  });

  return actionOk();
}

/** Drag-and-drop and the "move to" menu both land here. */
export async function moveListRowToGroup(
  actor: Actor,
  rowId: string,
  targetGroupId: string,
): Promise<ActionResult> {
  const row = await prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: actor.householdId },
    select: { id: true },
  });
  if (!row) return actionError(ruleMessage("shopping.notFound"));

  const groupId = groupIdForStorage(targetGroupId);

  // A group id from a client is untrusted: prove it belongs to this household
  // before pointing a row at it.
  if (groupId !== null && !(await ownGroup(actor, groupId))) {
    return actionError(ruleMessage("shoppingGroup.notFound"));
  }

  await prisma.shoppingListItem.update({ where: { id: rowId }, data: { groupId } });
  return actionOk();
}

/** Reorder the named groups. The default group is not in this list. */
export async function reorderShoppingGroups(
  actor: Actor,
  orderedIds: string[],
): Promise<ActionResult> {
  const ids = orderedIds.filter((id) => id !== DEFAULT_GROUP_ID);
  const owned = await prisma.shoppingGroup.findMany({
    where: { id: { in: ids }, householdId: actor.householdId },
    select: { id: true },
  });
  // All or nothing: a partial reorder from a forged list would leave the
  // household with an order nobody chose.
  if (owned.length !== ids.length) {
    return actionError(ruleMessage("shoppingGroup.notFound"));
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.shoppingGroup.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return actionOk();
}
