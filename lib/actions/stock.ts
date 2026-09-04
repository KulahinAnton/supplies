"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { planCorrection, planDiscard } from "@/lib/stock";
import {
  addStock,
  consume,
  consumeBatch,
  withStockRetry,
  writeBatchQuantity,
} from "@/lib/stock-service";
import {
  addStockSchema,
  consumeBatchSchema,
  consumeSchema,
  correctionSchema,
  discardSchema,
} from "@/lib/validation/stock";
import { firstIssueAsRuleMessage } from "@/lib/validation/shared";

/**
 * Server actions = session guard + input validation + cache invalidation.
 * The rules and the writes live in lib/stock-service.ts, which the Telegram
 * bot calls too — see PROJECT_PROMPT.md Feature 9.
 */

function refresh(itemId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/items");
  revalidatePath("/shopping");
  if (itemId) revalidatePath(`/items/${itemId}`);
}

/** Feature 4 — multi-batch add: one submit, N batches, one transaction. */
export async function addStockAction(
  input: unknown,
): Promise<ActionResult<{ batchIds: string[] }>> {
  const session = await requireSession();
  const parsed = addStockSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const result = await addStock(
    session,
    parsed.data.itemId,
    parsed.data.rows,
    parsed.data.note,
  );

  if (result.ok) refresh(parsed.data.itemId);
  return result;
}

/** Feature 4 — consume. All-or-nothing FEFO draw-down (§3.3). */
export async function consumeAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = consumeSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const result = await consume(
    session,
    parsed.data.itemId,
    parsed.data.quantity,
    parsed.data.note,
  );

  if (result.ok) refresh(parsed.data.itemId);
  return result;
}

/**
 * Feature 4 — discard. The ONLY way expired stock leaves, which is what lets
 * FEFO skip expired batches without them piling up invisibly.
 */
/**
 * Feature 24 — consume a specific batch, including an expired one.
 *
 * The item-level "take" is FEFO and skips expired stock on purpose. This is
 * the deliberate override: the person is looking at one batch and chose it.
 * It records CONSUME, not WASTE — used and binned are different facts, and
 * the movement log is the only place that distinction survives.
 */
export async function consumeBatchAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = consumeBatchSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const result = await consumeBatch(
    session,
    parsed.data.batchId,
    parsed.data.quantity,
    parsed.data.note,
  );
  if (!result.ok) return result;
  refresh(result.data.itemId);
  return actionOk();
}

export async function discardBatchAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  /**
   * Feature 33 — read, plan and write inside the retry. If someone consumed
   * from this batch first, re-planning records the smaller WASTE that actually
   * happened rather than the amount this request thought was there.
   */
  return withStockRetry(async () => {
    const batch = await prisma.stockBatch.findFirst({
      where: { id: parsed.data.batchId, item: { householdId: session.householdId } },
    });
    if (!batch) return actionError(ruleMessage("stock.batchNotFound"));

    const plan = planDiscard(batch);
    if (!plan.ok) return actionError(plan.error);

    await prisma.$transaction(async (tx) => {
      await writeBatchQuantity(tx, batch.id, batch.quantity, new Prisma.Decimal(0));
      await tx.stockMovement.create({
        data: {
          itemId: batch.itemId,
          batchId: batch.id,
          delta: plan.delta.toFixed(3),
          reason: "WASTE",
          userId: session.userId,
          note: parsed.data.note ?? null,
        },
      });
    });

    refresh(batch.itemId);
    return actionOk();
  });
}

/** Feature 4 — set a batch's absolute quantity, recording the signed delta. */
export async function correctBatchAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  /**
   * Feature 33 — retrying is right here, and the delta is why. A correction is
   * an absolute claim about reality: "there are actually 5". If someone changed
   * the batch in between, the target still stands but the SIGNED DELTA the
   * audit log records does not — re-planning against the current value is what
   * keeps that log truthful.
   */
  return withStockRetry(async () => {
    const batch = await prisma.stockBatch.findFirst({
      where: { id: parsed.data.batchId, item: { householdId: session.householdId } },
    });
    if (!batch) return actionError(ruleMessage("stock.batchNotFound"));

    const target = new Prisma.Decimal(parsed.data.quantity);
    const plan = planCorrection(batch, target);
    if (!plan.ok) return actionError(plan.error);

    // A correction that changes nothing should not litter the audit log.
    if (plan.delta.isZero()) return actionOk();

    await prisma.$transaction(async (tx) => {
      await writeBatchQuantity(tx, batch.id, batch.quantity, target);
      await tx.stockMovement.create({
        data: {
          itemId: batch.itemId,
          batchId: batch.id,
          delta: plan.delta.toFixed(3),
          reason: "CORRECTION",
          userId: session.userId,
          note: parsed.data.note ?? null,
        },
      });
    });

    refresh(batch.itemId);
    return actionOk();
  });
}
