import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { dateOnlyUTC } from "@/lib/period";
import { isValidListRow, shoppingCandidates, type CandidateItem } from "@/lib/shopping";
import type { StockBatchInput } from "@/lib/stock";

const d = (value: string | number) => new Prisma.Decimal(value);

function batch(id: string, quantity: string): StockBatchInput {
  return { id, quantity: d(quantity), expiresAt: null, createdAt: dateOnlyUTC(2026, 1, 1) };
}

function item(id: string, name: string, minQty: string): CandidateItem {
  return { id, name, minQty: d(minQty), unit: "PIECE" };
}

describe("shoppingCandidates (§3.4 → Feature 6)", () => {
  it("includes items that are OUT and LOW, and no others", () => {
    const items = [
      item("out", "Молоко", "2"),
      item("low", "Хліб", "2"),
      item("ok", "Цукор", "2"),
    ];
    const batches = new Map<string, StockBatchInput[]>([
      ["out", []],
      ["low", [batch("b1", "2")]],
      ["ok", [batch("b2", "10")]],
    ]);

    const result = shoppingCandidates(items, batches, new Set());
    expect(result.map((c) => c.itemId)).toEqual(["out", "low"]);
  });

  it("puts OUT before LOW — empty shelves come first", () => {
    const items = [item("low", "Аа", "2"), item("out", "Яя", "2")];
    const batches = new Map<string, StockBatchInput[]>([
      ["low", [batch("b", "1")]],
      ["out", []],
    ]);

    const result = shoppingCandidates(items, batches, new Set());
    expect(result.map((c) => c.state)).toEqual(["OUT", "LOW"]);
  });

  it("sorts by Ukrainian collation within a state", () => {
    const items = [item("b", "Яблука", "0"), item("a", "Апельсини", "0")];
    const batches = new Map<string, StockBatchInput[]>([
      ["a", []],
      ["b", []],
    ]);

    const result = shoppingCandidates(items, batches, new Set());
    expect(result.map((c) => c.name)).toEqual(["Апельсини", "Яблука"]);
  });

  it("skips items already sitting unchecked on the list", () => {
    const items = [item("out", "Молоко", "2")];
    const batches = new Map<string, StockBatchInput[]>([["out", []]]);

    expect(shoppingCandidates(items, batches, new Set(["out"]))).toEqual([]);
  });

  it("never suggests an item with minQty 0 that still has stock", () => {
    const items = [item("opted-out", "Спеції", "0")];
    const batches = new Map<string, StockBatchInput[]>([
      ["opted-out", [batch("b", "0.001")]],
    ]);

    expect(shoppingCandidates(items, batches, new Set())).toEqual([]);
  });

  it("still suggests a minQty-0 item once it is completely out", () => {
    const items = [item("opted-out", "Спеції", "0")];
    const batches = new Map<string, StockBatchInput[]>([["opted-out", []]]);

    const result = shoppingCandidates(items, batches, new Set());
    expect(result.map((c) => c.state)).toEqual(["OUT"]);
  });

  it("reports the current quantity and threshold for the prompt text", () => {
    const items = [item("low", "Хліб", "2")];
    const batches = new Map<string, StockBatchInput[]>([["low", [batch("b", "1.5")]]]);

    const [candidate] = shoppingCandidates(items, batches, new Set());
    expect(candidate.quantity.toString()).toBe("1.5");
    expect(candidate.minQty.toString()).toBe("2");
  });

  it("treats an item with no batch entry at all as OUT", () => {
    const items = [item("fresh", "Новий товар", "1")];
    const result = shoppingCandidates(items, new Map(), new Set());
    expect(result.map((c) => c.state)).toEqual(["OUT"]);
  });
});

describe("isValidListRow", () => {
  it("accepts exactly one of item / free text", () => {
    expect(isValidListRow({ itemId: "x", freeText: null })).toBe(true);
    expect(isValidListRow({ itemId: null, freeText: "свічки" })).toBe(true);
  });

  it("rejects both and neither", () => {
    expect(isValidListRow({ itemId: "x", freeText: "свічки" })).toBe(false);
    expect(isValidListRow({ itemId: null, freeText: null })).toBe(false);
  });

  it("treats whitespace-only free text as empty", () => {
    expect(isValidListRow({ itemId: null, freeText: "   " })).toBe(false);
  });
});
