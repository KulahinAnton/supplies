import { Bot, type Context } from "grammy";
import { prisma } from "@supplies/db/prisma";
import { MESSAGES, renderMessage } from "@supplies/core/messages";
import { verifyLinkToken } from "@supplies/core/telegram-link";
import { UNIT_SHORT } from "@supplies/core/format";
import { getItemViews } from "@supplies/db/queries";
import { botConsume, botAddStock } from "./actions";
import {
  clearPending,
  getPending,
  markKeyboardSent,
  setPending,
} from "./state";
import { resolveChat, type BotUser } from "./auth";
import {
  CB,
  KEYBOARD_VERSION,
  backHome,
  expiringView,
  homeView,
  lowView,
  replyKeyboard,
  shortcutFor,
  type Shortcut,
  type View,
} from "./menu";
import {
  addRow,
  createGroup,
  groupListView,
  groupView,
  toggleRow,
} from "./shopping";

/**
 * Feature 9 + 17 — the bot is a SECOND FRONT END, never a second
 * implementation. Every read goes through lib/queries.ts and every write
 * through lib/stock-service.ts or the same rules the web UI uses.
 *
 * Navigation lives on inline keyboards (Feature 17.5): the home screen holds
 * every action, and every screen leads back to it. The reply keyboard repeats
 * the three most-used screens as shortcuts (Feature 30.1) — every label is an
 * alias for one of those inline screens, never a second path through the
 * logic.
 */

export const BOT_COMMANDS = [
  { command: "menu", description: "Головне меню" },
  { command: "list", description: "Список покупок" },
  { command: "low", description: "Що закінчується" },
  { command: "expiring", description: "Що псується" },
  { command: "add", description: "Додати запас" },
  { command: "took", description: "Записати, що взяли" },
  { command: "cancel", description: "Скасувати" },
];

export async function registerCommands(bot: Bot) {
  await bot.api.setMyCommands(BOT_COMMANDS);
}

