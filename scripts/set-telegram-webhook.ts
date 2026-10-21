import "dotenv/config";
import { Bot } from "grammy";
import { registerCommands } from "@supplies/bot/bot";

/**
 * Feature 9 — switch the bot between the deployed app and your machine.
 *
 * Telegram delivers to **one transport at a time**, so these two commands are
 * the switch:
 *
 *   pnpm bot:webhook:set      → the DEPLOYED app handles messages
 *   pnpm bot:webhook:delete   → nothing does, until you run `pnpm bot:dev`
 *   pnpm bot:local            → both of the above in one step
 *
 * The target comes from `TELEGRAM_WEBHOOK_URL`, deliberately separate from
 * `APP_URL`: `APP_URL` is what the running app uses to build reset and invite
 * links and should stay pointed at localhost while you develop. Sharing one
 * variable would mean editing it back and forth every time you switch, which
 * is exactly the friction this avoids.
 *
 * Both paths also publish the command list, so Telegram's "/" menu matches
 * whichever bot is answering.
 */

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set.");
    process.exit(1);
  }

  const bot = new Bot(token);

  if (process.argv.includes("--delete")) {
    await bot.api.deleteWebhook();
    await registerCommands(bot);
    console.log(
      "Webhook removed. The deployed app no longer receives messages —\n" +
        "run `pnpm bot:dev` to handle them on this machine instead.",
    );
    return;
  }

  const url = process.env.TELEGRAM_WEBHOOK_URL;
  if (!url) {
    console.error(
      "TELEGRAM_WEBHOOK_URL is not set — the public HTTPS base URL of the\n" +
        'deployment, e.g. TELEGRAM_WEBHOOK_URL="https://supplies-alpha.vercel.app"',
    );
    process.exit(1);
  }
  if (!url.startsWith("https://")) {
    console.error(
      `TELEGRAM_WEBHOOK_URL must be public HTTPS — Telegram cannot reach ${url}.\n` +
        "For local development run `pnpm bot:local` instead.",
    );
    process.exit(1);
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // Without it, anyone who guesses the URL can post fake updates.
    console.error(
      "TELEGRAM_WEBHOOK_SECRET is not set — refusing to register an\n" +
        "unauthenticated webhook. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
    process.exit(1);
  }

  const endpoint = `${url.replace(/\/$/, "")}/api/telegram`;
  await bot.api.setWebhook(endpoint, {
    secret_token: secret,
    // `callback_query` is what an inline button tap produces (Feature 17.3).
    // Omitting it makes every button silently do nothing — Telegram filters
    // the update out before it ever reaches the webhook.
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await registerCommands(bot);

  console.log(`Webhook set — the DEPLOYED app now handles messages.\n  ${endpoint}`);

  const info = await bot.api.getWebhookInfo();
  console.log(
    `Telegram reports: pending=${info.pending_update_count}` +
      (info.last_error_message ? `, last error: ${info.last_error_message}` : ""),
  );
}

main().catch((error) => {
  console.error("[bot] webhook setup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
