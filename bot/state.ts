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
