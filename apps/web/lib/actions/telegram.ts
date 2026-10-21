"use server";

import { requireSession } from "@/lib/auth-guard";
import type { ActionResult } from "@supplies/core/action-result";
import { createTelegramLink } from "@supplies/db/telegram-service";
import { sendDigestNow } from "@supplies/bot/digest-now";

/**
 * Session guard and this process's environment, nothing else.
 *
 * Feature 9's link token lives in `@supplies/db/telegram-service` and Feature
 * 19.1's send in `@supplies/bot/digest-now`, because the API serves the same
 * two buttons to the SPA. The environment is read here rather than in either
 * of them: the Next app and the API are separate processes with their own
 * variables, and a service that reaches for `process.env` is a service that
 * cannot be told which one it is running in.
 */

export async function createTelegramLinkAction(): Promise<
  ActionResult<{ url: string }>
> {
  const session = await requireSession();
  return createTelegramLink(session, {
    authSecret: process.env.AUTH_SECRET,
    botUsername: process.env.TELEGRAM_BOT_USERNAME,
  });
}

export async function sendDigestNowAction(): Promise<
  ActionResult<{ chats: number; messages: number; hadNews: boolean }>
> {
  const session = await requireSession();
  return sendDigestNow(session.householdId, process.env.TELEGRAM_BOT_TOKEN);
}
