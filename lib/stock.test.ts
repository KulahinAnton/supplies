import { describe, expect, it } from "vitest";
import { Decimal } from "@/lib/decimal";
import type { Unit } from "@/lib/units";
import { itemExpiryState, batchExpiryState } from "@/lib/expiry";
import { renderMessage } from "@/lib/messages";
import { dateOnlyUTC } from "@/lib/period";
import {
  availableQuantity,
  fefoOrder,
  itemQuantity,
  needsRestock,
  planConsume,
  planConsumeBatch,
  planCorrection,
  planDiscard,
  stockState,
  type StockBatchInput,
  type StockItemInput,
} from "@/lib/stock";

const d = (value: string | number) => new Decimal(value);

function batch(
  id: string,
  quantity: string,
  expiresAt: Date | null,
  createdAt = dateOnlyUTC(2026, 1, 1),
): StockBatchInput {
  return { id, quantity: d(quantity), expiresAt, createdAt };
}

/**
 * PROJECT_PROMPT.md §3.6 — the worked example, reproduced literally. If this
 * block and the spec ever disagree, one of them is a bug.
 */
describe("§3.6 worked example — Milk", () => {
  const item: StockItemInput = { minQty: d("2"), unit: "LITRE" };
  const today = dateOnlyUTC(2026, 3, 10);
  const warnDays = 7;

  const A = batch("A", "1.000", dateOnlyUTC(2026, 3, 8));
  const B = batch("B", "2.000", dateOnlyUTC(2026, 3, 14));
  const C = batch("C", "1.500", null);
  const batches = [A, B, C];

  it("totals 4.500 L of stock", () => {
    expect(itemQuantity(batches).toString()).toBe("4.5");
  });

  it("has only 3.500 L available — the expired litre does not count", () => {
    expect(availableQuantity(batches, today).toString()).toBe("3.5");
  });

  it("reads OK on stock level (4.5 > 2)", () => {
    expect(stockState(item, batches)).toBe("OK");
  });

  it("reads EXPIRED on expiry — the item takes its worst batch", () => {
    expect(itemExpiryState(batches, today, warnDays)).toBe("EXPIRED");
  });

  it("states each batch independently: EXPIRED / SOON / NONE", () => {
    expect(batchExpiryState(A.expiresAt, today, warnDays)).toBe("EXPIRED");
    expect(batchExpiryState(B.expiresAt, today, warnDays)).toBe("SOON");
    expect(batchExpiryState(C.expiresAt, today, warnDays)).toBe("NONE");
  });

  it("consume(3.0) draws 2.000 from B then 1.000 from C, leaving A alone", () => {
    const plan = planConsume(item, batches, d("3.0"), today);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.draws).toHaveLength(2);
    expect(plan.draws[0]).toMatchObject({ batchId: "B" });
    expect(plan.draws[0].take.toString()).toBe("2");
    expect(plan.draws[0].remaining.toString()).toBe("0");
    expect(plan.draws[1]).toMatchObject({ batchId: "C" });
    expect(plan.draws[1].take.toString()).toBe("1");
    expect(plan.draws[1].remaining.toString()).toBe("0.5");

    // The expired batch is untouched.
    expect(plan.draws.some((draw) => draw.batchId === "A")).toBe(false);
  });

  it("leaves 1.500 L after that consume, which reads LOW and wants restocking", () => {
    const after = [A, batch("B", "0", B.expiresAt), batch("C", "0.500", null)];
    expect(itemQuantity(after).toString()).toBe("1.5");
    expect(stockState(item, after)).toBe("LOW");
    expect(needsRestock(item, stockState(item, after))).toBe(true);
  });

  it("rejects consume(4.0) whole, naming the 0.5 shortfall", () => {
    const plan = planConsume(item, batches, d("4.0"), today);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error.key).toBe("stock.shortfall");
    expect(plan.error.params).toMatchObject({
      missing: "0,5 літрів",
      available: "3,5 літрів",
    });
  });

  it("renders that shortfall as a clean Ukrainian sentence", () => {
    const plan = planConsume(item, batches, d("4.0"), today);
    if (plan.ok) throw new Error("expected a rejection");
    // Guards the "5 шт.." double-period bug: the compact unit labels end in a
    // dot, so the message uses the declined long form instead.
    expect(renderMessage(plan.error)).toBe(
      "Не вистачає 0,5 літрів — доступно (не прострочено) лише 3,5 літрів",
    );
  });
});

