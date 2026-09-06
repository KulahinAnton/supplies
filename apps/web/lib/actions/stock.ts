"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-guard";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import {
  addStock,
  consume,
  consumeBatch,
  correctBatch,
  discardBatch,
} from "@supplies/db/stock-service";
import {
  addStockSchema,
  consumeBatchSchema,
  consumeSchema,
  correctionSchema,
  discardSchema,
} from "@supplies/core/validation/stock";
import { firstIssueAsRuleMessage } from "@supplies/core/validation/shared";

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

  const result = await discardBatch(session, parsed.data.batchId, parsed.data.note);
  if (result.ok) refresh(result.data.itemId);
  return result.ok ? actionOk() : result;
}

/** Feature 4 — set a batch's absolute quantity, recording the signed delta. */
export async function correctBatchAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssueAsRuleMessage(parsed.error));

  const result = await correctBatch(
    session,
    parsed.data.batchId,
    parsed.data.quantity,
    parsed.data.note,
  );
  if (result.ok) refresh(result.data.itemId);
  return result.ok ? actionOk() : result;
}

