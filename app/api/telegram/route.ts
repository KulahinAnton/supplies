import { webhookCallback } from "grammy";
import { createBot } from "@/bot/bot";

/**
 * Production webhook (Feature 9). Node runtime: the bot touches Prisma.
 *
 * Telegram echoes the secret token back on every call, so anything without it
 * is rejected before the update is parsed — the URL alone is not a credential.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) return new Response("Bot not configured", { status: 503 });

  if (secret) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== secret) return new Response("Forbidden", { status: 403 });
  }

  const handler = webhookCallback(createBot(token), "std/http");
  return handler(request);
}
