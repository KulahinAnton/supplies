import { z } from "zod";
import { key } from "@/lib/validation/shared";
import { batchRowSchema } from "@/lib/validation/stock";

/**
 * Feature 31 — what a phone queues while it has no signal.
 *
 * One definition, used by both ends: the client validates before queueing so a
 * malformed op never sits in the outbox poisoning every flush, and the server
 * validates again because a queue that crossed a network is input like any
 * other.
 *
 * **These record an intent, not a result.** The phone never decides which
 * batch was drawn — FEFO depends on what is in the fridge at apply time, and
 * that is the server's to know, possibly an hour later. `lib/stock.ts`
 * `planConsume` is pure precisely so it can be re-run then.
 *
 * `clientOpId` is a uuid made on the device and is the idempotency key: a
 * flush interrupted mid-way is re-sent whole, and without it the household
 * loses the same stock twice. `occurredAt` is device time, so the movement log
 * says when someone took the milk rather than when their signal came back.
 */

const opBase = {
  clientOpId: z.string().uuid(),
  occurredAt: z.string().datetime(),
};

export const queuedOpSchema = z.discriminatedUnion("kind", [
  z.object({
    ...opBase,
    kind: z.literal("addStock"),
    itemId: z.string().min(1, key("item.notFound")),
    rows: z.array(batchRowSchema).min(1, key("batch.rowsRequired")),
  }),
  z.object({
    ...opBase,
    kind: z.literal("consume"),
    itemId: z.string().min(1, key("item.notFound")),
    quantity: z.string().min(1),
  }),
  z.object({
    ...opBase,
    kind: z.literal("consumeBatch"),
    batchId: z.string().min(1, key("stock.batchNotFound")),
    quantity: z.string().min(1),
  }),
]);

export type QueuedOp = z.infer<typeof queuedOpSchema>;
export type QueuedOpKind = QueuedOp["kind"];

/**
 * A flush is capped. An outbox this long means something is wrong — a device
 * offline for weeks, or a bug queueing in a loop — and the honest response is
 * to apply what fits and let the next flush take the rest, not to hand the
 * database an unbounded batch.
 */
export const MAX_OPS_PER_FLUSH = 100;

export const syncRequestSchema = z.object({
  ops: z.array(queuedOpSchema).max(MAX_OPS_PER_FLUSH),
});

/**
 * The key AND its params. Sending the key alone was a bug worth naming: the
 * shortfall message is "Не вистачає {missing} — доступно лише {available}",
 * and the numbers are the whole point of it. The server still never formats —
 * the client renders, exactly as lib/messages.ts requires.
 */
export type SyncError = {
  key: string;
  params?: Record<string, string | number>;
};

export type SyncOutcome = {
  clientOpId: string;
  ok: boolean;
  error?: SyncError;
  /** True when this op had already been applied and the stored result stands. */
  duplicate?: boolean;
};

export type SyncResponse = { results: SyncOutcome[] };

/**
 * What the user is told after a flush, as counts. Pure so the wording can be
 * tested without a database or a browser.
 */
export function summariseSync(results: readonly SyncOutcome[]): {
  applied: number;
  failed: number;
} {
  let applied = 0;
  let failed = 0;
  for (const result of results) {
    // A duplicate is not news: it was already counted the first time it was
    // applied, and reporting it again would inflate what the user is told.
    if (result.duplicate) continue;
    if (result.ok) applied += 1;
    else failed += 1;
  }
  return { applied, failed };
}

/** Oldest first — the order they were done in is the order they must apply. */
export function inSendOrder(ops: readonly QueuedOp[]): QueuedOp[] {
  return [...ops].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
