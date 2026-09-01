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
 * How long to wait for the server before deciding the request is not coming.
 *
 * Generous on purpose: a slow reply is not a failed one, and giving up early
 * on a working connection queues work the server was about to accept. Twelve
 * seconds is longer than any of these writes takes and shorter than anyone
 * will stand watching a spinner.
 */
const ATTEMPT_TIMEOUT_MS = 12_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Feature 31 — running a write that may have to wait.
 *
 * **When the browser says there is no network, queue without asking.** Reported
 * from a phone in airplane mode: the take hung and nothing happened. Calling a
 * server action with no connection does not reliably reject — the request can
 * sit unresolved — and this waited on it forever, so the button span and the
 * work was never queued at all.
 *
 * `navigator.onLine === false` is the one direction of that flag worth
 * trusting. False means no interface, so there is nothing to ask; TRUE means
 * only that an adapter exists, which is why a connection that reports online
 * and goes nowhere still has to be handled — by the timeout below rather than
 * by believing the flag.
 *
 * When there IS a connection, the server is asked first and its answer wins.
 * It is the only thing that knows whether there is enough milk to take, and a
 * shortfall must reach the user as a refusal rather than being queued as a
 * change they believe happened.
 */
export async function submitOrQueue<T>(
  op: QueuedOp,
  send: () => Promise<ActionResult<T>>,
): Promise<{ applied: boolean; result?: ActionResult<T> }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueue(op);
    return { applied: false };
  }

  try {
    const result = await withTimeout(send(), ATTEMPT_TIMEOUT_MS);
    return { applied: true, result };
  } catch {
    /**
     * Either the request never got an answer, or it took longer than anyone
     * will wait. Both are the outbox's case.
     *
     * A timeout is the awkward one: the server may yet apply it, and then the
     * queued copy would apply it a second time. It cannot — the action carries
     * the same `clientOpId` the queue does, so whichever arrives second is
     * recognised and ignored. A rule violation never lands here: actions
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