describe("itemQuantity", () => {
  it("ignores zeroed batches — they are history, not stock", () => {
    const batches = [batch("a", "2", null), batch("b", "0", null)];
    expect(itemQuantity(batches).toString()).toBe("2");
  });

  it("is 0 for an item with no batches at all", () => {
    expect(itemQuantity([]).toString()).toBe("0");
  });

  it("keeps three decimals", () => {
    const batches = [batch("a", "0.125", null), batch("b", "0.250", null)];
    expect(itemQuantity(batches).toString()).toBe("0.375");
  });
});

describe("stockState (§3.4)", () => {
  const today = dateOnlyUTC(2026, 3, 10);
  void today;

  it("is OUT at exactly zero", () => {
    expect(stockState({ minQty: d("2"), unit: "PIECE" }, [])).toBe("OUT");
  });

  it("is LOW at exactly the threshold — the boundary is inclusive", () => {
    const batches = [batch("a", "2", null)];
    expect(stockState({ minQty: d("2"), unit: "PIECE" }, batches)).toBe("LOW");
  });

  it("is OK one unit above the threshold", () => {
    const batches = [batch("a", "2.001", null)];
    expect(stockState({ minQty: d("2"), unit: "PIECE" }, batches)).toBe("OK");
  });

  it("never reports LOW when minQty is 0 — that opts the item out", () => {
    const batches = [batch("a", "0.001", null)];
    expect(stockState({ minQty: d("0"), unit: "PIECE" }, batches)).toBe("OK");
  });

  it("still reports OUT when minQty is 0 — empty is empty", () => {
    expect(stockState({ minQty: d("0"), unit: "PIECE" }, [])).toBe("OUT");
  });

  it("reads total stock, not available — expired stock still counts here", () => {
    // 5 units, all of them expired. Stock level is OK; the expiry dashboard
    // is what complains. Merging the two axes would hide one of them.
    const batches = [batch("a", "5", dateOnlyUTC(2026, 1, 1))];
    expect(stockState({ minQty: d("2"), unit: "PIECE" }, batches)).toBe("OK");
  });
});

describe("fefoOrder (§3.3)", () => {
  const today = dateOnlyUTC(2026, 3, 10);

  it("puts dated batches first, soonest expiry first, undated last", () => {
    const batches = [
      batch("undated", "1", null),
      batch("late", "1", dateOnlyUTC(2026, 12, 1)),
      batch("soon", "1", dateOnlyUTC(2026, 3, 20)),
    ];
    expect(fefoOrder(batches, today).map((b) => b.id)).toEqual([
      "soon",
      "late",
      "undated",
    ]);
  });

  it("excludes expired batches entirely", () => {
    const batches = [
      batch("expired", "5", dateOnlyUTC(2026, 3, 1)),
      batch("good", "1", dateOnlyUTC(2026, 3, 20)),
    ];
    expect(fefoOrder(batches, today).map((b) => b.id)).toEqual(["good"]);
  });

  it("breaks ties on the same expiry date by oldest first", () => {
    const same = dateOnlyUTC(2026, 4, 1);
    const batches = [
      batch("newer", "1", same, dateOnlyUTC(2026, 2, 1)),
      batch("older", "1", same, dateOnlyUTC(2026, 1, 1)),
    ];
    expect(fefoOrder(batches, today).map((b) => b.id)).toEqual(["older", "newer"]);
  });

  it("orders undated batches oldest first", () => {
    const batches = [
      batch("newer", "1", null, dateOnlyUTC(2026, 2, 1)),
      batch("older", "1", null, dateOnlyUTC(2026, 1, 1)),
    ];
    expect(fefoOrder(batches, today).map((b) => b.id)).toEqual(["older", "newer"]);
  });

  it("treats a batch expiring today as usable, not expired", () => {
    const batches = [batch("today", "1", today)];
    expect(fefoOrder(batches, today).map((b) => b.id)).toEqual(["today"]);
  });
});

