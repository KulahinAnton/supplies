import { prisma } from "@/lib/prisma";
import { addStock, consume, consumeBatch, type Actor } from "@/lib/stock-service";
import type { QueuedOp, SyncError, SyncOutcome } from "@/lib/offline/operations";
import { inSendOrder } from "@/lib/offline/operations";

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
 */
export async function replayOperations(
  actor: Actor,
  ops: readonly QueuedOp[],
): Promise<SyncOutcome[]> {
  const results: SyncOutcome[] = [];

  for (const op of inSendOrder(ops)) {
    results.push(await replayOne(actor, op));
  }

  return results;
}

async function replayOne(actor: Actor, op: QueuedOp): Promise<SyncOutcome> {
  /**
   * The stored outcome of an earlier attempt wins outright, and that includes
   * failures. Retrying a failed op against different stock could quietly
   * succeed hours later, taking milk the household has since decided is
   * someone else's — the user was already told it did not apply.
   */
  const seen = await prisma.clientOperation.findUnique({
    where: { clientOpId: op.clientOpId },
  });
  if (seen) {
    return {
      clientOpId: op.clientOpId,
      ok: seen.ok,
      error: seen.errorKey
        ? { key: seen.errorKey, params: (seen.errorParams ?? undefined) as SyncError["params"] }
        : undefined,
      duplicate: true,
    };
  }

  const occurredAt = new Date(op.occurredAt);
  const result = await apply(actor, op, occurredAt);
  const error = result.ok ? undefined : result.error;

  /**
   * Recorded AFTER the write and outside its transaction, which is the one
   * place this is not airtight: a crash in the gap leaves the stock changed
   * and the operation unrecorded, so a re-flush would apply it twice.
   *
   * Closing that needs the marker written inside `stock-service`'s own
   * transaction, which means threading an idempotency key through the shared
   * write path for the sake of one caller. The window is milliseconds wide and
   * the failure is visible in the movement log; widening the shared contract
   * to shave it is the worse trade. Revisit if it ever actually bites.
   */
  await prisma.clientOperation.create({
    data: {
      clientOpId: op.clientOpId,
      householdId: actor.householdId,
      userId: actor.userId,
      kind: op.kind,
      ok: result.ok,
      errorKey: error?.key ?? null,
      errorParams: error?.params ?? undefined,
      occurredAt,
    },
  });

  return { clientOpId: op.clientOpId, ok: result.ok, error };
}

function apply(actor: Actor, op: QueuedOp, occurredAt: Date) {
  switch (op.kind) {
    case "addStock":
      return addStock(actor, op.itemId, op.rows, undefined, occurredAt);
    case "consume":
      return consume(actor, op.itemId, op.quantity, undefined, occurredAt);
    case "consumeBatch":
      return consumeBatch(actor, op.batchId, op.quantity, undefined, occurredAt);
  }
}
