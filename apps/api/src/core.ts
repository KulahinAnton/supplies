/**
 * The one file in this API that reaches across the workspace with `../../../`,
 * so that no other one has to.
 *
 * **Why not `@supplies/core/stock`.** A tsconfig `paths` alias resolves for the
 * type checker and is then left *verbatim* in the emitted JavaScript — tsc does
 * not rewrite module specifiers. At runtime Node would resolve
 * `@supplies/core/stock` through the package's exports map to
 * `packages/core/src/stock.ts`, and Node cannot execute TypeScript. The build
 * succeeds and the process dies on its first import.
 *
 * A relative specifier survives compilation unchanged, and because the API's
 * `rootDir` works out to the repo root, `dist` mirrors the workspace layout:
 * `dist/apps/api/src/core.js` → `../../../packages/core/src/units.js` lands on
 * `dist/packages/core/src/units.js`, which `nest build` emitted from the same
 * sources. Source and output agree because the shape is the same.
 *
 * The alternative was giving `packages/core` a build step and consuming its
 * `dist`. That is the conventional answer and it stays available, but it would
 * make every core edit need a rebuild before the API saw it, and it would put a
 * build-order dependency between two packages that currently have none.
 */

export {
  MOVEMENT_REASONS,
  UNITS,
  type MovementReason,
  type Unit,
} from "../../../packages/core/src/units";

export {
  Decimal,
  ZERO,
  toDbQuantity,
  toDecimal,
} from "../../../packages/core/src/decimal";

export {
  MESSAGES,
  renderMessage,
  ruleMessage,
  type MessageKey,
  type RuleMessage,
} from "../../../packages/core/src/messages";

export {
  firstIssueAsRuleMessage,
} from "../../../packages/core/src/validation/shared";

export { loginSchema, registerSchema } from "../../../packages/core/src/validation/auth";

export {
  DEFAULT_CATEGORIES,
  DEFAULT_LOCATIONS,
  defaultHouseholdName,
} from "../../../packages/core/src/household-defaults";

export {
  addStockSchema,
  consumeBatchSchema,
  consumeSchema,
  correctionSchema,
  discardSchema,
} from "../../../packages/core/src/validation/stock";

export { parseItemListSearch } from "../../../packages/core/src/item-list-params";

export type { ActionResult } from "../../../packages/core/src/action-result";

export { itemSchema, updateItemSchema } from "../../../packages/core/src/validation/item";

export {
  categorySchema,
  householdSettingsSchema,
  itemGroupSchema,
  locationSchema,
} from "../../../packages/core/src/validation/settings";

export { createLinkToken } from "../../../packages/core/src/telegram-link";
