/**
 * The two state axes, re-exported for clients that consume them from the wire
 * rather than computing them.
 *
 * `stockState` and `itemExpiryState` live with the rules that produce them, in
 * `stock.ts` and `expiry.ts`; those modules import decimal.js and the period
 * helpers, which a client that only needs the union has no use for. This is
 * the type without the engine attached.
 */
export type { StockState } from "../stock";
export type { ExpiryState } from "../expiry";
