import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  batchExpiryState,
  byUrgency,
  daysUntil,
  itemExpiryState,
  needsAttention,
  type ExpiryBatch,
} from "@/lib/expiry";
import { dateOnlyUTC } from "@/lib/period";

const d = (value: string | number) => new Prisma.Decimal(value);

function batch(quantity: string, expiresAt: Date | null): ExpiryBatch {
  return { quantity: d(quantity), expiresAt };
}

const today = dateOnlyUTC(2026, 3, 10);
const WARN = 7;

describe("batchExpiryState (§3.5)", () => {
  it("is NONE without a date", () => {
    expect(batchExpiryState(null, today, WARN)).toBe("NONE");
  });

  it("is EXPIRED the day after the date", () => {
    expect(batchExpiryState(dateOnlyUTC(2026, 3, 9), today, WARN)).toBe("EXPIRED");
  });

  it("is SOON on the date itself — today is not yet too late", () => {
    expect(batchExpiryState(today, today, WARN)).toBe("SOON");
  });

  it("is SOON on the last day of the warning window (inclusive)", () => {
    expect(batchExpiryState(dateOnlyUTC(2026, 3, 17), today, WARN)).toBe("SOON");
  });

  it("is FRESH one day past the window", () => {
    expect(batchExpiryState(dateOnlyUTC(2026, 3, 18), today, WARN)).toBe("FRESH");
  });

  it("honours a household warnDays of 0 — only today counts as soon", () => {
    expect(batchExpiryState(today, today, 0)).toBe("SOON");
    expect(batchExpiryState(dateOnlyUTC(2026, 3, 11), today, 0)).toBe("FRESH");
  });

  it("honours a long warnDays window", () => {
    expect(batchExpiryState(dateOnlyUTC(2026, 4, 1), today, 30)).toBe("SOON");
  });

  it("ignores a time component on the stored date", () => {
    const withTime = new Date(Date.UTC(2026, 2, 17, 23, 59, 59));
    expect(batchExpiryState(withTime, today, WARN)).toBe("SOON");
  });
});

describe("itemExpiryState", () => {
  it("takes the worst batch: one expired lot condemns the item", () => {
    const batches = [
      batch("1", dateOnlyUTC(2026, 3, 1)),
      batch("5", dateOnlyUTC(2027, 1, 1)),
    ];
    expect(itemExpiryState(batches, today, WARN)).toBe("EXPIRED");
  });

  it("prefers SOON over FRESH", () => {
    const batches = [
      batch("1", dateOnlyUTC(2026, 3, 12)),
      batch("5", dateOnlyUTC(2027, 1, 1)),
    ];
    expect(itemExpiryState(batches, today, WARN)).toBe("SOON");
  });

  it("treats NONE as the least severe, not the most", () => {
    const batches = [batch("1", null), batch("5", dateOnlyUTC(2027, 1, 1))];
    expect(itemExpiryState(batches, today, WARN)).toBe("FRESH");
  });

  it("ignores zeroed batches — a used-up expired lot is not a warning", () => {
    const batches = [
      batch("0", dateOnlyUTC(2026, 3, 1)),
      batch("5", dateOnlyUTC(2027, 1, 1)),
    ];
    expect(itemExpiryState(batches, today, WARN)).toBe("FRESH");
  });

  it("is NONE for an item with nothing in stock", () => {
    expect(itemExpiryState([], today, WARN)).toBe("NONE");
  });
});

describe("daysUntil", () => {
  it("is positive for the future and negative once past", () => {
    expect(daysUntil(dateOnlyUTC(2026, 3, 15), today)).toBe(5);
    expect(daysUntil(dateOnlyUTC(2026, 3, 5), today)).toBe(-5);
    expect(daysUntil(today, today)).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(daysUntil(dateOnlyUTC(2026, 4, 1), today)).toBe(22);
  });
});

describe("needsAttention", () => {
  it("surfaces expired and soon, stays quiet for fresh and undated", () => {
    expect(needsAttention("EXPIRED")).toBe(true);
    expect(needsAttention("SOON")).toBe(true);
    expect(needsAttention("FRESH")).toBe(false);
    expect(needsAttention("NONE")).toBe(false);
  });
});

describe("byUrgency", () => {
  it("sorts earliest date first and undated last", () => {
    const sorted = [
      batch("1", null),
      batch("1", dateOnlyUTC(2026, 5, 1)),
      batch("1", dateOnlyUTC(2026, 4, 1)),
    ].sort(byUrgency);
    expect(sorted.map((b) => b.expiresAt && b.expiresAt.getUTCMonth())).toEqual([
      3,
      4,
      null,
    ]);
  });
});