describe("planConsume", () => {
  const item: StockItemInput = { minQty: d("0"), unit: "PIECE" };
  const today = dateOnlyUTC(2026, 3, 10);

  it("rejects a zero quantity", () => {
    const plan = planConsume(item, [batch("a", "5", null)], d("0"), today);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error.key).toBe("stock.quantityPositive");
  });

  it("rejects a negative quantity", () => {
    const plan = planConsume(item, [batch("a", "5", null)], d("-1"), today);
    expect(plan.ok).toBe(false);
  });

  it("refuses to draw on expired stock even when it would cover the request", () => {
    const batches = [batch("expired", "10", dateOnlyUTC(2026, 1, 1))];
    const plan = planConsume(item, batches, d("1"), today);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    /**
     * The refusal is unchanged — FEFO must never draw on expired stock. What
     * changed is the reason given. This used to report a shortfall of "0
     * штук", which reads as "you have none" while ten sit on the shelf, and
     * left the person no idea that taking from the batch directly would work.
     * The old assertion pinned that wording, which is how a confusing message
     * survives a test suite.
     */
    expect(plan.error.key).toBe("stock.allExpired");
  });

  it("consumes a batch exactly to zero without a stray third decimal", () => {
    const batches = [batch("a", "1.500", null)];
    const plan = planConsume(item, batches, d("1.5"), today);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.draws[0].remaining.toString()).toBe("0");
  });

  it("spans as many batches as it needs", () => {
    const batches = [
      batch("a", "1", dateOnlyUTC(2026, 3, 11)),
      batch("b", "1", dateOnlyUTC(2026, 3, 12)),
      batch("c", "1", dateOnlyUTC(2026, 3, 13)),
    ];
    const plan = planConsume(item, batches, d("2.5"), today);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.draws.map((draw) => draw.take.toString())).toEqual(["1", "1", "0.5"]);
  });

  it("is all-or-nothing: a rejected plan carries no draws to apply", () => {
    const plan = planConsume(item, [batch("a", "1", null)], d("5"), today);
    expect(plan.ok).toBe(false);
    expect("draws" in plan).toBe(false);
  });
});

