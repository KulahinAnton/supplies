import { Bot, type Context } from "grammy";
import { prisma } from "@/lib/prisma";
import { MESSAGES, renderMessage } from "@/lib/messages";
import { verifyLinkToken } from "@/lib/telegram-link";
import { todayUTC } from "@/lib/period";
import {
  formatExpiryRelative,
  formatQuantityWithUnit,
  UNIT_SHORT,
} from "@/lib/format";
import { getItemViews, getShoppingView } from "@/lib/queries";
import { needsAttention } from "@/lib/expiry";
import { needsRestock } from "@/lib/stock";
import { botConsume, botAddStock } from "@/bot/actions";
import { clearState, getState, setState } from "@/bot/state";
import { resolveChat, type BotUser } from "@/bot/auth";

/**
 * Feature 9 — the bot is a SECOND FRONT END, never a second implementation.
 * Every read goes through lib/queries.ts and every write through bot/actions.ts,
 * which calls the same engine the web UI does. If the two ever disagree about
 * what "low" means, this file is doing something it should not.
 */

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

    await ctx.reply(renderMessage({ key: "bot.linked", params: { name: user.name } }));
  });

  /** Everything below this point requires a linked chat. */
  async function withUser(ctx: Context, work: (user: BotUser) => Promise<void>) {
    const user = await resolveChat(ctx.chat?.id);
    if (!user) {
      await ctx.reply(MESSAGES["bot.notLinked"]);
      return;
    }
    await work(user);
  }

  bot.command("low", (ctx) =>
    withUser(ctx, async (user) => {
      const items = (await getItemViews(user.householdId)).filter((item) =>
        needsRestock(item.stock),
      );
      if (items.length === 0) {
        await ctx.reply(MESSAGES["bot.nothingLow"]);
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
      await ctx.reply(`Закінчується:\n${lines.join("\n")}`);
    }),
  );

  bot.command("expiring", (ctx) =>
    withUser(ctx, async (user) => {
      const today = todayUTC();
      const items = (await getItemViews(user.householdId)).filter((item) =>
        needsAttention(item.expiry),
      );
      if (items.length === 0) {
        await ctx.reply(MESSAGES["bot.nothingExpiring"]);
        return;
      }
      const lines = items.map(
        (item) =>
          `• ${item.name} — ${
            item.nextExpiry ? formatExpiryRelative(item.nextExpiry, today) : "—"
          }`,
      );
      await ctx.reply(`Псується:\n${lines.join("\n")}`);
    }),
  );

  bot.command("list", (ctx) =>
    withUser(ctx, async (user) => {
      const { rows } = await getShoppingView(user.householdId);
      const open = rows.filter((row) => !row.isChecked);
      if (open.length === 0) {
        await ctx.reply(MESSAGES["bot.listEmpty"]);
        return;
      }
      const lines = open.map(
        (row) => `• ${row.item?.name ?? row.freeText ?? "—"}`,
      );
      await ctx.reply(`Купити:\n${lines.join("\n")}`);
    }),
  );

  bot.command("cancel", (ctx) =>
    withUser(ctx, async (user) => {
      clearState(user.chatId);
      await ctx.reply(MESSAGES["bot.cancelled"]);
    }),
  );

  bot.command("add", (ctx) =>
    withUser(ctx, async (user) => {
      setState(user.chatId, { kind: "add", step: "item" });
      await ctx.reply("Що додати? Напишіть назву товару (або /cancel).");
    }),
  );

  bot.command("took", (ctx) =>
    withUser(ctx, async (user) => {
      setState(user.chatId, { kind: "take", step: "item" });
      await ctx.reply("Що взяли? Напишіть назву товару (або /cancel).");
    }),
  );

  /** Free-text steps of the /add and /took conversations. */
  bot.on("message:text", (ctx) =>
    withUser(ctx, async (user) => {
      const text = ctx.message.text.trim();
      if (text.startsWith("/")) {
        await ctx.reply(MESSAGES["bot.unknownCommand"]);
        return;
      }

      const state = getState(user.chatId);
      if (!state) {
        await ctx.reply(
          "Команди: /low, /expiring, /list, /add, /took, /cancel",
        );
        return;
      }

      if (state.step === "item") {
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
        setState(user.chatId, {
          kind: state.kind,
          step: "quantity",
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
        });
        await ctx.reply(
          `${item.name}. Скільки (${UNIT_SHORT[item.unit]})?`,
        );
        return;
      }

      if (state.step === "quantity" && state.itemId) {
        const quantity = text.replace(",", ".");

        if (state.kind === "take") {
          const result = await botConsume(user, state.itemId, quantity);
          clearState(user.chatId);
          await ctx.reply(
            result.ok
              ? `Записали: ${state.itemName} −${quantity}`
              : renderMessage(result.error),
          );
          return;
        }

        setState(user.chatId, { ...state, step: "expiry", quantity });
        await ctx.reply(
          "До якої дати придатне? Формат РРРР-ММ-ДД, або напишіть «немає».",
        );
        return;
      }

      if (state.step === "expiry" && state.itemId && state.quantity) {
        const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
        if (!expiresAt && !/^нема/i.test(text)) {
          await ctx.reply("Не зрозумів дату. Формат РРРР-ММ-ДД, або «немає».");
          return;
        }

        const result = await botAddStock(user, state.itemId, [
          { quantity: state.quantity, expiresAt },
        ]);
        clearState(user.chatId);
        await ctx.reply(
          result.ok
            ? `Додали: ${state.itemName} +${state.quantity}`
            : renderMessage(result.error),
        );
        return;
      }

      await ctx.reply(MESSAGES["error.unexpected"]);
      clearState(user.chatId);
    }),
  );

  return bot;
}
