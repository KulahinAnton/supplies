import { describe, expect, it } from "vitest";
import {
  inSendOrder,
  queuedOpSchema,
  summariseSync,
  syncRequestSchema,
  MAX_OPS_PER_FLUSH,
  type QueuedOp,
} from "@/lib/offline/operations";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const consumeOp = (n: number, occurredAt: string): QueuedOp => ({
  clientOpId: id(n),
  occurredAt,
  kind: "consume",
  itemId: "item-1",
  quantity: "2",
});

describe("queuedOpSchema", () => {
  it("accepts the three kinds a phone can queue", () => {
    expect(queuedOpSchema.safeParse(consumeOp(1, "2026-08-31T10:00:00.000Z")).success).toBe(true);
    expect(
      queuedOpSchema.safeParse({
        clientOpId: id(2),
        occurredAt: "2026-08-31T10:00:00.000Z",
        kind: "addStock",
        itemId: "item-1",
        rows: [{ quantity: "3" }],
      }).success,
    ).toBe(true);
    expect(
      queuedOpSchema.safeParse({
        clientOpId: id(3),
        occurredAt: "2026-08-31T10:00:00.000Z",
        kind: "consumeBatch",
        batchId: "batch-1",
        quantity: "1",
      }).success,
    ).toBe(true);
  });

  it("refuses an op with no idempotency key", () => {
    // Without it a re-sent flush deducts the same stock twice, so this is the
    // one field the queue cannot be lenient about.
    const rest: Record<string, unknown> = { ...consumeOp(4, "2026-08-31T10:00:00.000Z") };
    delete rest.clientOpId;
    expect(queuedOpSchema.safeParse(rest).success).toBe(false);
    expect(queuedOpSchema.safeParse({ ...rest, clientOpId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("refuses an unknown kind rather than guessing", () => {
    expect(
      queuedOpSchema.safeParse({
        clientOpId: id(5),
        occurredAt: "2026-08-31T10:00:00.000Z",
        kind: "deleteItem",
        itemId: "item-1",
      }).success,
    ).toBe(false);
  });

  it("refuses an addStock with no rows", () => {
    expect(
      queuedOpSchema.safeParse({
        clientOpId: id(6),
        occurredAt: "2026-08-31T10:00:00.000Z",
        kind: "addStock",
        itemId: "item-1",
        rows: [],
      }).success,
    ).toBe(false);
  });
});

describe("syncRequestSchema", () => {
  it("caps a flush", () => {
    const ops = Array.from({ length: MAX_OPS_PER_FLUSH + 1 }, (_, i) =>
      consumeOp(i, "2026-08-31T10:00:00.000Z"),
    );
    expect(syncRequestSchema.safeParse({ ops }).success).toBe(false);
    expect(syncRequestSchema.safeParse({ ops: ops.slice(0, -1) }).success).toBe(true);
  });

  it("accepts an empty flush", () => {
    expect(syncRequestSchema.safeParse({ ops: [] }).success).toBe(true);
  });
});

describe("inSendOrder", () => {
  it("applies in the order things happened, not the order they were stored", () => {
    // IndexedDB returns by key, which is a uuid — meaningless as an ordering.
    // Taking milk and then adding more must not apply the other way round.
    const ordered = inSendOrder([
      consumeOp(1, "2026-08-31T12:00:00.000Z"),
      consumeOp(2, "2026-08-31T08:00:00.000Z"),
      consumeOp(3, "2026-08-31T10:00:00.000Z"),
    ]);
    expect(ordered.map((op) => op.occurredAt)).toEqual([
      "2026-08-31T08:00:00.000Z",
      "2026-08-31T10:00:00.000Z",
      "2026-08-31T12:00:00.000Z",
    ]);
  });
});

describe("summariseSync", () => {
  it("counts what applied and what was refused", () => {
    expect(
      summariseSync([
        { clientOpId: id(1), ok: true },
        { clientOpId: id(2), ok: false, error: { key: "stock.shortfall" } },
        { clientOpId: id(3), ok: true },
      ]),
    ).toEqual({ applied: 2, failed: 1 });
  });

  it("does not count a duplicate as news", () => {
    // A flush interrupted after the server applied it re-sends the same ops.
    // Reporting "synchronised: 3" a second time would be telling the user
    // something happened that did not.
    expect(
      summariseSync([
        { clientOpId: id(1), ok: true, duplicate: true },
        { clientOpId: id(2), ok: false, error: { key: "stock.shortfall" }, duplicate: true },
        { clientOpId: id(3), ok: true },
      ]),
    ).toEqual({ applied: 1, failed: 0 });
  });

  it("says nothing happened when nothing did", () => {
    expect(summariseSync([])).toEqual({ applied: 0, failed: 0 });
  });
});
