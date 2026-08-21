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

/**
 * When the scheduled digest should land, in **Kyiv local time**.
 *
 * Vercel cron fires in UTC, and Kyiv is UTC+3 in summer and UTC+2 in winter,
 * so no single UTC time is noon all year. `vercel.json` therefore fires at
 * *both* candidate UTC hours (09:00 and 10:00) and this check decides which
 * one is actually noon in Kyiv today — the other becomes a no-op.
 *
 * Change this and you must change `vercel.json` to match.
 */
export const DIGEST_HOUR_KYIV = 12;

/** The hour in Kyiv right now, 0–23, DST handled by the runtime's tz data. */
export function kyivHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Kyiv",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

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

    const sent = await sendDigestToHousehold(household.id, today, bot);
    result.messages += sent.messages;
    result.failures += sent.failures;

    // Mark the day even when there was nothing to say, or every run would
    // retry this household all day looking for news.
    await prisma.household.update({
      where: { id: household.id },
      data: { lastDigestOn: today },
    });
    result.households += 1;
  }

  return result;
}

export type HouseholdDigest = {
  /** False when there was nothing worth saying, so nothing was sent. */
  hadNews: boolean;
  /** Linked chats in the household — zero means nobody would have received it. */
  chats: number;
  messages: number;
  failures: number;
};

/**
 * Feature 19.1 — send one household's digest right now.
 *
 * Deliberately does **not** touch `lastDigestOn`. This is the manual path
 * (a button in Settings), and marking the day here would silence the
 * automatic one — the two are meant to run in parallel, not compete.
 */
export async function sendDigestToHousehold(
  householdId: string,
  today: Date,
  existingBot?: Bot,
): Promise<HouseholdDigest> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const bot = existingBot ?? new Bot(token);

  const users = await prisma.user.findMany({
    where: { householdId },
    include: { telegramLink: true },
  });
  const linked = users.filter((user) => user.telegramLink !== null);

  const text = await digestText(householdId, today);
  if (!text) {
    return { hadNews: false, chats: linked.length, messages: 0, failures: 0 };
  }

  let messages = 0;
  let failures = 0;
  for (const user of linked) {
    try {
      await bot.api.sendMessage(Number(user.telegramLink!.chatId), text);
      messages += 1;
    } catch (error) {
      // One blocked chat must not stop the rest of the household.
      failures += 1;
      console.error(`[digest] failed for ${user.name}:`, error);
    }
  }

  return { hadNews: true, chats: linked.length, messages, failures };
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
