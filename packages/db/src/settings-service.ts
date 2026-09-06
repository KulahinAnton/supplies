import { prisma } from "./prisma";
import type { Actor } from "./stock-service";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { canJoinGroup } from "../../core/src/item-group";
import { ruleMessage } from "../../core/src/messages";

/**
 * Categories, storage locations, item groups and household settings.
 *
 * Moved out of `lib/actions/settings.ts` for Feature 34. Three rules in here
 * are why it could not stay: "at most one default" is enforced by clearing
 * every row inside a transaction, reordering is a whole-list rewrite rather
 * than a patch, and deleting a row that is in use is refused rather than
 * cascaded. None of those are presentation, and none survive being written
 * twice.
 *
 * **The three lists are written out rather than abstracted over.** An earlier
 * draft indexed `prisma[table]` to share one implementation; Prisma's delegate
 * types are a union whose call signatures do not unify, so it needed
 * `@ts-expect-error` at every call — trading real type checking for fewer
 * lines. The repetition below is the better bargain.
 */

/** Every id must belong to the caller, or a forged list reorders someone else's. */
function ownsAll(ids: string[], owned: { id: string }[]): boolean {
  return owned.length === ids.length;
}

/**
 * Feature 15.1 — reordering is a WHOLE-LIST rewrite. The client sends every id
 * in its new order and this writes `sortOrder = index` for each. Sending one
 * moved id and patching around it invites gaps and ties; rewriting cannot
 * drift.
 */
export async function reorderCategories(
  actor: Actor,
  orderedIds: string[],
): Promise<ActionResult> {
  const owned = await prisma.category.findMany({
    where: { id: { in: orderedIds }, householdId: actor.householdId },
    select: { id: true },
  });
  if (!ownsAll(orderedIds, owned)) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return actionOk();
}

export async function reorderLocations(
  actor: Actor,
  orderedIds: string[],
): Promise<ActionResult> {
  const owned = await prisma.storageLocation.findMany({
    where: { id: { in: orderedIds }, householdId: actor.householdId },
    select: { id: true },
  });
  if (!ownsAll(orderedIds, owned)) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.storageLocation.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return actionOk();
}

