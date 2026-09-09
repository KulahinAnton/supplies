import { Bot } from "grammy";
import { prisma } from "../packages/db/src/prisma";
import { getItemViews, getRestockEntries } from "../packages/db/src/queries";
import { pushDigestToHousehold } from "../packages/db/src/push-service";
import { needsAttention, splitExpiring } from "../packages/core/src/expiry";
// Feature 30.3 — the digest is the one message that reaches a chat without
// anyone opening the bot, so it doubles as the keyboard's delivery route.
import { KEYBOARD_VERSION, replyKeyboard } from "./menu";
import { markKeyboardSent } from "./state";

import { formatExpiryLabel, formatQuantityWithUnit } from "../packages/core/src/format";
import { formatDateKey, todayUTC } from "../packages/core/src/period";

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
  /** Feature 35 — phones that got the same reminder as a notification. */
  push: { devices: number; sent: number; failed: number };
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
    return {
      hadNews: false,
      chats: linked.length,
      messages: 0,
      failures: 0,
      push: { devices: 0, sent: 0, failed: 0 },
    };
  }

  let messages = 0;
  let failures = 0;
  for (const user of linked) {
    const chatId = user.telegramLink!.chatId;
    /**
     * Feature 30.3 — the digest carries the keyboard to chats that are behind.
     *
     * This is the message that reaches every linked chat whether or not anyone
     * opens the bot, so it is the one that fixes a keyboard for people who
     * simply use the app and read the daily note. Attaching it costs nothing:
     * the digest is plain text and had no `reply_markup` to give up.
     *
     * Chats already current get no keyboard at all rather than the same one
     * again — resending it is harmless but pointless traffic, and it would
     * reopen a keyboard someone had deliberately collapsed.
     */
    const owed = user.telegramLink!.keyboardVersion < KEYBOARD_VERSION;

    try {
      await bot.api.sendMessage(Number(chatId), text, {
        reply_markup: owed ? replyKeyboard() : undefined,
      });
      messages += 1;
      // Only after Telegram accepted it — see `markKeyboardSent`.
      if (owed) await markKeyboardSent(chatId, KEYBOARD_VERSION);
    } catch (error) {
      // One blocked chat must not stop the rest of the household.
      failures += 1;
      console.error(`[digest] failed for ${user.name}:`, error);
    }
  }

  /**
   * Feature 35 — the same reminder, to the phones.
   *
   * After Telegram rather than instead of it: somebody with both linked wants
   * the reminder wherever they happen to be looking, and the app is not a
   * replacement for the bot any more than the bot is for the app.
   *
   * This function is now the household's daily notification across every
   * channel rather than only the Telegram one, which its file name no longer
   * quite says. Renaming `bot/digest.ts` is a wider change than Feature 35
   * and would move a module three callers import; the name is the thing
   * lagging, not the arrangement.
   */
  const push = await pushDigestToHousehold(householdId, text);

  return { hadNews: true, chats: linked.length, messages, failures, push };
}

/** The message body, or null when there is nothing worth saying. */
export async function digestText(
  householdId: string,
  today: Date,
): Promise<string | null> {
  const items = await getItemViews(householdId);
  const expiring = items.filter((item) => needsAttention(item.expiry));
  // Feature 26 — one line per group, not one per brand inside it.
  const restock = await getRestockEntries(householdId, items);

  if (expiring.length === 0 && restock.length === 0) return null;

  const parts: string[] = [];

  /**
   * Feature 30 — two blocks, not one. In a chat there is no badge to read: the
   * only thing separating "throw this out" from "eat this first" was the tail
   * of each line, and a dozen lines of that is a wall to scan. The heading now
   * says which half you are looking at.
   */
  const { expired, soon } = splitExpiring(expiring);

  if (expired.length > 0) {
    parts.push("❌ Прострочено:\n" + expiryLines(expired, today));
  }

  if (soon.length > 0) {
    parts.push("⏳ Спожити найближчим часом:\n" + expiryLines(soon, today));
  }

  if (restock.length > 0) {
    parts.push(
      "📉 Закінчується:\n" +
        restock
          .map(
            (entry) =>
              `• ${entry.name} — ${
                entry.state === "OUT" || !entry.unit
                  ? "закінчився"
                  : formatQuantityWithUnit(entry.quantity, entry.unit)
              }`,
          )
          .join("\n"),
    );
  }

  return parts.join("\n\n");
}

/**
 * Feature 30 — one bullet per item, shared by both halves of the expiry
 * section. The label carries its own verb («прострочено 3 дні тому» /
 * «спливає завтра»), so the same line works under either heading.
 */
function expiryLines(
  items: readonly { name: string; nextExpiry: Date | null }[],
  today: Date,
): string {
  return items
    .map(
      (item) =>
        `• ${item.name} — ${
          item.nextExpiry ? formatExpiryLabel(item.nextExpiry, today) : "—"
        }`,
    )
    .join("\n");
}
