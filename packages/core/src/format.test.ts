import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatExpiryLabel,
  formatQuantity,
  formatQuantityWithUnit,
  formatQuantityWithUnitLong,
  pluralUk,
  selectUkPlural,
  UNIT_PLURAL,
} from "./format";
import { dateOnlyUTC } from "./period";

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

  it("groups thousands with a no-break space", () => {
    // Spelled as an escape: a literal U+00A0 is indistinguishable from a plain
    // space in a diff, and only one of them passes.
    const nbsp = "\u00A0";
    expect(formatQuantity("1234")).toBe(`1${nbsp}234`);
    expect(formatQuantity("1234.5")).toBe(`1${nbsp}234,5`);
    expect(formatQuantity("1234567")).toBe(`1${nbsp}234${nbsp}567`);
  });

  it("shows a value it cannot read rather than inventing one", () => {
    expect(formatQuantity("NaN")).toBe("NaN");
    expect(formatQuantity("1e5")).toBe("1e5");
  });
});

/**
 * The grouping is written out rather than asked of `Intl.NumberFormat`,
 * because Hermes rejects the BigInt this used to pass it and silently returned
 * the raw wire string — a decimal POINT on every quantity in the phone app.
 * Same bargain as `selectUkPlural`: hand-written, then checked against the
 * implementation it replaces.
 */
