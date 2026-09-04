import { prisma } from "@/lib/prisma";

/** A Telegram chat resolved to an app user (Feature 9). */
export type BotUser = {
  userId: string;
  householdId: string;
  name: string;
  chatId: number;
  /**
   * Feature 33 — which reply keyboard this chat has been sent (Feature 30.3).
   *
   * Carried here because this query already read the row. Looking it up again
   * downstream was a second identical round trip on every webhook update, and
   * on a serverless bot every round trip is latency the user feels.
   */
  keyboardVersion: number;
};

/**
 * Unlinked chats can do nothing but /start — this is the bot's equivalent of
 * `requireSession()`, and it re-reads the user so a deactivated account loses
 * bot access immediately.
 */
export async function resolveChat(chatId?: number): Promise<BotUser | null> {
  if (chatId === undefined) return null;

  const link = await prisma.telegramLink.findUnique({
    where: { chatId: BigInt(chatId) },
    include: {
      user: {
        select: { id: true, name: true, isActive: true, householdId: true },
      },
    },
  });

  if (!link || !link.user.isActive) return null;

  return {
    userId: link.user.id,
    householdId: link.user.householdId,
    name: link.user.name,
    chatId,
    keyboardVersion: link.keyboardVersion,
  };
}
