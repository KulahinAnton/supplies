import { prisma } from "@/lib/prisma";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { isMessageKey, ruleMessage } from "@/lib/messages";
import type { Actor } from "@/lib/stock-service";
import type { QueuedOpKind, SyncError } from "@/lib/offline/operations";

/**
 * Feature 31 — apply a stock write at most once, whichever route it arrives by.
 *
 * The same operation can reach the server twice by design. A phone that loses
 * signal mid-flush re-sends its queue; and a request that took longer than the
 * client would wait is queued as unanswered while the server may still be
 * applying it. Both are ordinary on a mobile connection, and both cost the
 * household real stock if the second copy is applied.
 *
 * So `clientOpId` is checked and recorded here, and BOTH routes go through it:
 * the server action the browser calls when it has a connection, and the replay
 * of the outbox when it gets one back. Guarding only the replay would have left
 * the client's own timeout free to double-count.
 *
 * The stored outcome is returned as-is, failures included. Re-running a refused
 * operation against different stock could quietly succeed an hour later and
 * take milk the household has since decided is someone else's — the user was
 * already told it did not apply.
 */
export type OperationMeta = {
  clientOpId: string;
  kind: QueuedOpKind;
  /** Device time for a queued write; now for one made with a connection. */
  occurredAt: Date;
};

export type OnceOutcome<T> = {
  result: ActionResult<T>;
  duplicate: boolean;
  error?: SyncError;
};

export async function applyOnce<T>(
  actor: Actor,
  meta: OperationMeta,
  run: () => Promise<ActionResult<T>>,
  /**
   * What `data` to report when a duplicate SUCCEEDED. The real value belongs to
   * the first attempt and is not kept — nothing needs it, and inventing one
   * would be worse than saying plainly that this call created nothing.
   */
  duplicateValue: T,
): Promise<OnceOutcome<T>> {
  const seen = await prisma.clientOperation.findUnique({
    where: { clientOpId: meta.clientOpId },
  });

  if (seen) {
    const error: SyncError | undefined = seen.errorKey
      ? {
          key: seen.errorKey,
          params: (seen.errorParams ?? undefined) as SyncError["params"],
        }
      : undefined;

    return {
      duplicate: true,
      error,
      result: seen.ok
        ? actionOk(duplicateValue)
        : // The key came out of the database and could predate this release.
          actionError(
            error && isMessageKey(error.key)
              ? { key: error.key, params: error.params }
              : ruleMessage("offline.unknownFailure"),
          ),
    };
  }

  const result = await run();
  const error: SyncError | undefined = result.ok ? undefined : result.error;

  /**
   * Written after the stock change and outside its transaction — the one gap
   * left open. A crash in between leaves the write applied and unrecorded, so a
   * retry would apply it twice.
   *
   * Closing it means threading this key into `stock-service`'s own transaction,
   * widening the shared write path for one caller's benefit. The window is
   * milliseconds and the damage is visible in the movement log; that is the
   * better trade until it actually bites.
   */
  await prisma.clientOperation.create({
    data: {
      clientOpId: meta.clientOpId,
      householdId: actor.householdId,
      userId: actor.userId,
      kind: meta.kind,
      ok: result.ok,
      errorKey: error?.key ?? null,
      errorParams: error?.params ?? undefined,
      occurredAt: meta.occurredAt,
    },
  });

  return { result, duplicate: false, error };
}
