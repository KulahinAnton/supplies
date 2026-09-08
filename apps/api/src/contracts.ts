/**
 * The API's window onto `packages/core/src/contracts`, and — like `core.ts`
 * and `db.ts` — the only file here allowed to reach across the workspace with
 * `../../../`.
 *
 * Same reason as the other two: **tsc does not rewrite module specifiers.** A
 * `@supplies/core/contracts/items` import would survive compilation verbatim,
 * and at runtime Node would resolve it through the exports map to a `.ts` file
 * it cannot execute. See `apps/api/src/core.ts` for the full account.
 */
export * from "../../../packages/core/src/contracts/common";
export * from "../../../packages/core/src/contracts/items";
export * from "../../../packages/core/src/contracts/dashboard";
export * from "../../../packages/core/src/contracts/shopping";
export * from "../../../packages/core/src/contracts/settings";
export * from "../../../packages/core/src/contracts/auth";
