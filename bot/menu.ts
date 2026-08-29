import { InlineKeyboard } from "grammy";
import { todayUTC } from "@/lib/period";
import { formatExpiryLabel, formatQuantityWithUnit } from "@/lib/format";
import { getRestockEntries, getItemViews } from "@/lib/queries";
import { needsAttention } from "@/lib/expiry";

import { MESSAGES } from "@/lib/messages";

/**
 * Feature 17.5 — the bot's home screen.
 *
 * Every action is a button here, and every screen can get back to it. The
 * reply keyboard is reduced to a single «Головна», because a permanent row of
 * shortcuts duplicating this menu would be two places to keep in step.
 *
 * All navigation is **stateless**: each button carries what it needs in its
 * callback data, which Telegram caps at 64 bytes — a short prefix plus one
 * uuid fits comfortably.
 */
export const CB = {
  home: "home",
  low: "low",
  expiring: "exp",
  addStock: "addst",
  takeStock: "takest",
  // Shopping list (bot/shopping.ts)
  groups: "sgroups",
  showGroup: "sg:",
  toggleRow: "st:",
  addRow: "sa:",
  newGroup: "sng",
} as const;

/** The label of the one reply-keyboard button, so the handler can match it. */
export const HOME_BUTTON = "🏠 Головна";

export type View = { text: string; keyboard: InlineKeyboard };

export function homeView(name: string): View {
  const keyboard = new InlineKeyboard()
    .text("🛒 Список покупок", CB.groups)
    .row()
    .text("📉 Що закінчується", CB.low)
    .row()
    .text("⏳ Що псується", CB.expiring)
    .row()
    .text("➕ Додати запас", CB.addStock)
    .row()
    .text("➖ Записати, що взяли", CB.takeStock);

  return {
    text: `🏠 Запаси — ${name}\n\nЩо робимо?`,
    keyboard,
  };
}

/** Every leaf screen ends with a way back, or the menu is a one-way trip. */
export function backHome(): InlineKeyboard {
  return new InlineKeyboard().text("🏠 Головна", CB.home);
}

export async function lowView(householdId: string): Promise<View> {
  // Feature 26 — same list the app and the digest show: groups stand in for
  // their members, so the bot cannot disagree with the dashboard.
  const entries = await getRestockEntries(householdId);

  if (entries.length === 0) {
    return { text: MESSAGES["bot.nothingLow"], keyboard: backHome() };
  }

  const lines = entries.map(
    (entry) =>
      `• ${entry.name} — ${
        entry.state === "OUT" || !entry.unit
          ? "закінчився"
          : formatQuantityWithUnit(entry.quantity, entry.unit)
      }`,
  );

  return {
    text: `📉 Закінчується:\n${lines.join("\n")}`,
    keyboard: backHome(),
  };
}

export async function expiringView(householdId: string): Promise<View> {
  const today = todayUTC();
  const items = (await getItemViews(householdId)).filter((item) =>
    needsAttention(item.expiry),
  );

  if (items.length === 0) {
    return { text: MESSAGES["bot.nothingExpiring"], keyboard: backHome() };
  }

  const lines = items.map(
    (item) =>
      `• ${item.name} — ${
        item.nextExpiry ? formatExpiryLabel(item.nextExpiry, today) : "—"
      }`,
  );

  return {
    text: `⏳ Псується:\n${lines.join("\n")}`,
    keyboard: backHome(),
  };
}
