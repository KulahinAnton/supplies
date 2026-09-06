import { describe, expect, it } from "vitest";
import { Prisma } from "./generated/prisma/client";
import { Decimal, ZERO, toDbQuantity, toDecimal } from "../../core/src/decimal";

/**
 * Phase 0.2 left two copies of decimal.js in a server process: the engine's
 * own, and the one inside the Prisma runtime that database rows arrive
 * carrying. Everything downstream — FEFO, shortfalls, group totals — assumes
 * those two can be added together.
 *
 * They can, because decimal.js recognises instances by a prototype
 * `toStringTag` rather than by `instanceof`, specifically so values from a
 * second copy still count. Nothing in the type system checks that, and if a
 * future decimal.js or Prisma release changed it the symptom would be wrong
 * quantities rather than a crash. Hence these tests.
 */

describe("Decimal across the Prisma boundary", () => {
  it("adds a Prisma decimal to an engine decimal", () => {
    const fromDb = new Prisma.Decimal("2.500");
    const inEngine = new Decimal("1.250");
    expect(inEngine.plus(fromDb).toFixed(3)).toBe("3.750");
    expect(fromDb.plus(inEngine).toFixed(3)).toBe("3.750");
  });

  it("compares across copies", () => {
    const fromDb = new Prisma.Decimal("0.001");
    expect(fromDb.greaterThan(ZERO)).toBe(true);
    expect(new Decimal("0.000").lessThan(fromDb)).toBe(true);
  });

  it("picks the smaller of one from each copy — this is what FEFO does", () => {
    // `planConsume` calls Decimal.min(batch.quantity, outstanding), where the
    // batch came from Prisma and the outstanding amount was computed here.
    const fromDb = new Prisma.Decimal("4");
    const inEngine = new Decimal("7");
    expect(Decimal.min(fromDb, inEngine).toFixed(0)).toBe("4");
    expect(Decimal.min(inEngine, fromDb).toFixed(0)).toBe("4");
  });

  it("recognises a Prisma decimal as a decimal at all", () => {
    // The load-bearing assertion. If this ever goes false, the three above
    // are the ones that will have started returning nonsense.
    expect(new Decimal(new Prisma.Decimal("12.345")).toFixed(3)).toBe("12.345");
  });

  it("agrees on the values the schema stores", () => {
    // Decimal(12,3): the widest quantity a batch can hold.
    const wide = "999999999.999";
    expect(new Decimal(wide).equals(new Prisma.Decimal(wide))).toBe(true);
  });
});

describe("toDecimal", () => {
  it("passes an engine decimal straight through", () => {
    const value = new Decimal("1.5");
    expect(toDecimal(value)).toBe(value);
  });

  it("converts strings, numbers, and a Prisma decimal", () => {
    expect(toDecimal("2.250").toFixed(3)).toBe("2.250");
    expect(toDecimal(3).toFixed(3)).toBe("3.000");
    expect(toDecimal(new Prisma.Decimal("4.5")).toFixed(3)).toBe("4.500");
  });
});

describe("toDbQuantity", () => {
  it("always writes three decimal places, as the column expects", () => {
    expect(toDbQuantity(new Decimal("2"))).toBe("2.000");
    expect(toDbQuantity(new Decimal("0.1"))).toBe("0.100");
  });

  it("does not use exponential notation for values Postgres must parse", () => {
    // `toString()` would render 1e-7 and 1e+21 in exponential form; toFixed
    // does not. Only toFixed is safe to hand to a numeric column.
    expect(toDbQuantity(new Decimal("0.0000001"))).toBe("0.000");
    expect(toDbQuantity(new Decimal("1e7"))).toBe("10000000.000");
  });
});
