import { describe, expect, it } from "vitest";
import {
  addDays,
  compareDateOnly,
  dateOnlyUTC,
  daysBetween,
  formatDateKey,
  isSameDay,
  parseDateOnly,
  toDateOnly,
  todayUTC,
} from "./period";

describe("dateOnlyUTC", () => {
  it("pins to UTC midnight with a 1-based month", () => {
    const date = dateOnlyUTC(2026, 3, 10);
    expect(date.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });
});

describe("toDateOnly", () => {
  it("strips a time component without shifting the calendar day", () => {
    const withTime = new Date(Date.UTC(2026, 2, 10, 23, 30));
    expect(formatDateKey(toDateOnly(withTime))).toBe("2026-03-10");
  });

  it("leaves an already-normalised date alone", () => {
    const date = dateOnlyUTC(2026, 3, 10);
    expect(toDateOnly(date).getTime()).toBe(date.getTime());
  });
});

describe("parseDateOnly", () => {
  it("round-trips through formatDateKey", () => {
    expect(formatDateKey(parseDateOnly("2026-03-10"))).toBe("2026-03-10");
  });

  it("rejects a malformed string", () => {
    expect(() => parseDateOnly("10.03.2026")).toThrow();
    expect(() => parseDateOnly("2026-3-10")).toThrow();
  });

  it("rejects a date that does not exist instead of rolling it over", () => {
    // Date.UTC would silently turn this into 2026-03-03.
    expect(() => parseDateOnly("2026-02-31")).toThrow();
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    expect(formatDateKey(parseDateOnly("2028-02-29"))).toBe("2028-02-29");
    expect(() => parseDateOnly("2026-02-29")).toThrow();
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(formatDateKey(addDays(dateOnlyUTC(2026, 3, 30), 3))).toBe("2026-04-02");
  });

  it("crosses a year boundary backwards", () => {
    expect(formatDateKey(addDays(dateOnlyUTC(2026, 1, 2), -3))).toBe("2025-12-30");
  });

  it("handles a leap day", () => {
    expect(formatDateKey(addDays(dateOnlyUTC(2028, 2, 28), 1))).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("counts whole days forward and backward", () => {
    expect(daysBetween(dateOnlyUTC(2026, 3, 10), dateOnlyUTC(2026, 3, 15))).toBe(5);
    expect(daysBetween(dateOnlyUTC(2026, 3, 15), dateOnlyUTC(2026, 3, 10))).toBe(-5);
  });

  it("is 0 for the same day even with stray time components", () => {
    const a = new Date(Date.UTC(2026, 2, 10, 1));
    const b = new Date(Date.UTC(2026, 2, 10, 23));
    expect(daysBetween(a, b)).toBe(0);
  });

  it("counts across a DST changeover unaffected — everything is UTC", () => {
    // Europe/Kyiv springs forward on 2026-03-29. A local-time implementation
    // would return 30 or 32 here.
    expect(daysBetween(dateOnlyUTC(2026, 3, 15), dateOnlyUTC(2026, 4, 15))).toBe(31);
  });
});

describe("compareDateOnly / isSameDay", () => {
  it("orders and equates by calendar day", () => {
    const a = dateOnlyUTC(2026, 3, 10);
    const b = dateOnlyUTC(2026, 3, 11);
    expect(compareDateOnly(a, b)).toBeLessThan(0);
    expect(compareDateOnly(b, a)).toBeGreaterThan(0);
    expect(compareDateOnly(a, a)).toBe(0);
    expect(isSameDay(a, a)).toBe(true);
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe("todayUTC", () => {
  it("normalises the instant it is given", () => {
    const now = new Date(Date.UTC(2026, 2, 10, 18, 45));
    expect(formatDateKey(todayUTC(now))).toBe("2026-03-10");
  });
});