describe("planCorrection", () => {
  it("returns a positive delta when the count went up", () => {
    const result = planCorrection(batch("a", "2", null), d("5"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delta.toString()).toBe("3");
  });

  it("returns a negative delta when the count went down", () => {
    const result = planCorrection(batch("a", "5", null), d("2"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delta.toString()).toBe("-3");
  });

  it("rejects a negative target quantity", () => {
    const result = planCorrection(batch("a", "5", null), d("-1"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("stock.correctionNegative");
  });
});

describe("planDiscard", () => {
  it("negates the whole batch", () => {
    const result = planDiscard(batch("a", "2.5", null));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delta.toString()).toBe("-2.5");
  });

  it("refuses an already-empty batch", () => {
    const result = planDiscard(batch("a", "0", null));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.key).toBe("stock.batchEmpty");
  });
});

describe("Feature 24 — taking from a specific batch", () => {
  const unit: Unit = "PIECE";
  const today = dateOnlyUTC(2026, 8, 25);
  const batch = (id: string, qty: string, expiresAt: Date | null) => ({
    id,
    quantity: new Decimal(qty),
    expiresAt,
    createdAt: dateOnlyUTC(2026, 1, 1),
  });

  describe("planConsumeBatch", () => {
    /**
     * The whole point. FEFO refuses expired stock so consumption is never
     * recorded silently against food that had gone off; choosing this batch
     * by hand is the opposite of silent.
     */
    it("allows taking from an expired batch", () => {
      const expired = batch("b1", "3", dateOnlyUTC(2026, 8, 1));
      const plan = planConsumeBatch(expired, new Decimal("2"), unit);
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.delta.toString()).toBe("-2");
    });

    it("refuses more than the batch holds, naming what is there", () => {
      const plan = planConsumeBatch(
        batch("b1", "3", null),
        new Decimal("5"),
        unit,
      );
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.error.key).toBe("stock.batchShortfall");
    });

    it("refuses zero, negatives and an empty batch", () => {
      const live = batch("b1", "3", null);
      expect(planConsumeBatch(live, new Decimal("0"), unit).ok).toBe(false);
      expect(planConsumeBatch(live, new Decimal("-1"), unit).ok).toBe(false);
      const empty = batch("b2", "0", null);
      const plan = planConsumeBatch(empty, new Decimal("1"), unit);
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.error.key).toBe("stock.batchEmpty");
    });

    it("allows taking the batch down to exactly zero", () => {
      const plan = planConsumeBatch(batch("b1", "3", null), new Decimal("3"), unit);
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.delta.toString()).toBe("-3");
    });
  });

  describe("planConsume when everything is expired", () => {
    /**
     * The reported bug: with only expired stock, FEFO's available total is
     * zero, so the shortfall message said there was nothing to take. There
     * was — it just could not be taken that way.
     */
    it("says the stock is expired rather than absent", () => {
      const item = { minQty: new Decimal("0"), unit };
      const batches = [batch("b1", "4", dateOnlyUTC(2026, 8, 1))];
      const plan = planConsume(item, batches, new Decimal("1"), today);
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.error.key).toBe("stock.allExpired");
    });

    it("still reports a plain shortfall when some stock is usable", () => {
      const item = { minQty: new Decimal("0"), unit };
      const batches = [
        batch("b1", "4", dateOnlyUTC(2026, 8, 1)), // expired
        batch("b2", "1", dateOnlyUTC(2027, 1, 1)), // usable
      ];
      const plan = planConsume(item, batches, new Decimal("3"), today);
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.error.key).toBe("stock.shortfall");
    });

    it("reports nothing-to-consume when there is genuinely no stock", () => {
      const item = { minQty: new Decimal("0"), unit };
      const plan = planConsume(item, [batch("b1", "0", null)], new Decimal("1"), today);
      expect(plan.ok).toBe(false);
      if (!plan.ok) expect(plan.error.key).not.toBe("stock.allExpired");
    });
  });
});

describe("Feature 25 — minQty 0 opts out of every reminder", () => {
  const unit: Unit = "PIECE";
  const empty = [
    { id: "b", quantity: new Decimal("0"), expiresAt: null, createdAt: new Date() },
  ];

  /**
   * The reported bug. The item form promises «0 — не нагадувати», but minQty 0
   * only ever suppressed LOW: an item that reached zero still reported OUT and
   * came back through the dashboard, the shopping candidates and the Telegram
   * digest. Half an opt-out is not an opt-out.
   */
  it("does not nag about an item that ran out with minQty 0", () => {
    const item = { minQty: new Decimal("0"), unit };
    expect(stockState(item, empty)).toBe("OUT");
    expect(needsRestock(item, stockState(item, empty))).toBe(false);
  });

  it("still nags when a minimum was actually set", () => {
    const item = { minQty: new Decimal("1"), unit };
    expect(needsRestock(item, stockState(item, empty))).toBe(true);
  });

  /**
   * The state itself is a fact about the shelf and must not change — the badge
   * still says «Закінчився». Only the nagging is opt-out.
   */
  it("leaves the OUT state intact, so the badge still tells the truth", () => {
    const optedOut = { minQty: new Decimal("0"), unit };
    const nagging = { minQty: new Decimal("2"), unit };
    expect(stockState(optedOut, empty)).toBe(stockState(nagging, empty));
  });

  it("suppresses LOW as well, as it always did", () => {
    const item = { minQty: new Decimal("0"), unit };
    const some = [
      { id: "b", quantity: new Decimal("1"), expiresAt: null, createdAt: new Date() },
    ];
    expect(stockState(item, some)).toBe("OK");
    expect(needsRestock(item, stockState(item, some))).toBe(false);
  });
});
