import "dotenv/config";

/**
 * Feature 9 — register (or remove) the production webhook with Telegram.
 *
 *   pnpm bot:webhook:set       point Telegram at APP_URL/api/telegram
 *   pnpm bot:webhook:delete    unregister (back to long polling)
 *
 * Telegram echoes `TELEGRAM_WEBHOOK_SECRET` back on every call in the
 * `x-telegram-bot-api-secret-token` header, and app/api/telegram/route.ts
 * rejects anything without it — so the webhook URL alone is not a credential.
 *
 * The URL must be public HTTPS: Telegram cannot reach localhost. Use long
 * polling (`pnpm bot:dev`) for local development instead.
 */

const remove = process.argv.includes("--delete");

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is not set.");
    process.exit(1);
  }

  const api = `https://api.telegram.org/bot${token}`;

  if (remove) {
    const response = await fetch(`${api}/deleteWebhook`, { method: "POST" });
    const body = await response.json();
    console.log(body.ok ? "Webhook removed." : `Failed: ${body.description}`);
    process.exitCode = body.ok ? 0 : 1;
    return;
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error("APP_URL is not set.");
    process.exit(1);
  }
  if (!appUrl.startsWith("https://")) {
    console.error(
      `APP_URL must be public HTTPS — Telegram cannot reach ${appUrl}.\n` +
        "For local development run the bot with `pnpm bot:dev` (long polling).",
    );
    process.exit(1);
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // Without it, anyone who guesses the URL can post fake updates.
    console.error(
      "TELEGRAM_WEBHOOK_SECRET is not set — refusing to register an " +
        "unauthenticated webhook. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
    process.exit(1);
  }

  const url = `${appUrl.replace(/\/$/, "")}/api/telegram`;
  const response = await fetch(`${api}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });

  const body = await response.json();
  if (!body.ok) {
    console.error(`Failed: ${body.description}`);
    process.exit(1);
  }

  console.log(`Webhook set to ${url}`);

  const info = await (await fetch(`${api}/getWebhookInfo`)).json();
  if (info.ok) {
    console.log(
      `Telegram reports: url=${info.result.url}, ` +
        `pending=${info.result.pending_update_count}` +
        (info.result.last_error_message
          ? `, last error: ${info.result.last_error_message}`
          : ""),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
