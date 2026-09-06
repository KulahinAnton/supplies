import "dotenv/config";
import { createBot, registerCommands } from "./bot";

/**
 * Development entry point: long polling on this machine. Production uses the
 * webhook route at app/api/telegram/route.ts instead — see bot/CLAUDE.md.
 *
 * Telegram delivers to one transport at a time, so a webhook registered for
 * the deployment silently starves this process. Rather than sit there looking
 * healthy while messages go elsewhere, it checks first and says what to do.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set — nothing to start.");
  process.exit(1);
}

const bot = createBot(token);

process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());

async function main() {
  const info = await bot.api.getWebhookInfo();
  if (info.url) {
    console.error(
      `A webhook is registered, so Telegram is delivering to the deployment:\n` +
        `  ${info.url}\n\n` +
        "Messages would never reach this process. To take over locally:\n" +
        "  pnpm bot:webhook:delete   (or `pnpm bot:local`, which does both)",
    );
    process.exit(1);
  }

  await registerCommands(bot);
  console.log("Bot starting — THIS MACHINE handles messages (long polling).");
  await bot.start();
}

void main();
