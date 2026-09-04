"use server";

import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import { ruleMessage } from "@supplies/core/messages";
import { createLinkToken } from "@supplies/core/telegram-link";
import { sendDigestToHousehold } from "@/lib/digest";
import { todayUTC } from "@supplies/core/period";

/**
 * Feature 9 — hand out a short-lived deep link that binds a Telegram chat to
 * this user. The token is a signed triple (lib/telegram-link.ts), so there is
 * no table to clean up and nothing to leak if the link is shared: it expires
 * in 15 minutes.
 */
export async function createTelegramLinkAction(): Promise<
  ActionResult<{ url: string }>
> {
  const session = await requireSession();

  const secret = process.env.AUTH_SECRET;
  const botName = process.env.TELEGRAM_BOT_USERNAME;
  if (!secret || !botName) {
    return actionError(ruleMessage("error.unexpected"));
  }

  const token = createLinkToken(session.userId, secret);
  if (!token) return actionError(ruleMessage("error.unexpected"));

  // The token is built to fit Telegram's 64-character start-param limit; see
  // lib/telegram-link.ts. Encoding it is belt and braces - it is already
  // restricted to base64url characters.
  return actionOk({
    url: `https://t.me/${botName}?start=${encodeURIComponent(token)}`,
  });
}

/**
 * Feature 19.1 — send the digest to the household's chats right now.
 *
 * Same content the daily cron sends, on demand. It does not mark the day as
 * done, so the automatic digest still arrives on schedule — the two paths run
 * in parallel rather than cancelling each other.
 */
export async function sendDigestNowAction(): Promise<
  ActionResult<{ chats: number; messages: number; hadNews: boolean }>
> {
  const session = await requireSession();

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return actionError(ruleMessage("digest.botNotConfigured"));
  }

  try {
    const result = await sendDigestToHousehold(session.householdId, todayUTC());
    if (result.chats === 0) {
      return actionError(ruleMessage("digest.noChats"));
    }
    return actionOk({
      chats: result.chats,
      messages: result.messages,
      hadNews: result.hadNews,
    });
  } catch (error) {
    console.error("[digest] manual send failed:", error);
    return actionError(ruleMessage("digest.failed"));
  }
}
