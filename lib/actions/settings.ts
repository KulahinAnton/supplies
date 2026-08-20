"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import {
  categorySchema,
  householdSettingsSchema,
  locationSchema,
} from "@/lib/validation/settings";
import { firstIssueAsRuleMessage } from "@/lib/validation/shared";

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
