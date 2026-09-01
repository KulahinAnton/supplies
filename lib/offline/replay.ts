import { actionOk, type ActionResult } from "@/lib/action-result";
import { addStock, consume, consumeBatch, type Actor } from "@/lib/stock-service";
import type { QueuedOp, SyncOutcome } from "@/lib/offline/operations";
import { inSendOrder } from "@/lib/offline/operations";
import { applyOnce } from "@/lib/offline/idempotency";

/**
 * Feature 31 — apply a phone's queued work.
 *
 * This is a NEW CALLER of `lib/stock-service.ts`, not a new implementation.
 * Every rule the web UI and the bot obey applies here unchanged: FEFO is
 * re-planned against current stock, a shortfall is refused whole, and every
 * batch change writes its movement in the same transaction. That is the whole
 * reason offline writes are affordable in this app.
 *
 * Operations apply **in the order they happened on the device**, and one
 * failure does not stop the rest: taking milk that has since run out must not
 * strand a bread purchase queued after it. Each op reports its own outcome.
 *
 * Applying at most once is `applyOnce`'s job, shared with the server actions —
 * see there for why both routes need it.
 */
export async function replayOperations(
  actor: Actor,
  ops: readonly QueuedOp[],
): Promise<SyncOutcome[]> {
  const results: SyncOutcome[] = [];

  for (const op of inSendOrder(ops)) {
    const occurredAt = new Date(op.occurredAt);
    const outcome = await applyOnce(
      actor,
      { clientOpId: op.clientOpId, kind: op.kind, occurredAt },
      () => apply(actor, op, occurredAt),
      undefined,
    );

    results.push({
      clientOpId: op.clientOpId,
      ok: outcome.result.ok,
      error: outcome.error,
      ...(outcome.duplicate ? { duplicate: true } : {}),
    });
  }

  return results;
}

function apply(
  actor: Actor,
  op: QueuedOp,
  occurredAt: Date,
): Promise<ActionResult<undefined>> {
  switch (op.kind) {
    case "addStock":
      // The batch ids are not reported back; nothing on the phone waits for
      // them, and dropping them keeps every arm of this switch one shape.
      return addStock(actor, op.itemId, op.rows, undefined, occurredAt).then(
        (result) => (result.ok ? actionOk(undefined) : result),
      );
    case "consume":
      return consume(actor, op.itemId, op.quantity, undefined, occurredAt);
    case "consumeBatch":
      // Same again: consumeBatch reports the item it touched, which only the
      // web UI needs so it can refresh that page.
      return consumeBatch(actor, op.batchId, op.quantity, undefined, occurredAt).then(
        (result) => (result.ok ? actionOk(undefined) : result),
      );
  }
}
