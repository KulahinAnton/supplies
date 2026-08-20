import type { Unit } from "@/lib/generated/prisma/enums";

/**
 * In-memory conversation state, keyed by chat id.
 *
 * Deliberately not persisted: a half-finished "/add milk" is worth nothing
 * after a restart, and losing it costs the user one retyped word. Anything
 * that MATTERS is already a row in the database.
 */
export type ConversationState = {
  kind: "add" | "take";
  step: "item" | "quantity" | "expiry";
  itemId?: string;
  itemName?: string;
  unit?: Unit;
  quantity?: string;
};

const states = new Map<number, ConversationState>();

export function getState(chatId: number): ConversationState | undefined {
  return states.get(chatId);
}

export function setState(chatId: number, state: ConversationState): void {
  states.set(chatId, state);
}

export function clearState(chatId: number): void {
  states.delete(chatId);
}
