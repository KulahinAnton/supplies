import { webhookCallback } from "grammy";
import { createBot } from "@supplies/bot/bot";
import { webhookVerdict } from "@supplies/bot/webhook-gate";

/**
 * Production webhook (Feature 9). Node runtime: the bot touches Prisma.
 *
 * Telegram echoes the secret token back on every call, so anything without it
 * is rejected before the update is parsed — the URL alone is not a credential.
 * With no secret configured, everything is refused (503) rather than nothing
 * checked; see `bot/webhook-gate.ts`.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const verdict = webhookVerdict({
    token,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    provided: request.headers.get("x-telegram-bot-api-secret-token"),
  });

  if (verdict === "forbidden") return new Response("Forbidden", { status: 403 });
  if (verdict === "unconfigured" || !token) {
    return new Response("Bot not configured", { status: 503 });
  }

  const handler = webhookCallback(createBot(token), "std/http");
  return handler(request);
}
