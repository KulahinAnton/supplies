/**
 * Units of measure, owned by the engine rather than by the database client.
 *
 * These are the same six values as the `Unit` enum in `prisma/schema.prisma`,
 * declared here so that `lib/format.ts`, `lib/stock.ts` and everything else
 * shareable stops importing `@/lib/generated/prisma/enums`. The generated file
 * is harmless to bundle — it is plain constants with no Node builtins — but a
 * package that cannot be typechecked until `prisma generate` has run is not a
 * package a React Native build can depend on.
 *
 * The two definitions must agree, and `lib/units.test.ts` is what makes that
 * true: it compares this list against the generated enum at test time, so
 * adding a unit to the schema without adding it here fails in CI. That check
 * lives in a test on purpose — the assertion needs Prisma, and this module is
 * the one thing that must not.
 */

export const UNITS = [
  "PIECE",
  "PACK",
  "GRAM",
  "KILOGRAM",
  "MILLILITRE",
  "LITRE",
] as const;

export type Unit = (typeof UNITS)[number];

/**
 * Reasons a batch's quantity changed. Same arrangement, same reason: the
 * digest and the movement log describe these, and neither should need a
 * database client to do it.
 */
export const MOVEMENT_REASONS = [
  "PURCHASE",
  "CONSUME",
  "WASTE",
  "CORRECTION",
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];