export function createBot(token: string) {
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const payload = ctx.match?.trim();
    const secret = process.env.AUTH_SECRET;

    if (!payload || !secret) {
      /**
       * Feature 30.2 — a bare `/start` on a linked chat re-sends the keyboard.
       *
       * The fix for the trapped back button is to stop asking for a persistent
       * keyboard, but a keyboard already installed in a client stays until a
       * message carries a new one — and the only message that ever carried one
       * was the reply to the link. Without this, every chat linked before the
       * fix keeps the keyboard that swallows Back, forever.
       *
       * `/start` is the gesture Telegram itself offers for a bot that is
       * misbehaving, so this is where someone will look. It also stops the
       * command telling an already-linked user they are not linked.
       */
      const linked = await resolveChat(ctx.chat?.id);
      if (!linked) {
        await ctx.reply(MESSAGES["bot.notLinked"]);
        return;
      }
      await ctx.reply(MESSAGES["bot.keyboardRefreshed"], {
        reply_markup: replyKeyboard(),
      });
      await markKeyboardSent(BigInt(linked.chatId), KEYBOARD_VERSION);
      await send(ctx, homeView(linked.name));
      return;
    }

    const userId = verifyLinkToken(payload, secret);
    if (!userId) {
      await ctx.reply(MESSAGES["bot.linkInvalid"]);
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true, name: true },
    });
    if (!user) {
      await ctx.reply(MESSAGES["bot.linkInvalid"]);
      return;
    }

    const chatId = BigInt(ctx.chat.id);
    // One chat per user and one user per chat — re-linking replaces both sides.
    await prisma.$transaction(async (tx) => {
      await tx.telegramLink.deleteMany({
        where: { OR: [{ userId: user.id }, { chatId }] },
      });
      // The reply below carries the keyboard, so this chat starts current and
      // is never told its buttons were refreshed one message later.
      await tx.telegramLink.create({
        data: { userId: user.id, chatId, keyboardVersion: KEYBOARD_VERSION },
      });
    });

    await ctx.reply(
      renderMessage({ key: "bot.linked", params: { name: user.name } }),
      { reply_markup: replyKeyboard() },
    );
    const home = homeView(user.name);
    await ctx.reply(home.text, { reply_markup: home.keyboard });
  });

  /** Everything below requires a linked chat. */
  async function withUser(ctx: Context, work: (user: BotUser) => Promise<void>) {
    const user = await resolveChat(ctx.chat?.id);
    if (!user) {
      await ctx.reply(MESSAGES["bot.notLinked"]);
      return;
    }
    await settleKeyboardDebt(ctx, user);
    await work(user);
  }

  /**
   * Feature 30.3 — hand over the current keyboard if this chat is behind.
   *
   * Every update goes through here, so whichever way someone next touches the
   * bot — a command, a shortcut, an inline button — is the moment they get it.
   * Nobody has to type `/start`, and there is no broadcast: a chat that never
   * comes back is a chat that would never have seen the keyboard anyway.
   *
   * It costs one extra message, once per chat per keyboard version, and it has
   * to be its own message: Telegram allows a single `reply_markup` per message
   * and almost everything the bot sends carries an inline menu instead.
   *
   * Failure is deliberately quiet, and the version is only recorded once the
   * send has been accepted — marking it first would let one bad moment silence
   * the debt permanently, which is exactly the bug this exists to prevent.
   */
  async function settleKeyboardDebt(ctx: Context, user: BotUser) {
    try {
      // Read by `resolveChat` a moment ago — no second lookup.
      if (user.keyboardVersion >= KEYBOARD_VERSION) return;
      await ctx.reply(MESSAGES["bot.keyboardRefreshed"], {
        reply_markup: replyKeyboard(),
      });
      await markKeyboardSent(BigInt(user.chatId), KEYBOARD_VERSION);
    } catch (error) {
      // Never let the keyboard get in the way of what the user actually asked
      // for; the debt simply stands until the next update.
      console.error("[bot] keyboard refresh failed:", error);
    }
  }

  const send = (ctx: Context, view: View) =>
    ctx.reply(view.text, { reply_markup: view.keyboard });

  /**
   * Feature 30.1 — what a reply-keyboard label opens. Every arm is the same
   * view the inline menu reaches, so the two routes cannot answer differently.
   */
  async function shortcutView(user: BotUser, shortcut: Shortcut): Promise<View> {
    switch (shortcut) {
      case "low":
        return lowView(user.householdId);
      case "expiring":
        return expiringView(user.householdId);
      case "shopping":
        return groupListView(user.householdId);
      case "home":
        return homeView(user.name);
    }
  }

  bot.command("menu", (ctx) =>
    withUser(ctx, (user) => send(ctx, homeView(user.name)).then(() => {})),
  );
  bot.command("list", (ctx) =>
    withUser(ctx, async (user) => {
      await send(ctx, await groupListView(user.householdId));
    }),
  );
  bot.command("low", (ctx) =>
    withUser(ctx, async (user) => {
      await send(ctx, await lowView(user.householdId));
    }),
  );
  bot.command("expiring", (ctx) =>
    withUser(ctx, async (user) => {
      await send(ctx, await expiringView(user.householdId));
    }),
  );

  bot.command("cancel", (ctx) =>
    withUser(ctx, async (user) => {
      await clearPending(user.chatId);
      await send(ctx, homeView(user.name));
    }),
  );

  bot.command("add", (ctx) =>
    withUser(ctx, async (user) => {
      await setPending(user.chatId, { kind: "stockItem", take: false });
      await ctx.reply("Що додати? Напишіть назву товару (або /cancel).");
    }),
  );

  bot.command("took", (ctx) =>
    withUser(ctx, async (user) => {
      await setPending(user.chatId, { kind: "stockItem", take: true });
      await ctx.reply("Що взяли? Напишіть назву товару (або /cancel).");
    }),
  );

  /**
   * Inline navigation. Stateless — the data is in the button.
   *
   * Screens are EDITED in place rather than appended, so the chat does not
   * fill with stale copies of the same menu.
   */
  bot.on("callback_query:data", (ctx) =>
    withUser(ctx, async (user) => {
      const data = ctx.callbackQuery.data;
      const edit = async (view: View) => {
        await ctx.editMessageText(view.text, { reply_markup: view.keyboard });
      };

      if (data === CB.home) {
        await ctx.answerCallbackQuery();
        await edit(homeView(user.name));
        return;
      }

      if (data === CB.low) {
        await ctx.answerCallbackQuery();
        await edit(await lowView(user.householdId));
        return;
      }

      if (data === CB.expiring) {
        await ctx.answerCallbackQuery();
        await edit(await expiringView(user.householdId));
        return;
      }

      if (data === CB.addStock || data === CB.takeStock) {
        const take = data === CB.takeStock;
        await ctx.answerCallbackQuery();
        await setPending(user.chatId, { kind: "stockItem", take });
        await ctx.reply(
          take
            ? "Що взяли? Напишіть назву товару (або /cancel)."
            : "Що додати? Напишіть назву товару (або /cancel).",
        );
        return;
      }

      if (data === CB.groups) {
        await ctx.answerCallbackQuery();
        await edit(await groupListView(user.householdId));
        return;
      }

      if (data === CB.newGroup) {
        await ctx.answerCallbackQuery();
        await setPending(user.chatId, { kind: "newGroup" });
        await ctx.reply("Назва нової групи? (або /cancel)");
        return;
      }

      if (data.startsWith(CB.showGroup)) {
        const view = await groupView(
          user.householdId,
          data.slice(CB.showGroup.length),
        );
        await ctx.answerCallbackQuery();
        if (view) await edit(view);
        return;
      }

      if (data.startsWith(CB.toggleRow)) {
        const groupId = await toggleRow(user, data.slice(CB.toggleRow.length));
        await ctx.answerCallbackQuery(
          groupId ? undefined : { text: "Не знайдено" },
        );
        if (!groupId) return;
        const view = await groupView(user.householdId, groupId);
        if (view) await edit(view);
        return;
      }

      if (data.startsWith(CB.addRow)) {
        const groupId = data.slice(CB.addRow.length);
        await ctx.answerCallbackQuery();
        await setPending(user.chatId, {
          kind: "addRow",
          groupId: groupId === "__default__" ? null : groupId,
        });
        await ctx.reply("Що додати? Напишіть назву (або /cancel).");
        return;
      }

      await ctx.answerCallbackQuery();
    }),
  );

  /** The one reply-keyboard button, and the free-text steps of the flows. */
  bot.on("message:text", (ctx) =>
    withUser(ctx, async (user) => {
      const text = ctx.message.text.trim();

      /**
       * Feature 30.1 — a reply-keyboard tap arrives as ordinary text, so it
       * has to be recognised before anything else reads the message. It also
       * ENDS whatever flow was in progress: the tap is a navigation, and
       * leaving `pending` set would make the next thing typed disappear into
       * a half-finished /add nobody remembers starting.
       */
      const shortcut = shortcutFor(text);
      if (shortcut) {
        await clearPending(user.chatId);
        await send(ctx, await shortcutView(user, shortcut));
        return;
      }

      if (text.startsWith("/")) {
        await ctx.reply(MESSAGES["bot.unknownCommand"], {
          reply_markup: backHome(),
        });
        return;
      }

      const pending = await getPending(user.chatId);
      if (!pending) {
        await send(ctx, homeView(user.name));
        return;
      }

      if (pending.kind === "newGroup") {
        const groupId = await createGroup(user, text);
        await clearPending(user.chatId);
        if (!groupId) {
          await ctx.reply(MESSAGES["shoppingGroup.nameRequired"]);
          return;
        }
        const view = await groupView(user.householdId, groupId);
        if (view) await send(ctx, view);
        return;
      }

      if (pending.kind === "addRow") {
        const target = pending.groupId ?? "__default__";
        const ok = await addRow(user, target, text);
        await clearPending(user.chatId);
        if (!ok) {
          await ctx.reply(MESSAGES["shoppingGroup.notFound"]);
          return;
        }
        const view = await groupView(user.householdId, target);
        if (view) await send(ctx, view);
        return;
      }

      if (pending.kind === "stockItem") {
        const items = await getItemViews(user.householdId);
        const needle = text.toLowerCase();
        const matches = items.filter((item) =>
          item.name.toLowerCase().includes(needle),
        );

        if (matches.length === 0) {
          await ctx.reply(
            "Не знайшли такого товару. Спробуйте ще раз або /cancel.",
          );
          return;
        }
        if (matches.length > 1) {
          const names = matches.slice(0, 8).map((item) => `• ${item.name}`);
          await ctx.reply(`Уточніть, будь ласка:\n${names.join("\n")}`);
          return;
        }

        const item = matches[0];
        await setPending(user.chatId, {
          kind: "stockQuantity",
          take: pending.take,
          itemId: item.id,
          itemName: item.name,
        });
        await ctx.reply(`${item.name}. Скільки (${UNIT_SHORT[item.unit]})?`);
        return;
      }

      if (pending.kind === "stockQuantity") {
        const quantity = text.replace(",", ".");

        if (pending.take) {
          const result = await botConsume(user, pending.itemId, quantity);
          await clearPending(user.chatId);
          await ctx.reply(
            result.ok
              ? `Записали: ${pending.itemName} −${quantity}`
              : renderMessage(result.error),
            { reply_markup: backHome() },
          );
          return;
        }

        await setPending(user.chatId, {
          kind: "stockExpiry",
          itemId: pending.itemId,
          itemName: pending.itemName,
          quantity,
        });
        await ctx.reply(
          "До якої дати придатне? Формат РРРР-ММ-ДД, або напишіть «немає».",
        );
        return;
      }

      if (pending.kind === "stockExpiry") {
        const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
        if (!expiresAt && !/^нема/i.test(text)) {
          await ctx.reply("Не зрозумів дату. Формат РРРР-ММ-ДД, або «немає».");
          return;
        }

        const result = await botAddStock(user, pending.itemId, [
          { quantity: pending.quantity, expiresAt },
        ]);
        await clearPending(user.chatId);
        await ctx.reply(
          result.ok
            ? `Додали: ${pending.itemName} +${pending.quantity}`
            : renderMessage(result.error),
          { reply_markup: backHome() },
        );
        return;
      }
    }),
  );

  return bot;
}
