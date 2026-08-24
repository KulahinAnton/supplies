// NOTE: deliberately NOT `import "server-only"` — see the same note in
// lib/queries.ts. The bot calls this module from plain Node, where that
// package throws unconditionally.

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { ruleMessage } from "@/lib/messages";
import { parseDateOnly, todayUTC } from "@/lib/period";
import { planConsume } from "@/lib/stock";

/**
 * The stock write path, independent of HOW the caller authenticated.
 *
 * Server actions (lib/actions/stock.ts) call this after `requireSession()`;
 * the Telegram bot (bot/actions.ts) calls it after resolving a linked chat.
 * Keeping the rules here is what makes "the bot is a second front end, never a
 * second implementation" (PROJECT_PROMPT.md Feature 9) true rather than
 * aspirational — there is exactly one place that writes a StockMovement.
 */

export type Actor = { userId: string; householdId: string };

export type BatchRow = {
  quantity: string;
  expiresAt?: string;
  openedAt?: string;
  /** Feature 22 — omitted means "wherever the item lives". */
  locationId?: string;
};

async function loadItem(itemId: string, householdId: string) {
  return prisma.item.findFirst({
    where: { id: itemId, householdId },
    include: { batches: true },
  });
}

/**
 * Feature 22 — the storage locations this household is allowed to name.
 *
 * Batch rows arrive from a client that could send any id, so an id is only
 * accepted if it belongs to this household. Without this check one household
 * could file its stock under another household's shelf.
 */
async function householdLocationIds(householdId: string): Promise<Set<string>> {
  const rows = await prisma.storageLocation.findMany({
    where: { householdId },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

export async function addStock(
  actor: Actor,
  itemId: string,
  rows: BatchRow[],
  note?: string,
): Promise<ActionResult<{ batchIds: string[] }>> {
  const item = await loadItem(itemId, actor.householdId);
  if (!item) return actionError(ruleMessage("item.notFound"));
  if (item.isArchived) return actionError(ruleMessage("item.archived"));
  if (rows.length === 0) return actionError(ruleMessage("batch.rowsRequired"));

  // Merge rows naming the same date — two lines of "3 bottles, 12.03" are one
  // batch of 6, not two the FEFO planner has to tie-break.
  const allowedLocations = await householdLocationIds(actor.householdId);

  const merged = new Map<
    string,
    {
      quantity: Prisma.Decimal;
      expiresAt: Date | null;
      openedAt: Date | null;
      locationId: string | null;
    }
  >();

  for (const row of rows) {
    let quantity: Prisma.Decimal;
    try {
      quantity = new Prisma.Decimal(row.quantity.replace(",", "."));
    } catch {
      return actionError(ruleMessage("stock.quantityPositive"));
    }
    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) {
      return actionError(ruleMessage("stock.quantityPositive"));
    }

    let expiresAt: Date | null = null;
    let openedAt: Date | null = null;
    try {
      expiresAt = row.expiresAt ? parseDateOnly(row.expiresAt) : null;
      openedAt = row.openedAt ? parseDateOnly(row.openedAt) : null;
    } catch {
      return actionError(ruleMessage("batch.expiryInPast"));
    }
    if (openedAt && openedAt.getTime() > todayUTC().getTime()) {
      return actionError(ruleMessage("batch.openedInFuture"));
    }

    /**
     * Feature 22 — an omitted location means "where this item lives". That
     * keeps the shopping-list buy flow and the API honest without either
     * having to know about locations, and matches what the migration wrote
     * for every batch that predates the feature.
     */
    const locationId = row.locationId?.trim() ? row.locationId : item.locationId;
    if (locationId && !allowedLocations.has(locationId)) {
      return actionError(ruleMessage("item.locationNotFound"));
    }

    /**
     * The location is part of the merge key. Two rows for the same date in
     * different places are two batches — merging them would silently move
     * stock, and the whole point of the feature is that the kitchen fridge and
     * the basement fridge are not the same shelf.
     */
    const mergeKey = `${row.expiresAt ?? ""}|${row.openedAt ?? ""}|${locationId ?? ""}`;
    const existing = merged.get(mergeKey);
    if (existing) {
      existing.quantity = existing.quantity.plus(quantity);
    } else {
      merged.set(mergeKey, { quantity, expiresAt, openedAt, locationId });
    }
  }

  const batchIds = await prisma.$transaction(async (tx) => {
    const created: string[] = [];
    for (const row of merged.values()) {
      const batch = await tx.stockBatch.create({
        data: {
          itemId,
          quantity: row.quantity.toFixed(3),
          expiresAt: row.expiresAt,
          openedAt: row.openedAt,
          locationId: row.locationId,
          addedById: actor.userId,
        },
      });
      await tx.stockMovement.create({
        data: {
          itemId,
          batchId: batch.id,
          delta: row.quantity.toFixed(3),
          reason: "PURCHASE",
          userId: actor.userId,
          note: note ?? null,
        },
      });
      created.push(batch.id);
    }
    return created;
  });

  return actionOk({ batchIds });
}

export async function consume(
  actor: Actor,
  itemId: string,
  quantity: string,
  note?: string,
): Promise<ActionResult> {
  const item = await loadItem(itemId, actor.householdId);
  if (!item) return actionError(ruleMessage("item.notFound"));

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(quantity.replace(",", "."));
  } catch {
    return actionError(ruleMessage("stock.quantityPositive"));
  }
  if (!amount.isFinite()) {
    return actionError(ruleMessage("stock.quantityPositive"));
  }

  const plan = planConsume(item, item.batches, amount, todayUTC());
  if (!plan.ok) return actionError(plan.error);

  await prisma.$transaction(async (tx) => {
    for (const draw of plan.draws) {
      await tx.stockBatch.update({
        where: { id: draw.batchId },
        data: { quantity: draw.remaining.toFixed(3) },
      });
      await tx.stockMovement.create({
        data: {
          itemId,
          batchId: draw.batchId,
          delta: draw.take.negated().toFixed(3),
          reason: "CONSUME",
          userId: actor.userId,
          note: note ?? null,
        },
      });
    }
  });

  return actionOk();
}
