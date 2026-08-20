import "dotenv/config";
import { Bot } from "grammy";
import { prisma } from "@/lib/prisma";
import { getItemViews } from "@/lib/queries";
import { needsAttention } from "@/lib/expiry";
import { needsRestock } from "@/lib/stock";
import { formatExpiryRelative, formatQuantityWithUnit } from "@/lib/format";
import { formatDateKey, todayUTC } from "@/lib/period";

/**
 * Feature 9 — the daily digest. Run it from cron every hour; it picks the
 * households whose `digestHour` has arrived and skips any that already got
 * today's message (`lastDigestOn`), so re-running is harmless.
 *
 * Usage: pnpm digest:run [--force]
 */

const force = process.argv.includes("--force");

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set — nothing to send.");
    process.exit(1);
  }

  const bot = new Bot(token);
  const today = todayUTC();
  const currentHour = new Date().getUTCHours();

  const households = await prisma.household.findMany({
    include: { users: { include: { telegramLink: true } } },
  });

  let sent = 0;

  for (const household of households) {
    if (!force) {
      if (household.digestHour !== currentHour) continue;
      if (
        household.lastDigestOn &&
        formatDateKey(household.lastDigestOn) === formatDateKey(today)
      ) {
        continue;
      }
    }

    const items = await getItemViews(household.id);
    const expiring = items.filter((item) => needsAttention(item.expiry));
    const restock = items.filter((item) => needsRestock(item.stock));

    // Nothing to say is a reason to stay quiet, not to send an empty message.
    if (expiring.length === 0 && restock.length === 0) {
      await prisma.household.update({
        where: { id: household.id },
        data: { lastDigestOn: today },
      });
      continue;
    }

    const parts: string[] = [];
    if (expiring.length > 0) {
      parts.push(
        "Псується:\n" +
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
        "Закінчується:\n" +
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

    const message = parts.join("\n\n");

    for (const user of household.users) {
      if (!user.telegramLink) continue;
      try {
        await bot.api.sendMessage(Number(user.telegramLink.chatId), message);
        sent += 1;
      } catch (error) {
        // One blocked chat must not stop the rest of the household.
        console.error(`Failed to message ${user.name}:`, error);
      }
    }

    await prisma.household.update({
      where: { id: household.id },
      data: { lastDigestOn: today },
    });
  }

  console.log(`Digest done — ${sent} message(s) sent.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
