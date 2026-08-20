import "dotenv/config";
import { createBot } from "@/bot/bot";

/**
 * Development entry point: long polling. Production runs the webhook route at
 * app/api/telegram/route.ts instead — see bot/CLAUDE.md.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set — nothing to start.");
  process.exit(1);
}

const bot = createBot(token);

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

console.log("Bot starting (long polling)…");
void bot.start();
