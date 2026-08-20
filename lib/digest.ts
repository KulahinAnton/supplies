import { Bot } from "grammy";
import { prisma } from "@/lib/prisma";
import { getItemViews } from "@/lib/queries";
import { needsAttention } from "@/lib/expiry";
import { needsRestock } from "@/lib/stock";
import { formatExpiryRelative, formatQuantityWithUnit } from "@/lib/format";
import { formatDateKey, todayUTC } from "@/lib/period";

/**
 * Feature 19 — the daily "this is about to go off" message.
 *
 * Called by BOTH `pnpm digest:run` and `GET /api/cron/digest`, because Vercel
 * schedules HTTP endpoints, not commands — and Feature 9 shipped only the
 * command, so the digest never ran in production.
 *
 * `Household.lastDigestOn` makes it safe to call repeatedly: a second run on
 * the same day sends nothing.
 */

export type DigestResult = {
  households: number;
  messages: number;
  failures: number;
};

/**
 * `respectHour` exists because **Vercel's Hobby plan runs cron at most once a
 * day**, so `digestHour` cannot be honoured there — the digest arrives when
 * the cron fires. The CLI can be run hourly and does respect it. Saying so in
 * the signature beats pretending both callers behave alike.
 */
export async function sendDigests(options: {
  respectHour: boolean;
  force?: boolean;
}): Promise<DigestResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const bot = new Bot(token);
  const today = todayUTC();
  const currentHour = new Date().getUTCHours();

  const households = await prisma.household.findMany({
    include: { users: { include: { telegramLink: true } } },
  });

  const result: DigestResult = { households: 0, messages: 0, failures: 0 };

  for (const household of households) {
    if (!options.force) {
      if (options.respectHour && household.digestHour !== currentHour) continue;
      if (
        household.lastDigestOn &&
        formatDateKey(household.lastDigestOn) === formatDateKey(today)
      ) {
        continue;
      }
    }

    const text = await digestText(household.id, today);

    // Nothing to say is a reason to stay quiet, not to send an empty message —
    // but still mark the day, or every run would retry this household.
    if (text) {
      for (const user of household.users) {
        if (!user.telegramLink) continue;
        try {
          await bot.api.sendMessage(Number(user.telegramLink.chatId), text);
          result.messages += 1;
        } catch (error) {
          // One blocked chat must not stop the rest of the household.
          result.failures += 1;
          console.error(`[digest] failed for ${user.name}:`, error);
        }
      }
    }

    await prisma.household.update({
      where: { id: household.id },
      data: { lastDigestOn: today },
    });
    result.households += 1;
  }

  return result;
}

/** The message body, or null when there is nothing worth saying. */
export async function digestText(
  householdId: string,
  today: Date,
): Promise<string | null> {
  const items = await getItemViews(householdId);
  const expiring = items.filter((item) => needsAttention(item.expiry));
  const restock = items.filter((item) => needsRestock(item.stock));

  if (expiring.length === 0 && restock.length === 0) return null;

  const parts: string[] = [];

  if (expiring.length > 0) {
    parts.push(
      "⏳ Псується:\n" +
        expiring
          .map(
            (item) =>
              `• ${item.name} — ${
                item.nextExpiry
                  ? formatExpiryRelative(item.nextExpiry, today)
                  : "—"
              }`,
          )
          .join("\n"),
    );
  }

  if (restock.length > 0) {
    parts.push(
      "📉 Закінчується:\n" +
        restock
          .map(
            (item) =>
              `• ${item.name} — ${
                item.stock === "OUT"
                  ? "закінчився"
                  : formatQuantityWithUnit(item.quantity, item.unit)
              }`,
          )
          .join("\n"),
    );
  }

  return parts.join("\n\n");
}
