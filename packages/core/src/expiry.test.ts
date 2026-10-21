import { describe, expect, it } from "vitest";
import { Decimal } from "./decimal";
import {
  batchExpiryState,
  byUrgency,
  splitExpiring,
  daysUntil,
  itemExpiryState,
  needsAttention,
  resolveWarnDays,
  type ExpiryBatch,
} from "./expiry";
import { dateOnlyUTC } from "./period";

const d = (value: string | number) => new Decimal(value);

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

describe("resolveWarnDays (Feature 13)", () => {
  it("uses the category's own window when it has one", () => {
    expect(resolveWarnDays(14, 7)).toBe(14);
  });

  it("inherits the household default when the category is null", () => {
    expect(resolveWarnDays(null, 7)).toBe(7);
  });

  it("treats undefined as inherit too — a category loaded without the field", () => {
    expect(resolveWarnDays(undefined, 7)).toBe(7);
  });

  it("honours a category window of 0 rather than treating it as unset", () => {
    // The bug this guards: `categoryWarnDays || household` would return 7 here,
    // silently ignoring "warn me only on the day itself".
    expect(resolveWarnDays(0, 7)).toBe(0);
  });

  it("follows the household default as it changes, for an inheriting category", () => {
    expect(resolveWarnDays(null, 3)).toBe(3);
    expect(resolveWarnDays(null, 30)).toBe(30);
  });

  it("feeds straight into batchExpiryState", () => {
    const soonUnder14 = dateOnlyUTC(2026, 3, 20);
    // FRESH under the household's 7 days, SOON under a category's 14.
    expect(batchExpiryState(soonUnder14, today, resolveWarnDays(null, 7))).toBe(
      "FRESH",
    );
    expect(batchExpiryState(soonUnder14, today, resolveWarnDays(14, 7))).toBe(
      "SOON",
    );
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

describe("splitExpiring", () => {
  const row = (name: string, expiry: "EXPIRED" | "SOON") => ({ name, expiry });

  it("separates what is gone from what still has time", () => {
    const { expired, soon } = splitExpiring([
      row("Молоко", "EXPIRED"),
      row("Йогурт", "SOON"),
      row("Сир", "EXPIRED"),
    ]);
    expect(expired.map((r) => r.name)).toEqual(["Молоко", "Сир"]);
    expect(soon.map((r) => r.name)).toEqual(["Йогурт"]);
  });

  it("keeps the caller's order inside each half", () => {
    // The dashboard sorts by urgency before splitting; the split must not
    // shuffle that back.
    const { expired } = splitExpiring([
      row("давніше", "EXPIRED"),
      row("свіжіше", "EXPIRED"),
    ]);
    expect(expired.map((r) => r.name)).toEqual(["давніше", "свіжіше"]);
  });

  it("gives empty halves rather than nothing to render", () => {
    expect(splitExpiring([])).toEqual({ expired: [], soon: [] });
    expect(splitExpiring([row("Хліб", "SOON")]).expired).toEqual([]);
  });
});
