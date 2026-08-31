"use client";

import type { ActionResult } from "@/lib/action-result";
import {
  MAX_OPS_PER_FLUSH,
  summariseSync,
  type QueuedOp,
  type SyncResponse,
} from "@/lib/offline/operations";
import {
  enqueue,
  listPending,
  markFailed,
  removeOps,
  toOperation,
} from "@/lib/offline/outbox";

/**
 * Feature 31 — running a write that may have to wait.
 *
 * The rule: **try the server first, queue only on a network failure.** Trusting
 * `navigator.onLine` alone would queue writes on a connection that works
 * (it reports the adapter, not the internet) and, worse, would skip the
 * server's answer — which is the only thing that knows whether there is enough
 * milk to take.
 *
 * A rejected write is NOT queued. A shortfall or an archived item is a real
 * answer; putting it in the outbox would turn a clear refusal into a change
 * the user believes happened.
 */
export async function submitOrQueue<T>(
  op: QueuedOp,
  send: () => Promise<ActionResult<T>>,
): Promise<{ applied: boolean; result?: ActionResult<T> }> {
  try {
    const result = await send();
    return { applied: true, result };
  } catch {
    /**
     * A thrown server action means the request never got an answer — no
     * network, or the server never replied. That is exactly the case the
     * outbox is for. A rule violation does not arrive this way: actions
     * return `ActionResult`, they do not throw.
     */
    await enqueue(op);
    return { applied: false };
  }
}

export type FlushOutcome = {
  attempted: number;
  applied: number;
  failed: number;
  /** True when the session is gone: the queue is kept and the user told. */
  unauthorized?: boolean;
};

/**
 * Send everything queued, oldest first.
 *
 * Applied operations leave the outbox. Refused ones stay, marked, so the user
 * can see what did not happen and decide — retrying a shortfall on a timer
 * would just fail forever, quietly.
 */
export async function flushOutbox(): Promise<FlushOutcome> {
  const pending = await listPending();
  if (pending.length === 0) return { attempted: 0, applied: 0, failed: 0 };

  const batch = pending.slice(0, MAX_OPS_PER_FLUSH);
  const ops = batch.map(toOperation);

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ops }),
  });

  if (response.status === 401) {
    return { attempted: batch.length, applied: 0, failed: 0, unauthorized: true };
  }
  if (!response.ok) throw new Error(`sync failed: ${response.status}`);

  const { results } = (await response.json()) as SyncResponse;

  await removeOps(results.filter((r) => r.ok).map((r) => r.clientOpId));
  for (const result of results.filter((r) => !r.ok)) {
    await markFailed(result.clientOpId, result.error);
  }

  const { applied, failed } = summariseSync(results);
  return { attempted: batch.length, applied, failed };
}