describe("formatQuantity grouping against Intl.NumberFormat", () => {
  const reference = new Intl.NumberFormat("uk-UA", {
    useGrouping: true,
    maximumFractionDigits: 0,
  });

  it("agrees on every integer from 0 to 2000", () => {
    const disagreements: string[] = [];
    for (let n = 0; n <= 2000; n++) {
      const ours = formatQuantity(String(n));
      const theirs = reference.format(n);
      if (ours !== theirs) disagreements.push(`${n}: ours=${ours} intl=${theirs}`);
    }
    expect(disagreements).toEqual([]);
  });

  it("agrees across four orders of magnitude", () => {
    // `Decimal(12,3)` tops out at nine integer digits, so this covers the
    // column's whole range and then some.
    for (const n of [999, 1000, 9999, 10_000, 123_456, 999_999_999]) {
      expect(formatQuantity(String(n))).toBe(reference.format(n));
    }
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

describe("formatExpiryLabel", () => {
  const today = dateOnlyUTC(2026, 3, 10);
  const label = (y: number, m: number, d: number) =>
    formatExpiryLabel(dateOnlyUTC(y, m, d), today);

  /**
   * The regression this function exists for. The old formatter returned a
   * bare "через 7 днів" and the badge prefixed «Придатне», which told the
   * user the food BECOMES edible in 7 days when it in fact goes off then.
   * The old tests passed throughout, because they asserted the fragment and
   * never the sentence. So assert the sentence.
   */
  it("says the food stays good for N more days, not that it starts then", () => {
    expect(label(2026, 3, 17)).toBe("придатне ще 7 днів");
    expect(label(2026, 3, 17)).not.toContain("через");
  });

  it("says a date arriving today or tomorrow is the deadline, not the promise", () => {
    // Both are SOON, not EXPIRED (batchExpiryState is inclusive of today),
    // so «придатне» would be technically true and still read as reassurance.
    expect(label(2026, 3, 10)).toBe("спливає сьогодні");
    expect(label(2026, 3, 11)).toBe("спливає завтра");
  });

  it("names an expired item as expired, in the digest as well as the badge", () => {
    expect(label(2026, 3, 9)).toBe("прострочено вчора");
    expect(label(2026, 3, 7)).toBe("прострочено 3 дні тому");
  });

  it("declines the day word in both directions", () => {
    expect(label(2026, 3, 12)).toBe("придатне ще 2 дні");
    expect(label(2026, 3, 15)).toBe("придатне ще 5 днів");
    expect(label(2026, 3, 31)).toBe("придатне ще 21 день");
    expect(label(2026, 3, 5)).toBe("прострочено 5 днів тому");
  });

  it("never claims a future date is already expired, or the reverse", () => {
    for (let offset = -10; offset <= 10; offset += 1) {
      const text = formatExpiryLabel(dateOnlyUTC(2026, 3, 10 + offset), today);
      if (offset < 0) expect(text.startsWith("прострочено")).toBe(true);
      else expect(text.startsWith("прострочено")).toBe(false);
    }
  });
});

describe("formatDateTime", () => {
  it("renders in Kyiv time, not the server's", () => {
    // The bug: no timeZone meant the process decided. Vercel runs UTC, so
    // production showed every movement 2–3 hours early. September is EEST
    // (UTC+3), so 09:30Z is half past noon at home.
    expect(formatDateTime(new Date("2026-09-01T09:30:00Z"))).toBe("01.09.2026, 12:30");
  });

  it("follows Ukrainian DST rather than a fixed offset", () => {
    // January is EET (UTC+2). A hardcoded +3 would read 11:30 here and be
    // wrong for half the year.
    expect(formatDateTime(new Date("2026-01-15T09:30:00Z"))).toBe("15.01.2026, 11:30");
  });

  it("can cross a date boundary, which is the point of pinning the zone", () => {
    // 23:30 UTC on the 1st is already 02:30 on the 2nd at home. Rendering
    // this in UTC would put the movement on the wrong day, not just the
    // wrong hour.
    expect(formatDateTime(new Date("2026-09-01T23:30:00Z"))).toBe("02.09.2026, 02:30");
  });
});

describe("formatDate", () => {
  it("stays in UTC, because date-only values are UTC midnight", () => {
    // @db.Date comes back as midnight UTC. Formatting it in Kyiv would still
    // land on the same day, but the pin is what guarantees that rather than
    // the offset happening to be positive.
    expect(formatDate(new Date("2026-09-05T00:00:00Z"))).toBe("05.09.2026");
  });
});

/**
 * The check that lets `selectUkPlural` be hand-written.
 *
 * It replaced `new Intl.PluralRules("uk-UA")`, which Hermes does not have —
 * the React Native app crashed on load at that line while the same file's
 * `DateTimeFormat` and `NumberFormat` were fine. A rule written out by hand is
 * only safe if something proves it agrees with the one it replaced, so this
 * runs both over every integer to 1000 and a spread of decimals.
 *
 * Node has the real implementation, so this test is meaningful precisely where
 * the app is not: on the machine that runs CI.
 */
describe("selectUkPlural against Intl.PluralRules", () => {
  const reference = new Intl.PluralRules("uk-UA");

  it("agrees on every integer from 0 to 1000", () => {
    const disagreements: string[] = [];
    for (let n = 0; n <= 1000; n++) {
      const ours = selectUkPlural(n);
      const theirs = reference.select(n);
      if (ours !== theirs) disagreements.push(`${n}: ours=${ours} intl=${theirs}`);
    }
    expect(disagreements).toEqual([]);
  });

  it("agrees on the decimals, which are all `other`", () => {
    for (const n of [0.5, 1.5, 2.5, 4.5, 5.5, 11.5, 21.5, 100.25]) {
      expect(selectUkPlural(n)).toBe(reference.select(n));
    }
  });

  it("covers the three categories at the boundaries the rule turns on", () => {
    // 11–14 are the trap: they end in 1–4 but take `many`, which is why
    // `n === 1 ? a : b` is wrong and why this rule has the mod-100 clauses.
    expect(selectUkPlural(1)).toBe("one");
    expect(selectUkPlural(21)).toBe("one");
    expect(selectUkPlural(11)).toBe("many");
    expect(selectUkPlural(2)).toBe("few");
    expect(selectUkPlural(22)).toBe("few");
    expect(selectUkPlural(12)).toBe("many");
    expect(selectUkPlural(5)).toBe("many");
    expect(selectUkPlural(0)).toBe("many");
  });

  it("treats a negative count like its magnitude", () => {
    // Nothing in the app shows a negative quantity, but a movement delta is
    // negative and `formatQuantityWithUnitLong` is one refactor away from
    // being handed one. Falling into `many` for -1 would read as «-1 штук».
    expect(selectUkPlural(-1)).toBe("one");
    expect(selectUkPlural(-2)).toBe("few");
    expect(selectUkPlural(-11)).toBe("many");
  });
});
