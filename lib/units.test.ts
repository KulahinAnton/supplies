import { describe, expect, it } from "vitest";
import {
  MovementReason as PrismaMovementReason,
  Unit as PrismaUnit,
} from "@/lib/generated/prisma/enums";
import { MOVEMENT_REASONS, UNITS } from "@supplies/core/units";

/**
 * The seam that keeps `lib/units.ts` honest.
 *
 * The engine declares its own units so it does not need the generated Prisma
 * client, which is the whole point of Phase 0.2. The cost of that independence
 * is two lists that could drift, and drift here is not a type error anywhere —
 * it is an item saved with a unit the formatter has never heard of.
 *
 * So the comparison happens once, in a test, where importing Prisma is free.
 */

describe("units match the schema", () => {
  it("has exactly the schema's units, and no others", () => {
    expect([...UNITS].sort()).toEqual(Object.values(PrismaUnit).sort());
  });

  it("has exactly the schema's movement reasons", () => {
    expect([...MOVEMENT_REASONS].sort()).toEqual(
      Object.values(PrismaMovementReason).sort(),
    );
  });

  it("keeps the units in the schema's declared order", () => {
    // Not cosmetic: the order is what every <select> in the app renders, and
    // sorting alphabetically would silently reshuffle six dropdowns.
    expect([...UNITS]).toEqual(Object.values(PrismaUnit));
  });
});
