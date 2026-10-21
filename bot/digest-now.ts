import { actionError, actionOk, type ActionResult } from "../packages/core/src/action-result";
import { ruleMessage } from "../packages/core/src/messages";
import { todayUTC } from "../packages/core/src/period";
import { sendDigestToHousehold } from "./digest";

/**
 * Feature 19.1 — send the digest to the household's chats right now.
 *
 * Same content the daily cron sends, on demand. It deliberately does not mark
 * the day as done, so the automatic digest still arrives on schedule: the two
 * paths run in parallel rather than cancelling each other.
 *
 * It lives in `bot/` rather than `packages/db` because it needs
 * `./digest`, and `bot` already depends on `packages/db` — putting it there
 * would be a cycle. This is also its natural home: it is the bot's own
 * message, sent early.
 */
export async function sendDigestNow(
  householdId: string,
  botToken: string | undefined,
): Promise<ActionResult<{ chats: number; messages: number; hadNews: boolean }>> {
  if (!botToken) return actionError(ruleMessage("digest.botNotConfigured"));

  try {
    const result = await sendDigestToHousehold(householdId, todayUTC());
    if (result.chats === 0) return actionError(ruleMessage("digest.noChats"));

    return actionOk({
      chats: result.chats,
      messages: result.messages,
      hadNews: result.hadNews,
    });
  } catch (error) {
    // Telegram being unreachable is not the caller's fault and not something
    // they can act on beyond trying again, so the log carries the detail and
    // the user gets one sentence.
    console.error("[digest] manual send failed:", error);
    return actionError(ruleMessage("digest.failed"));
  }
}
