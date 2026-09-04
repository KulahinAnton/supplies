import { InlineKeyboard, Keyboard } from "grammy";
import { todayUTC } from "@supplies/core/period";
import { formatExpiryLabel, formatQuantityWithUnit } from "@supplies/core/format";
import { getRestockEntries, getItemViews } from "@/lib/queries";
import { needsAttention, splitExpiring } from "@supplies/core/expiry";

import { MESSAGES } from "@supplies/core/messages";

/**
 * Feature 17.5 — the bot's home screen.
 *
 * Every action is a button here, and every screen can get back to it. The
 * reply keyboard repeats the three most-used screens as shortcuts — see
 * BUTTONS, and Feature 30.1 for why they came back.
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

/**
 * Feature 30.1 — the reply keyboard's labels, and what each one opens.
 *
 * Reported: the two buttons above the text field answered with the main menu
 * instead of a list. They are a keyboard Telegram is still SHOWING from an
 * earlier version of this bot — a custom reply keyboard lives in the client
 * until a message replaces it, and Feature 17.5 cut the row down to a single
 * «Головна» without ever sending that replacement to chats linked before it.
 * So the taps arrived as plain text nobody matched, and an unmatched message
 * with no conversation in progress opens the menu. The bot was answering a
 * question it had not been asked.
 *
 * Rather than evict a keyboard people are visibly using, the labels are now
 * matched by name and the keyboard offers them again. A label is only an
 * alias for a screen the inline menu already has, so this is one more way in,
 * not a second implementation — which is what Feature 17.5 was guarding
 * against when it removed the row.
 *
 * Never rename these. Old clients keep sending the old text forever; the
 * entries are what those taps land on.
 */
export const BUTTONS = {
  home: "🏠 Головна",
  shopping: "🛒 Список покупок",
  low: "📉 Що закінчується",
  expiring: "⏳ Що псується",
} as const;

export type Shortcut = keyof typeof BUTTONS;

/** The screen a reply-keyboard tap asks for, or null for ordinary text. */
export function shortcutFor(text: string): Shortcut | null {
  const needle = text.trim();
  const match = Object.entries(BUTTONS).find(([, label]) => label === needle);
  return match ? (match[0] as Shortcut) : null;
}

export type View = { text: string; keyboard: InlineKeyboard };

export function homeView(name: string): View {
  const keyboard = new InlineKeyboard()
    .text(BUTTONS.shopping, CB.groups)
    .row()
    .text(BUTTONS.low, CB.low)
    .row()
    .text(BUTTONS.expiring, CB.expiring)
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
  return new InlineKeyboard().text(BUTTONS.home, CB.home);
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

  // Feature 30 — the same two blocks the digest and the dashboard show. One
  // list mixed "bin this" with "eat this first", and in a chat there is no
  // badge to tell them apart at a glance.
  const { expired, soon } = splitExpiring(items);
  const blocks: string[] = [];

  const lines = (rows: typeof items) =>
    rows
      .map(
        (item) =>
          `• ${item.name} — ${
            item.nextExpiry ? formatExpiryLabel(item.nextExpiry, today) : "—"
          }`,
      )
      .join("\n");

  if (expired.length > 0) blocks.push(`❌ Прострочено:\n${lines(expired)}`);
  if (soon.length > 0) {
    blocks.push(`⏳ Спожити найближчим часом:\n${lines(soon)}`);
  }

  return { text: blocks.join("\n\n"), keyboard: backHome() };
}

/**
 * Feature 30.2 / 30.3 — the reply keyboard itself, defined once because two
 * senders now carry it: the bot when a chat is behind, and the daily digest.
 *
 * Deliberately NOT `.persistent()`. That flag keeps the custom keyboard up and
 * removes the control that hides it, and on Android the back button is then
 * spent trying to dismiss a keyboard that will not dismiss — the chat cannot
 * be left at all. A row of shortcuts is not worth trapping someone in a chat.
 */
export function replyKeyboard(): Keyboard {
  return new Keyboard()
    .text(BUTTONS.home)
    .text(BUTTONS.shopping)
    .row()
    .text(BUTTONS.low)
    .text(BUTTONS.expiring)
    .resized();
}

/**
 * Feature 30.3 — bump this whenever the keyboard above changes.
 *
 * A chat's `keyboardVersion` records what it was last SENT, not what it was
 * built with, because a keyboard only reaches a client on a message. Chats
 * still on a lower number are owed the new one; see `oweKeyboard`.
 *
 * 1 — the first version anyone is owed: the shortcuts, without `is_persistent`
 *     (Feature 30.2). Everything linked before this counts as 0.
 */
export const KEYBOARD_VERSION = 1;
