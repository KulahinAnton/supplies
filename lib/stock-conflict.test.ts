import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  StockConflict,
  withStockRetry,
  writeBatchQuantity,
} from "@/lib/stock-service";

/**
 * Feature 33 — the concurrency primitives, tested without a database.
 *
 * `writeBatchQuantity` takes the narrow `BatchWriter` shape rather than a
 * Prisma client precisely so the conflict branch can be exercised here: a real
 * race is hard to stage and easy to write a test that passes for the wrong
 * reason. The integration proof — two interleaved takes against live
 * Postgres — lives in `scripts/smoke.ts`.
 */

const dec = (n: string) => new Prisma.Decimal(n);

/** A stand-in for the transaction client: says how many rows it matched. */
function writer(matched: number) {
  const updateMany = vi.fn().mockResolvedValue({ count: matched });
  return { client: { stockBatch: { updateMany } }, updateMany };
}

describe("writeBatchQuantity", () => {
  it("writes when the row still holds what was planned from", async () => {
    const { client, updateMany } = writer(1);

    await expect(
      writeBatchQuantity(client, "batch-1", dec("10"), dec("7")),
    ).resolves.toBeUndefined();

    // The `where` carries the expectation — that clause IS the safety.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", quantity: "10.000" },
      data: { quantity: "7.000" },
    });
  });

  it("refuses when nobody matched, because someone moved first", async () => {
    const { client } = writer(0);

    await expect(
      writeBatchQuantity(client, "batch-1", dec("10"), dec("7")),
    ).rejects.toBeInstanceOf(StockConflict);
  });

  it("compares at three decimals, the column's precision", async () => {
    const { updateMany, client } = writer(1);
    await writeBatchQuantity(client, "b", dec("0.5"), dec("0.25"));
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "b", quantity: "0.500" },
      data: { quantity: "0.250" },
    });
  });
});

describe("withStockRetry", () => {
  it("returns the result when nothing raced", async () => {
    const work = vi.fn().mockResolvedValue("done");
    await expect(withStockRetry(work)).resolves.toBe("done");
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("runs the work again after a conflict, so FEFO is re-planned", async () => {
    // The retry re-runs the WHOLE closure — load, plan and write — which is
    // what makes the second attempt honest about current stock rather than
    // replaying a plan the fridge disagrees with.
    const work = vi
      .fn()
      .mockRejectedValueOnce(new StockConflict())
      .mockResolvedValue("done");

    await expect(withStockRetry(work)).resolves.toBe("done");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("gives up rather than looping forever", async () => {
    const work = vi.fn().mockRejectedValue(new StockConflict());
    await expect(withStockRetry(work)).rejects.toBeInstanceOf(StockConflict);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it("never retries an ordinary failure", async () => {
    // A shortfall is returned, not thrown, so it never reaches here. Anything
    // that DOES throw is a real fault, and repeating it would just multiply it.
    const boom = new Error("connection lost");
    const work = vi.fn().mockRejectedValue(boom);

    await expect(withStockRetry(work)).rejects.toBe(boom);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
