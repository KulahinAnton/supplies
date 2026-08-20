import { Bot, Keyboard, type Context } from "grammy";
import { prisma } from "@/lib/prisma";
import { MESSAGES, renderMessage } from "@/lib/messages";
import { verifyLinkToken } from "@/lib/telegram-link";
import { todayUTC } from "@/lib/period";
import {
  formatExpiryRelative,
  formatQuantityWithUnit,
  UNIT_SHORT,
} from "@/lib/format";
import { getItemViews } from "@/lib/queries";
import { needsAttention } from "@/lib/expiry";
import { needsRestock } from "@/lib/stock";
import { botConsume, botAddStock } from "@/bot/actions";
import { clearPending, getPending, setPending } from "@/bot/state";
import { resolveChat, type BotUser } from "@/bot/auth";
import {
  CB,
  addRow,
  createGroup,
  groupListKeyboard,
  groupListText,
  groupView,
  toggleRow,
} from "@/bot/shopping";

/**
 * Feature 9 + 17 — the bot is a SECOND FRONT END, never a second
 * implementation. Every read goes through lib/queries.ts and every write
 * through lib/stock-service.ts or the same rules the web UI uses.
 */

/** Feature 17.2 — the keyboard that stays at the bottom of the chat. */
const BTN = {
  shopping: "🛒 Список покупок",
  low: "📉 Що закінчується",
  expiring: "⏳ Що псується",
} as const;

const mainKeyboard = new Keyboard()
  .text(BTN.shopping)
  .row()
  .text(BTN.low)
  .text(BTN.expiring)
  .resized()
  .persistent();

/**
 * The "/" menu. Published to Telegram rather than only handled, because
 * commands nobody can see may as well not exist.
 */
export const BOT_COMMANDS = [
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
      await ctx.reply(MESSAGES["bot.notLinked"]);
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
      await tx.telegramLink.create({ data: { userId: user.id, chatId } });
    });

    await ctx.reply(
      renderMessage({ key: "bot.linked", params: { name: user.name } }),
      { reply_markup: mainKeyboard },
    );
  });

  /** Everything below requires a linked chat. */
  async function withUser(
    ctx: Context,
    work: (user: BotUser) => Promise<void>,
  ) {
    const user = await resolveChat(ctx.chat?.id);
    if (!user) {
      await ctx.reply(MESSAGES["bot.notLinked"]);
      return;
    }
    await work(user);
  }

  async function sendLow(ctx: Context, user: BotUser) {
    const items = (await getItemViews(user.householdId)).filter((item) =>
      needsRestock(item.stock),
    );
    if (items.length === 0) {
      await ctx.reply(MESSAGES["bot.nothingLow"], { reply_markup: mainKeyboard });
      return;
    }
    const lines = items.map(
      (item) =>
        `• ${item.name} — ${
          item.stock === "OUT"
            ? "закінчився"
            : formatQuantityWithUnit(item.quantity, item.unit)
        }`,
    );
    await ctx.reply(`Закінчується:\n${lines.join("\n")}`, {
      reply_markup: mainKeyboard,
    });
  }

  async function sendExpiring(ctx: Context, user: BotUser) {
    const today = todayUTC();
    const items = (await getItemViews(user.householdId)).filter((item) =>
      needsAttention(item.expiry),
    );
    if (items.length === 0) {
      await ctx.reply(MESSAGES["bot.nothingExpiring"], {
        reply_markup: mainKeyboard,
      });
      return;
    }
    const lines = items.map(
      (item) =>
        `• ${item.name} — ${
          item.nextExpiry ? formatExpiryRelative(item.nextExpiry, today) : "—"
        }`,
    );
    await ctx.reply(`Псується:\n${lines.join("\n")}`, {
      reply_markup: mainKeyboard,
    });
  }

  async function sendGroups(ctx: Context, user: BotUser) {
    await ctx.reply(groupListText(), {
      reply_markup: await groupListKeyboard(user.householdId),
    });
  }

  bot.command("low", (ctx) => withUser(ctx, (user) => sendLow(ctx, user)));
  bot.command("expiring", (ctx) =>
    withUser(ctx, (user) => sendExpiring(ctx, user)),
  );
  bot.command("list", (ctx) => withUser(ctx, (user) => sendGroups(ctx, user)));

  bot.command("cancel", (ctx) =>
    withUser(ctx, async (user) => {
      await clearPending(user.chatId);
      await ctx.reply(MESSAGES["bot.cancelled"], { reply_markup: mainKeyboard });
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

  /** Feature 17.3 — inline navigation. Stateless: the data is in the button. */
  bot.on("callback_query:data", (ctx) =>
    withUser(ctx, async (user) => {
      const data = ctx.callbackQuery.data;

      if (data === CB.groups) {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(groupListText(), {
          reply_markup: await groupListKeyboard(user.householdId),
        });
        return;
      }

      if (data === CB.newGroup) {
        await ctx.answerCallbackQuery();
        await setPending(user.chatId, { kind: "newGroup" });
        await ctx.reply("Назва нової групи? (або /cancel)");
        return;
      }

      if (data.startsWith(CB.showGroup)) {
        const view = await groupView(user.householdId, data.slice(CB.showGroup.length));
        await ctx.answerCallbackQuery();
        if (!view) return;
        await ctx.editMessageText(view.text, { reply_markup: view.keyboard });
        return;
      }

      if (data.startsWith(CB.toggleRow)) {
        const groupId = await toggleRow(user, data.slice(CB.toggleRow.length));
        await ctx.answerCallbackQuery(groupId ? undefined : { text: "Не знайдено" });
        if (!groupId) return;
        // Edit in place — a new message per tick would bury the list.
        const view = await groupView(user.householdId, groupId);
        if (view) await ctx.editMessageText(view.text, { reply_markup: view.keyboard });
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

  /** Keyboard taps and the free-text steps of the multi-step flows. */
  bot.on("message:text", (ctx) =>
    withUser(ctx, async (user) => {
      const text = ctx.message.text.trim();

      if (text === BTN.shopping) return sendGroups(ctx, user);
      if (text === BTN.low) return sendLow(ctx, user);
      if (text === BTN.expiring) return sendExpiring(ctx, user);

      if (text.startsWith("/")) {
        await ctx.reply(MESSAGES["bot.unknownCommand"], {
          reply_markup: mainKeyboard,
        });
        return;
      }

      const pending = await getPending(user.chatId);
      if (!pending) {
        await ctx.reply("Скористайтеся кнопками нижче або /help.", {
          reply_markup: mainKeyboard,
        });
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
        if (view) await ctx.reply(view.text, { reply_markup: view.keyboard });
        return;
      }

      if (pending.kind === "addRow") {
        const ok = await addRow(user, pending.groupId ?? "__default__", text);
        await clearPending(user.chatId);
        if (!ok) {
          await ctx.reply(MESSAGES["shoppingGroup.notFound"]);
          return;
        }
        const view = await groupView(
          user.householdId,
          pending.groupId ?? "__default__",
        );
        if (view) await ctx.reply(view.text, { reply_markup: view.keyboard });
        return;
      }

      if (pending.kind === "stockItem") {
        const items = await getItemViews(user.householdId);
        const needle = text.toLowerCase();
        const matches = items.filter((item) =>
          item.name.toLowerCase().includes(needle),
        );

        if (matches.length === 0) {
          await ctx.reply("Не знайшли такого товару. Спробуйте ще раз або /cancel.");
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
            { reply_markup: mainKeyboard },
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
          { reply_markup: mainKeyboard },
        );
        return;
      }
    }),
  );

  return bot;
}
