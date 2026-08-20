import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDays,
  formatExpiryRelative,
  formatQuantity,
  formatQuantityWithUnit,
  formatQuantityWithUnitLong,
  pluralUk,
  UNIT_PLURAL,
} from "@/lib/format";
import { dateOnlyUTC } from "@/lib/period";

describe("formatQuantity", () => {
  it("uses the Ukrainian decimal comma", () => {
    expect(formatQuantity("4.5")).toBe("4,5");
  });

  it("drops trailing zeros Postgres keeps on Decimal(12,3)", () => {
    expect(formatQuantity("4.500")).toBe("4,5");
    expect(formatQuantity("10.000")).toBe("10");
  });

  it("keeps three decimals when they carry information", () => {
    expect(formatQuantity("0.125")).toBe("0,125");
  });

  it("formats zero plainly", () => {
    expect(formatQuantity("0")).toBe("0");
  });

  it("handles a negative delta", () => {
    expect(formatQuantity("-2.5")).toBe("-2,5");
  });
});

describe("formatDate", () => {
  it("renders DD.MM.YYYY", () => {
    expect(formatDate(dateOnlyUTC(2026, 3, 9))).toBe("09.03.2026");
  });

  it("does not shift the day for a UTC-midnight value", () => {
    // The bug this guards: a local-timezone formatter renders 2026-01-01 as
    // 31.12.2025 for anyone west of UTC.
    expect(formatDate(dateOnlyUTC(2026, 1, 1))).toBe("01.01.2026");
  });
});

describe("pluralUk", () => {
  const forms = UNIT_PLURAL.PIECE;

  it("picks the 'one' form for 1, 21, 101", () => {
    expect(pluralUk(1, forms)).toBe("штука");
    expect(pluralUk(21, forms)).toBe("штука");
    expect(pluralUk(101, forms)).toBe("штука");
  });

  it("picks the 'few' form for 2-4, 22-24", () => {
    expect(pluralUk(2, forms)).toBe("штуки");
    expect(pluralUk(4, forms)).toBe("штуки");
    expect(pluralUk(23, forms)).toBe("штуки");
  });

  it("picks the 'many' form for 5-20 and for 11-14", () => {
    expect(pluralUk(5, forms)).toBe("штук");
    expect(pluralUk(11, forms)).toBe("штук");
    expect(pluralUk(14, forms)).toBe("штук");
    expect(pluralUk(0, forms)).toBe("штук");
  });
});

describe("formatDays", () => {
  it("declines день / дні / днів", () => {
    expect(formatDays(1)).toBe("1 день");
    expect(formatDays(3)).toBe("3 дні");
    expect(formatDays(5)).toBe("5 днів");
    expect(formatDays(11)).toBe("11 днів");
  });
});

describe("formatQuantityWithUnit", () => {
  it("uses the compact unit label", () => {
    expect(formatQuantityWithUnit("4.500", "LITRE")).toBe("4,5 л");
    expect(formatQuantityWithUnit("10", "PIECE")).toBe("10 шт.");
  });

  it("declines the long form", () => {
    expect(formatQuantityWithUnitLong("1", "LITRE")).toBe("1 літр");
    expect(formatQuantityWithUnitLong("3", "LITRE")).toBe("3 літри");
    expect(formatQuantityWithUnitLong("5", "LITRE")).toBe("5 літрів");
  });
});

describe("formatExpiryRelative", () => {
  const today = dateOnlyUTC(2026, 3, 10);

  it("names today, tomorrow and yesterday rather than counting", () => {
    expect(formatExpiryRelative(today, today)).toBe("сьогодні");
    expect(formatExpiryRelative(dateOnlyUTC(2026, 3, 11), today)).toBe("завтра");
    expect(formatExpiryRelative(dateOnlyUTC(2026, 3, 9), today)).toBe("вчора");
  });

  it("counts forward with a declined day word", () => {
    expect(formatExpiryRelative(dateOnlyUTC(2026, 3, 13), today)).toBe("через 3 дні");
    expect(formatExpiryRelative(dateOnlyUTC(2026, 3, 15), today)).toBe("через 5 днів");
  });

  it("counts backward for something already off", () => {
    expect(formatExpiryRelative(dateOnlyUTC(2026, 3, 7), today)).toBe("3 дні тому");
  });
});
