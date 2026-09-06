import { addStock, consume, type BatchRow } from "../packages/db/src/stock-service";
import type { BotUser } from "./auth";

/**
 * The bot's writes. Thin on purpose: these delegate to lib/stock-service.ts,
 * the same module the server actions use, so a rule fixed once is fixed for
 * both front ends (PROJECT_PROMPT.md Feature 9).
 */

export function botAddStock(user: BotUser, itemId: string, rows: BatchRow[]) {
  return addStock(user, itemId, rows, "Telegram");
}

export function botConsume(user: BotUser, itemId: string, quantity: string) {
  return consume(user, itemId, quantity, "Telegram");
}
