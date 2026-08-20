"use server";

import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { createLinkToken } from "@/lib/telegram-link";

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
