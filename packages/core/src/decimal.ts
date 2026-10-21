/**
 * The engine's Decimal (docs/archive/ARCHITECTURE_REVIEW.md F4).
 *
 * `lib/stock.ts`, `lib/item-group.ts` and `lib/shopping.ts` used to reach
 * `Prisma.Decimal` through `import { Prisma } from "./generated/prisma/client"`.
 * That import is not free: the generated client opens with
 *
 *     import * as process from 'node:process'
 *     import * as path from 'node:path'
 *     import { fileURLToPath } from 'node:url'
 *
 * so a *value* import of it drags Node builtins into whatever bundle touches
 * the engine. The browser build already fails on that, and Metro would fail on
 * it identically — which is what stops the rules being shared with a React
 * Native app.
 *
 * `Prisma.Decimal` was never anything but decimal.js: the generated
 * `internal/prismaNamespace.ts` re-exports it verbatim from the Prisma runtime.
 * So depending on decimal.js directly changes no arithmetic. It only removes
 * the reason the engine needed a database client to add two numbers.
 */

import { Decimal } from "decimal.js";

export { Decimal };

/** Shared, because every engine module opened by constructing its own. */
export const ZERO = new Decimal(0);

/**
 * There are now TWO copies of decimal.js in a server process — this one, and
 * the one bundled inside the Prisma runtime — and rows read from the database
 * carry Prisma's. They interoperate, deliberately: decimal.js identifies
 * instances by a `toStringTag` on the prototype rather than by `instanceof`,
 * precisely so a value from another copy is still recognised as a Decimal.
 *
 * That is a real guarantee, not a happy accident, but it is also invisible —
 * nothing in the type system would tell you if a future version dropped it,
 * and the failure would be silently wrong arithmetic in a stock tracker. So
 * `lib/decimal.test.ts` pins it, and CI fails rather than a fridge inventory.
 *
 * Use this at boundaries where a value's origin is genuinely unknown. Reading
 * a Prisma row does not need it.
 */
export function toDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

/**
 * The database column is `Decimal(12,3)` and the convention is that quantities
 * reach Prisma as strings (CLAUDE.md), so this is the one way out of the
 * engine and into a write.
 */
export function toDbQuantity(value: Decimal): string {
  return value.toFixed(3);
}