/** Feature 26 — same whole-list rewrite as the other reorderable settings. */
export async function reorderItemGroups(
  actor: Actor,
  orderedIds: string[],
): Promise<ActionResult> {
  const owned = await prisma.itemGroup.findMany({
    where: { id: { in: orderedIds }, householdId: actor.householdId },
    select: { id: true },
  });
  if (!ownsAll(orderedIds, owned)) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.itemGroup.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
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
export async function setDefaultCategory(
  actor: Actor,
  categoryId: string,
): Promise<ActionResult> {
  const row = await prisma.category.findFirst({
    where: { id: categoryId, householdId: actor.householdId },
    select: { id: true, isDefault: true },
  });
  if (!row) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(async (tx) => {
    await tx.category.updateMany({
      where: { householdId: actor.householdId },
      data: { isDefault: false },
    });
    if (!row.isDefault) {
      await tx.category.update({ where: { id: categoryId }, data: { isDefault: true } });
    }
  });
  return actionOk();
}

export async function setDefaultLocation(
  actor: Actor,
  locationId: string,
): Promise<ActionResult> {
  const row = await prisma.storageLocation.findFirst({
    where: { id: locationId, householdId: actor.householdId },
    select: { id: true, isDefault: true },
  });
  if (!row) return actionError(ruleMessage("auth.forbidden"));

  await prisma.$transaction(async (tx) => {
    await tx.storageLocation.updateMany({
      where: { householdId: actor.householdId },
      data: { isDefault: false },
    });
    if (!row.isDefault) {
      await tx.storageLocation.update({
        where: { id: locationId },
        data: { isDefault: true },
      });
    }
  });
  return actionOk();
}

/**
 * §3.5/§7 — `expiryWarnDays` and `digestHour` are household DATA. The engine
 * takes them as input; nothing hardcodes 7.
 */
export async function updateHousehold(
  actor: Actor,
  data: { expiryWarnDays?: number; digestHour?: number; aiEnabled?: boolean },
): Promise<ActionResult> {
  await prisma.household.update({ where: { id: actor.householdId }, data });
  return actionOk();
}

export async function saveCategory(
  actor: Actor,
  input: { id?: string; name: string; icon: string; expiryWarnDays: number | null },
): Promise<ActionResult> {
  const { id, name, icon, expiryWarnDays } = input;

  const clash = await prisma.category.findFirst({
    where: { householdId: actor.householdId, name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("settings.categoryNameTaken"));

  if (id) {
    const owned = await prisma.category.findFirst({
      where: { id, householdId: actor.householdId },
      select: { id: true },
    });
    if (!owned) return actionError(ruleMessage("auth.forbidden"));
    await prisma.category.update({ where: { id }, data: { name, icon, expiryWarnDays } });
    return actionOk();
  }

  // New rows go at the end, so adding one never reshuffles the list.
  const sortOrder = await prisma.category.count({
    where: { householdId: actor.householdId },
  });
  await prisma.category.create({
    data: { householdId: actor.householdId, name, icon, expiryWarnDays, sortOrder },
  });
  return actionOk();
}

/**
 * Refused rather than cascaded — the items would silently lose their category.
 * The same reasoning applies to locations and to sets, each with its own
 * message, which is why these three are not one function.
 */
export async function deleteCategory(actor: Actor, id: string): Promise<ActionResult> {
  const row = await prisma.category.findFirst({
    where: { id, householdId: actor.householdId },
    include: { _count: { select: { items: true } } },
  });
  if (!row) return actionError(ruleMessage("auth.forbidden"));
  if (row._count.items > 0) return actionError(ruleMessage("settings.categoryInUse"));

  await prisma.category.delete({ where: { id } });
  return actionOk();
}

export async function saveLocation(
  actor: Actor,
  input: { id?: string; name: string },
): Promise<ActionResult> {
  const { id, name } = input;

  const clash = await prisma.storageLocation.findFirst({
    where: { householdId: actor.householdId, name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("settings.locationNameTaken"));

  if (id) {
    const owned = await prisma.storageLocation.findFirst({
      where: { id, householdId: actor.householdId },
      select: { id: true },
    });
    if (!owned) return actionError(ruleMessage("auth.forbidden"));
    await prisma.storageLocation.update({ where: { id }, data: { name } });
    return actionOk();
  }

  const sortOrder = await prisma.storageLocation.count({
    where: { householdId: actor.householdId },
  });
  await prisma.storageLocation.create({
    data: { householdId: actor.householdId, name, sortOrder },
  });
  return actionOk();
}

export async function deleteLocation(actor: Actor, id: string): Promise<ActionResult> {
  const row = await prisma.storageLocation.findFirst({
    where: { id, householdId: actor.householdId },
    include: { _count: { select: { items: true } } },
  });
  if (!row) return actionError(ruleMessage("auth.forbidden"));
  if (row._count.items > 0) return actionError(ruleMessage("settings.locationInUse"));

  await prisma.storageLocation.delete({ where: { id } });
  return actionOk();
}

/**
 * Feature 26 — create or rename a set of interchangeable items. Same ownership
 * proof, name-clash check and append-at-the-end ordering as the other two.
 */
export async function saveItemGroup(
  actor: Actor,
  input: { id?: string; name: string; minQty: string },
): Promise<ActionResult> {
  const { id, name, minQty } = input;

  const clash = await prisma.itemGroup.findFirst({
    where: { householdId: actor.householdId, name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return actionError(ruleMessage("group.nameTaken"));

  if (id) {
    const owned = await prisma.itemGroup.findFirst({
      where: { id, householdId: actor.householdId },
      select: { id: true },
    });
    if (!owned) return actionError(ruleMessage("auth.forbidden"));
    await prisma.itemGroup.update({ where: { id }, data: { name, minQty } });
    return actionOk();
  }

  const sortOrder = await prisma.itemGroup.count({
    where: { householdId: actor.householdId },
  });
  await prisma.itemGroup.create({
    data: { householdId: actor.householdId, name, minQty, sortOrder },
  });
  return actionOk();
}

/**
 * Deleting a set with members is refused rather than cascading.
 *
 * Emptying it silently would leave those items with no threshold at all — the
 * set was carrying it — so they would quietly stop being reminded about.
 * Making the person remove the members first is the only way they find that out
 * at the time rather than weeks later.
 */
export async function deleteItemGroup(actor: Actor, id: string): Promise<ActionResult> {
  const row = await prisma.itemGroup.findFirst({
    where: { id, householdId: actor.householdId },
    include: { _count: { select: { items: true } } },
  });
  if (!row) return actionError(ruleMessage("auth.forbidden"));
  if (row._count.items > 0) return actionError(ruleMessage("group.hasItems"));

  await prisma.itemGroup.delete({ where: { id } });
  return actionOk();
}

/**
 * Feature 26.2 — put an existing item into a set from the set's own page.
 *
 * Moving an item that already belongs to another set is allowed rather than
 * refused: the item form has always let you change the set, and refusing here
 * would be an inconsistency the user has to discover.
 */
export async function addItemToGroup(
  actor: Actor,
  groupId: string,
  itemId: string,
): Promise<ActionResult> {
  const [group, item] = await Promise.all([
    prisma.itemGroup.findFirst({
      where: { id: groupId, householdId: actor.householdId },
      include: {
        items: { where: { id: { not: itemId } }, select: { unit: true }, take: 1 },
      },
    }),
    prisma.item.findFirst({
      where: { id: itemId, householdId: actor.householdId },
      select: { id: true, unit: true },
    }),
  ]);
  if (!group) return actionError(ruleMessage("group.notFound"));
  if (!item) return actionError(ruleMessage("item.notFound"));

  const verdict = canJoinGroup(group.items[0]?.unit ?? null, item.unit);
  if (!verdict.ok) return actionError(verdict.error);

  await prisma.item.update({ where: { id: item.id }, data: { groupId } });
  return actionOk();
}

/** Feature 26.2 — take an item out of its set. The item itself is untouched. */
export async function removeItemFromGroup(
  actor: Actor,
  itemId: string,
): Promise<ActionResult> {
  const item = await prisma.item.findFirst({
    where: { id: itemId, householdId: actor.householdId },
    select: { id: true },
  });
  if (!item) return actionError(ruleMessage("item.notFound"));

  // Its own minQty starts applying again, which is why the item list shows the
  // set badge: leaving one is a change in what gets reminded about.
  await prisma.item.update({ where: { id: item.id }, data: { groupId: null } });
  return actionOk();
}
