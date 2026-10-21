import type { Actor } from "./stock-service";
import { actionError, actionOk, type ActionResult } from "../../core/src/action-result";
import { ruleMessage } from "../../core/src/messages";
import { createLinkToken } from "../../core/src/telegram-link";

/**
 * Feature 9 — hand out a short-lived deep link that binds a Telegram chat to
 * this user.
 *
 * The token is a signed triple (`@supplies/core/telegram-link`), so there is
 * no table to clean up and nothing to leak if the link is shared: it expires
 * in 15 minutes.
 *
 * **Sending a digest is not here**, deliberately. That needs `bot/digest.ts`,
 * and `bot` already depends on this package — importing it back would be a
 * cycle. It lives in `@supplies/bot/digest-now` instead, which is also where
 * it belongs: it is the bot's message, sent early.
 */
export function createTelegramLink(
  actor: Actor,
  env: { authSecret?: string; botUsername?: string },
): ActionResult<{ url: string }> {
  if (!env.authSecret || !env.botUsername) {
    return actionError(ruleMessage("error.unexpected"));
  }

  const token = createLinkToken(actor.userId, env.authSecret);
  if (!token) return actionError(ruleMessage("error.unexpected"));

  // The token is built to fit Telegram's 64-character start-param limit; see
  // `telegram-link.ts`. Encoding it is belt and braces — it is already
  // restricted to base64url characters.
  return actionOk({
    url: `https://t.me/${env.botUsername}?start=${encodeURIComponent(token)}`,
  });
}
