"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { planCorrection, planDiscard } from "@/lib/stock";
import { addStock, consume, consumeBatch } from "@/lib/stock-service";
import { applyOnce } from "@/lib/offline/idempotency";
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

  const run = () =>
    addStock(session, parsed.data.itemId, parsed.data.rows, parsed.data.note);

  /**
   * Feature 31 — when the browser sent an operation id, this write goes
   * through the same at-most-once guard the offline replay uses. The client
   * gives up on a slow request and queues it; without this, the server
   * finishing that request a moment later would add the stock twice.
   */
  const result = parsed.data.clientOpId
    ? (
        await applyOnce(
          session,
          {
            clientOpId: parsed.data.clientOpId,
            kind: "addStock",
            occurredAt: new Date(),
          },
          run,
          // A duplicate created no batches on THIS call, and saying so beats
          // inventing ids that belong to the first attempt.
          { batchIds: [] },
        )
      ).result
    : await run();

  if (result.ok) refresh(parsed.data.itemId);
  return result;
}

/** Feature 4 — consume. All-or-nothing FEFO draw-down (§3.3). */
export async function consumeAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = consumeSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const run = () =>
    consume(session, parsed.data.itemId, parsed.data.quantity, parsed.data.note);

  const result = parsed.data.clientOpId
    ? (
        await applyOnce(
          session,
          {
            clientOpId: parsed.data.clientOpId,
            kind: "consume",
            occurredAt: new Date(),
          },
          run,
          undefined,
        )
      ).result
    : await run();

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

  const run = () =>
    consumeBatch(session, parsed.data.batchId, parsed.data.quantity, parsed.data.note);

  if (!parsed.data.clientOpId) {
    const direct = await run();
    if (!direct.ok) return direct;
    refresh(direct.data.itemId);
    return actionOk();
  }

  const { result } = await applyOnce(
    session,
    {
      clientOpId: parsed.data.clientOpId,
      kind: "consumeBatch",
      occurredAt: new Date(),
    },
    run,
    // A duplicate touched no batch now; the page it would refresh is the one
    // the caller is already looking at.
    { itemId: parsed.data.batchId },
  );
  if (!result.ok) return result;
  refresh(result.data.itemId);
  return actionOk();
}

export async function discardBatchAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const batch = await prisma.stockBatch.findFirst({
    where: { id: parsed.data.batchId, item: { householdId: session.householdId } },
  });
  if (!batch) return actionError(ruleMessage("stock.batchNotFound"));

  const plan = planDiscard(batch);
  if (!plan.ok) return actionError(plan.error);

  await prisma.$transaction(async (tx) => {
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { quantity: "0.000" },
    });
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
}

/** Feature 4 — set a batch's absolute quantity, recording the signed delta. */
export async function correctBatchAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

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
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { quantity: target.toFixed(3) },
    });
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
}
