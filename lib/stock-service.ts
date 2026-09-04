// NOTE: deliberately NOT `import "server-only"` — see the same note in
// lib/queries.ts. The bot calls this module from plain Node, where that
// package throws unconditionally.

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { actionError, actionOk, type ActionResult } from "@supplies/core/action-result";
import { ruleMessage } from "@supplies/core/messages";
import { parseDateOnly, todayUTC } from "@supplies/core/period";
import { planConsumeBatch, planConsume } from "@supplies/core/stock";

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
 * Feature 33 — a stock write that refuses to act on a stale read.
 *
 * Every write in this module is a read-modify-write: load the batches, plan
 * against them, then store an ABSOLUTE quantity. Between the read and the write
 * another person can change the same row — two phones in one kitchen is this
 * app's normal case, not its edge case — and the second writer would overwrite
 * the first with a number computed from stock that no longer exists. A take
 * disappears; worse, a batch can be *resurrected* to a quantity nobody has.
 *
 * So each write states what it believed: update only `WHERE quantity = <what I
 * planned from>`. Postgres matches zero rows if anyone moved first, and that
 * zero is the conflict signal. More precise than serializable isolation, which
 * also aborts on conflicts that would not have mattered.
 */
export class StockConflict extends Error {
  constructor() {
    super("stock changed between read and write");
    this.name = "StockConflict";
  }
}

/** The slice of a Prisma client (or transaction) this needs. */
type BatchWriter = {
  stockBatch: {
    updateMany(args: {
      where: { id: string; quantity: string };
      data: { quantity: string };
    }): Promise<{ count: number }>;
  };
};

/**
 * Writes `next` into the batch only if it still holds `expected`. Throws
 * `StockConflict` otherwise, which rolls back the surrounding transaction — so
 * a multi-batch FEFO draw stays all-or-nothing even when it loses a race.
 */
export async function writeBatchQuantity(
  tx: BatchWriter,
  batchId: string,
  expected: Prisma.Decimal,
  next: Prisma.Decimal,
): Promise<void> {
  const { count } = await tx.stockBatch.updateMany({
    where: { id: batchId, quantity: expected.toFixed(3) },
    data: { quantity: next.toFixed(3) },
  });
  if (count === 0) throw new StockConflict();
}

/**
 * Re-runs the whole load-plan-write when it lost a race.
 *
 * Re-PLANNING rather than retrying the write is the point: FEFO depends on what
 * is in the fridge now, so a second attempt may legitimately draw from
 * different batches, or find there is no longer enough and refuse with the
 * shortfall. That is the same principle the offline replay uses when it applies
 * a queued take an hour late.
 *
 * Three attempts. A fourth would mean sustained contention a family kitchen
 * cannot produce, and looping on a bug is worse than failing.
 */
export async function withStockRetry<T>(
  work: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof StockConflict && attempt < attempts) continue;
      throw error;
    }
  }
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
  // Feature 33 — the load is inside the retry: losing a race means planning
  // again against current stock, not replaying a plan the fridge disagrees with.
  return withStockRetry(() => consumeOnce(actor, itemId, quantity, note));
}

async function consumeOnce(
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
      // The draw takes `take` and leaves `remaining`, so it planned against
      // their sum. If the row no longer holds that, someone moved first.
      await writeBatchQuantity(
        tx,
        draw.batchId,
        draw.take.plus(draw.remaining),
        draw.remaining,
      );
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

/**
 * Feature 24 — take a named quantity from ONE batch, expired or not.
 *
 * Lives here rather than in the action for the same reason `consume` does:
 * this is a stock write, and stock writes have one implementation that both
 * front ends call. The bot will want this the moment someone tries to use up
 * an expired carton from their phone.
 *
 * FEFO refuses expired batches so consumption is never recorded *silently*
 * against food that had gone off. Choosing a batch by hand is the opposite of
 * silent, so expiry is not consulted here — the person already has.
 */
export async function consumeBatch(
  actor: Actor,
  batchId: string,
  quantity: string,
  note?: string,
): Promise<ActionResult<{ itemId: string }>> {
  // Feature 33 — same reason as `consume`: the read has to be inside the retry.
  return withStockRetry(() => consumeBatchOnce(actor, batchId, quantity, note));
}

async function consumeBatchOnce(
  actor: Actor,
  batchId: string,
  quantity: string,
  note?: string,
): Promise<ActionResult<{ itemId: string }>> {
  const batch = await prisma.stockBatch.findFirst({
    where: { id: batchId, item: { householdId: actor.householdId } },
    include: { item: { select: { unit: true } } },
  });
  if (!batch) return actionError(ruleMessage("stock.batchNotFound"));

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(quantity.replace(",", "."));
  } catch {
    return actionError(ruleMessage("stock.quantityPositive"));
  }

  const plan = planConsumeBatch(batch, amount, batch.item.unit);
  if (!plan.ok) return actionError(plan.error);

  await prisma.$transaction(async (tx) => {
    // `plan.delta` is negative, so this is the batch minus what was taken —
    // conditional on the batch still holding what the plan read.
    await writeBatchQuantity(
      tx,
      batch.id,
      batch.quantity,
      batch.quantity.plus(plan.delta),
    );
    // CONSUME, not WASTE: used and binned are different facts, and this log is
    // the only place that distinction survives.
    await tx.stockMovement.create({
      data: {
        itemId: batch.itemId,
        batchId: batch.id,
        delta: plan.delta.toFixed(3),
        reason: "CONSUME",
        userId: actor.userId,
        note: note ?? null,
      },
    });
  });

  // The caller revalidates /items/[id]; it cannot know which item this was.
  return actionOk({ itemId: batch.itemId });
}
