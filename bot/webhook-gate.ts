import { timingSafeEqual } from "node:crypto";

/**
 * Feature 9 — whether a webhook call may reach the bot at all.
 *
 * Telegram echoes `TELEGRAM_WEBHOOK_SECRET` in the
 * `x-telegram-bot-api-secret-token` header of every update it delivers, so
 * anything without it did not come from Telegram. The webhook URL is not a
 * credential: a forged update carrying a linked member's chat id would take
 * and add stock as them.
 *
 * **No secret configured means refuse, not accept.** The route used to check
 * the header only when the variable was set, so a deployment missing it took
 * unsigned updates from anyone. `GET /api/cron/digest` already failed closed on
 * a missing `CRON_SECRET`; this is the same posture. `pnpm bot:webhook:set`
 * refuses to register a webhook without a secret, so a correctly set-up
 * deployment never sees `unconfigured`.
 */
export type WebhookVerdict = "ok" | "unconfigured" | "forbidden";

export function webhookVerdict(input: {
  token: string | undefined;
  secret: string | undefined;
  provided: string | null;
}): WebhookVerdict {
  if (!input.token || !input.secret) return "unconfigured";
  if (input.provided === null) return "forbidden";

  // Constant-time, so the comparison cannot be timed one byte at a time.
  // `timingSafeEqual` throws on unequal lengths, and a length mismatch is a
  // refusal anyway.
  const expected = Buffer.from(input.secret);
  const actual = Buffer.from(input.provided);
  if (expected.length !== actual.length) return "forbidden";
  return timingSafeEqual(expected, actual) ? "ok" : "forbidden";
}
