/**
 * The API's window onto `packages/db`, and the only file here allowed
 * `../../../`. Same reason as `src/core.ts`: a tsconfig `paths` alias resolves
 * for the type checker and is left verbatim in the emitted JavaScript, so an
 * aliased import reaches Node as a specifier nothing can resolve.
 *
 * Everything below is shared with the Next app, the Telegram bot and the daily
 * digest. PROJECT_PROMPT.md Feature 34: the API is a third front end, never a
 * third implementation — an endpoint that computed a stock state itself would
 * be a second definition of "low".
 */

export { prisma } from "../../../packages/db/src/prisma";

export {
  getArchivedItems,
  getAttentionCounts,
  getCategoriesAndLocations,
  getDashboard,
  getHousehold,
  getItemDetail,
  getItemGroupDetail,
  getItemGroupViews,
  getItemGroups,
  getItemNames,
  getItemViews,
  getItemsPage,
  getMembers,
  getRecentMovements,
  getRestockEntries,
  getShoppingView,
  hasTelegramLink,
  type DashboardData,
  type ItemView,
} from "../../../packages/db/src/queries";

export {
  addStock,
  consume,
  consumeBatch,
  correctBatch,
  discardBatch,
  type Actor,
} from "../../../packages/db/src/stock-service";

