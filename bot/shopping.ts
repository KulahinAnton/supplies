import { InlineKeyboard } from "grammy";
import { prisma } from "@/lib/prisma";
import { getShoppingView } from "@/lib/queries";
import {
  DEFAULT_GROUP_ID,
  groupIdForStorage,
  groupShoppingRows,
} from "@/lib/shopping-groups";
import type { BotUser } from "@/bot/auth";

/**
 * Feature 17.3 — the shopping list inside the chat.
 *
 * Navigation is **stateless**: every button carries what it needs in its
 * callback data, so browsing groups and ticking rows survives a cold
 * serverless instance with no stored conversation.
 *
 * Callback data is capped at 64 bytes by Telegram, which a prefix plus one
 * uuid fits inside comfortably:
 *
 *   sg:<groupId>   show a group          ("sg:__default__" for the common one)
 *   st:<rowId>     toggle bought
 *   sa:<groupId>   add a row to a group
 *   sgroups        back to the group list
 *   sng            new group
 */

export const CB = {
  groups: "sgroups",
  showGroup: "sg:",
  toggleRow: "st:",
  addRow: "sa:",
  newGroup: "sng",
} as const;

/** Rows the list view treats as visible, in the order the web UI shows them. */
async function loadGroups(householdId: string) {
  const { rows, groups } = await getShoppingView(householdId);
  return groupShoppingRows(rows, groups);
}

export function groupListText(): string {
  return "🛒 Список покупок — оберіть групу:";
}

export async function groupListKeyboard(
  householdId: string,
): Promise<InlineKeyboard> {
  const grouped = await loadGroups(householdId);
  const keyboard = new InlineKeyboard();

  for (const group of grouped) {
    const count = group.openCount > 0 ? ` (${group.openCount})` : "";
    keyboard.text(`${group.name}${count}`, `${CB.showGroup}${group.id}`).row();
  }

  keyboard.text("➕ Нова група", CB.newGroup);
  return keyboard;
}

/**
 * One group: its rows, then the actions. A bought row is struck through and
 * stays where it is — the same rule the web UI follows (Feature 14.2), so the
 * two never disagree about where a thing went.
 */
export async function groupView(
  householdId: string,
  groupId: string,
): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const grouped = await loadGroups(householdId);
  const group = grouped.find((candidate) => candidate.id === groupId);
  if (!group) return null;

  const keyboard = new InlineKeyboard();
  for (const row of group.visible) {
    const label = row.item?.name ?? row.freeText ?? "—";
    keyboard
      .text(`${row.isChecked ? "☑" : "☐"} ${label}`, `${CB.toggleRow}${row.id}`)
      .row();
  }

  keyboard.text("➕ Додати", `${CB.addRow}${group.id}`);
  keyboard.text("⬅️ Групи", CB.groups);

  const heading = `🛒 ${group.name}`;
  const body =
    group.visible.length === 0
      ? "Порожньо — натисніть «Додати»."
      : `Позначте куплене, торкнувшись рядка.\nЗалишилось: ${group.openCount}`;

  return { text: `${heading}\n\n${body}`, keyboard };
}

/** Toggle a row, proving it belongs to the caller's household first. */
export async function toggleRow(
  user: BotUser,
  rowId: string,
): Promise<string | null> {
  const row = await prisma.shoppingListItem.findFirst({
    where: { id: rowId, householdId: user.householdId },
    select: { id: true, isChecked: true, groupId: true },
  });
  if (!row) return null;

  await prisma.shoppingListItem.update({
    where: { id: row.id },
    data: row.isChecked
      ? { isChecked: false, checkedAt: null, checkedById: null }
      : { isChecked: true, checkedAt: new Date(), checkedById: user.userId },
  });

  return row.groupId ?? DEFAULT_GROUP_ID;
}

/**
 * Add a free-text row to a specific group (Feature 14.1). The bot must not be
 * a back door that dumps everything into «Загальна група».
 */
export async function addRow(
  user: BotUser,
  groupId: string,
  text: string,
): Promise<boolean> {
  const stored = groupIdForStorage(groupId);

  if (stored !== null) {
    const group = await prisma.shoppingGroup.findFirst({
      where: { id: stored, householdId: user.householdId },
      select: { id: true },
    });
    if (!group) return false;
  }

  await prisma.shoppingListItem.create({
    data: {
      householdId: user.householdId,
      groupId: stored,
      freeText: text.trim().slice(0, 120),
      addedById: user.userId,
    },
  });
  return true;
}

export async function createGroup(
  user: BotUser,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return null;

  const clash = await prisma.shoppingGroup.findFirst({
    where: { householdId: user.householdId, name: trimmed },
    select: { id: true },
  });
  if (clash) return clash.id;

  const count = await prisma.shoppingGroup.count({
    where: { householdId: user.householdId },
  });
  const group = await prisma.shoppingGroup.create({
    data: { householdId: user.householdId, name: trimmed, sortOrder: count },
    select: { id: true },
  });
  return group.id;
}
