"use server";

import { canJoinGroup } from "@supplies/core/item-group";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import { ruleMessage } from "@supplies/core/messages";
import {
  categorySchema,
  householdSettingsSchema,
  itemGroupSchema,
  locationSchema,
} from "@supplies/core/validation/settings";
import { firstIssueAsRuleMessage } from "@supplies/core/validation/shared";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/items");
}

/**
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household DATA. The engine
 * takes them as input; nothing hardcodes 7.
 */
export async function updateHouseholdAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = householdSettingsSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  await prisma.household.update({
    where: { id: session.householdId },
    data: parsed.data,
  });

  refresh();
  return actionOk();
}

export async function saveCategoryAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const { id, name, icon, expiryWarnDays } = parsed.data;

  const clash = await prisma.category.findFirst({
    where: {
      householdId: session.householdId,
      name,
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("settings.categoryNameTaken"));

  if (id) {
    const owned = await prisma.category.findFirst({
      where: { id, householdId: session.householdId },
      select: { id: true },
    });
    if (!owned) return actionError(ruleMessage("auth.forbidden"));
    await prisma.category.update({
      where: { id },
      data: { name, icon, expiryWarnDays },
    });
  } else {
    const count = await prisma.category.count({
      where: { householdId: session.householdId },
    });
    await prisma.category.create({
      data: {
        householdId: session.householdId,
        name,
        icon,
        expiryWarnDays,
        sortOrder: count,
      },
    });
  }

  refresh();
  return actionOk();
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const category = await prisma.category.findFirst({
    where: { id, householdId: session.householdId },
    include: { _count: { select: { items: true } } },
  });
  if (!category) return actionError(ruleMessage("auth.forbidden"));
  if (category._count.items > 0) {
    return actionError(ruleMessage("settings.categoryInUse"));
  }

  await prisma.category.delete({ where: { id } });
  refresh();
  return actionOk();
}

export async function saveLocationAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const { id, name } = parsed.data;

  const clash = await prisma.storageLocation.findFirst({
    where: {
      householdId: session.householdId,
      name,
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("settings.locationNameTaken"));

  if (id) {
    const owned = await prisma.storageLocation.findFirst({
      where: { id, householdId: session.householdId },
      select: { id: true },
    });
    if (!owned) return actionError(ruleMessage("auth.forbidden"));
    await prisma.storageLocation.update({ where: { id }, data: { name } });
  } else {
    const count = await prisma.storageLocation.count({
      where: { householdId: session.householdId },
    });
    await prisma.storageLocation.create({
      data: { householdId: session.householdId, name, sortOrder: count },
    });
  }

  refresh();
  return actionOk();
}

export async function deleteLocationAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const location = await prisma.storageLocation.findFirst({
    where: { id, householdId: session.householdId },
    include: { _count: { select: { items: true } } },
  });
  if (!location) return actionError(ruleMessage("auth.forbidden"));
  if (location._count.items > 0) {
    return actionError(ruleMessage("settings.locationInUse"));
  }

  await prisma.storageLocation.delete({ where: { id } });
  refresh();
  return actionOk();
}

/**
 * Feature 15.1 — reorder a settings list.
 *
 * A WHOLE-LIST rewrite: the client sends every id in its new order and this
 * writes `sortOrder = index` for each. Sending one moved id and patching
 * around it invites gaps and ties; rewriting cannot drift.
 *
 * Every id is proved to belong to the caller's household first, so a forged
 * list cannot reorder another family's categories.
 */
export async function reorderCategoriesAction(
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();

  const owned = await prisma.category.findMany({
    where: { id: { in: orderedIds }, householdId: session.householdId },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    return actionError(ruleMessage("auth.forbidden"));
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  refresh();
  return actionOk();
}

export async function reorderLocationsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();

  const owned = await prisma.storageLocation.findMany({
    where: { id: { in: orderedIds }, householdId: session.householdId },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    return actionError(ruleMessage("auth.forbidden"));
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.storageLocation.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  refresh();
  return actionOk();
}

/**
 * Feature 15.2 — star a row as the default for new items.
 *
 * A TOGGLE: starring the already-starred row clears it, leaving the household
 * with no default, which is a legitimate state. "At most one" is enforced by
 * clearing every row before setting the chosen one, inside one transaction —
 * the invariant lives here, not in hope.
 */
export async function setDefaultCategoryAction(
  categoryId: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, householdId: session.householdId },
    select: { id: true, isDefault: true },
  });
  if (!category) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(async (tx) => {
    await tx.category.updateMany({
      where: { householdId: session.householdId },
      data: { isDefault: false },
    });
    if (!category.isDefault) {
      await tx.category.update({
        where: { id: categoryId },
        data: { isDefault: true },
      });
    }
  });

  refresh();
  return actionOk();
}

export async function setDefaultLocationAction(
  locationId: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const location = await prisma.storageLocation.findFirst({
    where: { id: locationId, householdId: session.householdId },
    select: { id: true, isDefault: true },
  });
  if (!location) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(async (tx) => {
    await tx.storageLocation.updateMany({
      where: { householdId: session.householdId },
      data: { isDefault: false },
    });
    if (!location.isDefault) {
      await tx.storageLocation.update({
        where: { id: locationId },
        data: { isDefault: true },
      });
    }
  });

  refresh();
  return actionOk();
}

/**
 * Feature 26 — create or rename a set of interchangeable items.
 *
 * Modelled on `saveLocationAction`: same ownership proof, same name-clash
 * check, same append-at-the-end ordering for a new row.
 */
export async function saveItemGroupAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = itemGroupSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const { id, name, minQty } = parsed.data;

  const clash = await prisma.itemGroup.findFirst({
    where: {
      householdId: session.householdId,
      name,
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("group.nameTaken"));

  if (id) {
    const owned = await prisma.itemGroup.findFirst({
      where: { id, householdId: session.householdId },
      select: { id: true },
    });
    if (!owned) return actionError(ruleMessage("auth.forbidden"));
    await prisma.itemGroup.update({ where: { id }, data: { name, minQty } });
  } else {
    const count = await prisma.itemGroup.count({
      where: { householdId: session.householdId },
    });
    await prisma.itemGroup.create({
      data: { householdId: session.householdId, name, minQty, sortOrder: count },
    });
  }

  refresh();
  return actionOk();
}

/**
 * Deleting a group with members is refused rather than cascading.
 *
 * Emptying it silently would leave those items with no threshold at all — the
 * group was carrying it — so they would quietly stop being reminded about.
 * Making the person remove the members first is the only way they find that
 * out at the time rather than weeks later.
 */
export async function deleteItemGroupAction(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const group = await prisma.itemGroup.findFirst({
    where: { id, householdId: session.householdId },
    include: { _count: { select: { items: true } } },
  });
  if (!group) return actionError(ruleMessage("auth.forbidden"));
  if (group._count.items > 0) return actionError(ruleMessage("group.hasItems"));

  await prisma.itemGroup.delete({ where: { id } });
  refresh();
  return actionOk();
}

/** Feature 26 — same whole-list rewrite as the other reorderable settings. */
export async function reorderItemGroupsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();

  const owned = await prisma.itemGroup.findMany({
    where: { id: { in: orderedIds }, householdId: session.householdId },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    return actionError(ruleMessage("auth.forbidden"));
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.itemGroup.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  refresh();
  return actionOk();
}

/**
 * Feature 26.2 — put an existing item into a set from the set's own page.
 *
 * Moving an item that already belongs to another set is allowed rather than
 * refused: the item form has always let you change the set, and refusing here
 * would be an inconsistency the user has to discover. The picker shows which
 * set an item is currently in, so the move is never a surprise.
 */
export async function addItemToGroupAction(
  groupId: string,
  itemId: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const [group, item] = await Promise.all([
    prisma.itemGroup.findFirst({
      where: { id: groupId, householdId: session.householdId },
      include: {
        items: { where: { id: { not: itemId } }, select: { unit: true }, take: 1 },
      },
    }),
    prisma.item.findFirst({
      where: { id: itemId, householdId: session.householdId },
      select: { id: true, unit: true },
    }),
  ]);
  if (!group) return actionError(ruleMessage("group.notFound"));
  if (!item) return actionError(ruleMessage("item.notFound"));

  const verdict = canJoinGroup(group.items[0]?.unit ?? null, item.unit);
  if (!verdict.ok) return actionError(verdict.error);

  await prisma.item.update({ where: { id: item.id }, data: { groupId } });
  refresh();
  return actionOk();
}

/** Feature 26.2 — take an item out of its set. The item itself is untouched. */
export async function removeItemFromGroupAction(
  itemId: string,
): Promise<ActionResult> {
  const session = await requireSession();

  const item = await prisma.item.findFirst({
    where: { id: itemId, householdId: session.householdId },
    select: { id: true },
  });
  if (!item) return actionError(ruleMessage("item.notFound"));

  // Its own minQty starts applying again, which is why the item list shows the
  // set badge: leaving one is a change in what gets reminded about.
  await prisma.item.update({ where: { id: item.id }, data: { groupId: null } });
  refresh();
  return actionOk();
}
