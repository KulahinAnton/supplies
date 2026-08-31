import { prisma } from "@/lib/prisma";

/**
 * Feature 17.4 — the chat's half-finished flow.
 *
 * This used to be a module-level `Map`, which was defensible while the bot ran
 * as one long-polling process. On Vercel it is wrong: each webhook call may
 * hit a fresh serverless instance, so the Map is empty by the time the user's
 * next message arrives and a multi-step `/add` silently forgets itself.
 *
 * `TelegramLink.pending` is durable, scoped to the chat, and disappears with
 * the link. It holds one short string; anything richer belongs in real tables.
 *
 * Where state can be avoided it is: inline buttons carry what they need in
 * their callback data, so browsing groups and ticking rows needs no memory.
 */

export type Pending =
  /** Waiting for the name of a row to add to this group (null = default). */
  | { kind: "addRow"; groupId: string | null }
  /** Waiting for the name of a new shopping group. */
  | { kind: "newGroup" }
  /** Waiting for an item name, then a quantity (the /add and /took flows). */
  | { kind: "stockItem"; take: boolean }
  | { kind: "stockQuantity"; take: boolean; itemId: string; itemName: string }
  | { kind: "stockExpiry"; itemId: string; itemName: string; quantity: string };

/** Serialised compactly — this is one column, not a document store. */
function encode(pending: Pending): string {
  return JSON.stringify(pending);
}

function decode(raw: string | null): Pending | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "kind" in parsed) {
      return parsed as Pending;
    }
    return null;
  } catch {
    // A malformed value is not worth an error; treat the chat as idle.
    return null;
  }
}

export async function getPending(chatId: number): Promise<Pending | null> {
  const link = await prisma.telegramLink.findUnique({
    where: { chatId: BigInt(chatId) },
    select: { pending: true },
  });
  return decode(link?.pending ?? null);
}

export async function setPending(
  chatId: number,
  pending: Pending,
): Promise<void> {
  await prisma.telegramLink.update({
    where: { chatId: BigInt(chatId) },
    data: { pending: encode(pending) },
  });
}

export async function clearPending(chatId: number): Promise<void> {
  await prisma.telegramLink.updateMany({
    where: { chatId: BigInt(chatId), pending: { not: null } },
    data: { pending: null },
  });
}

/**
 * Feature 30.3 — which keyboard this chat has actually been sent.
 *
 * A reply keyboard reaches a Telegram client only on a message, so changing
 * the keyboard in code changes nothing for anyone already linked. Twice now
 * that has shipped as a bug: Feature 17.5 left old chats with labels the bot
 * had stopped answering, and Feature 30.2's `is_persistent` left them with a
 * keyboard that swallows the Android back button. Both needed a message
 * nobody was going to send.
 *
 * So the chat records what it was sent, and anything the bot sends can settle
 * the debt — the next interaction, or the daily digest, whichever comes first.
 * Nobody has to type `/start`, and no broadcast is needed: a chat that never
 * comes back is a chat that never sees the keyboard anyway.
 */
export async function keyboardVersionOf(chatId: number): Promise<number> {
  const link = await prisma.telegramLink.findUnique({
    where: { chatId: BigInt(chatId) },
    select: { keyboardVersion: true },
  });
  return link?.keyboardVersion ?? 0;
}

/**
 * Records that this chat now HAS the given keyboard. Call it only after the
 * message carrying that keyboard was accepted by Telegram — marking it first
 * would let one failed send silence the debt for good.
 */
export async function markKeyboardSent(
  chatId: bigint,
  version: number,
): Promise<void> {
  await prisma.telegramLink.updateMany({
    where: { chatId, keyboardVersion: { lt: version } },
    data: { keyboardVersion: version },
  });
}
