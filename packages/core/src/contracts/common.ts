import * as z from "zod";
import { MOVEMENT_REASONS, UNITS } from "../units";

/**
 * The wire, described once.
 *
 * SPA_API_PORT.md Phase 2.2 asked for types generated from the OpenAPI
 * document. That turned out to be the wrong direction. The document is
 * produced by decorators, and nothing checks a decorator against what the
 * handler actually returns — so generating clients from it would have made a
 * hand-maintained description the source of truth and called it generated.
 *
 * These schemas go the other way. One zod object per response shape yields
 * three things that cannot disagree:
 *
 * - the TypeScript type the SPA and the phone consume (`z.infer`)
 * - the OpenAPI schema `/docs` publishes (`z.toJSONSchema`, no dependency)
 * - a runtime parser the API's own e2e suite runs every response through
 *
 * The third is what makes the first two true. A schema nothing validates is a
 * comment; `apps/api/src/app.e2e.ts` parses real responses from a real
 * database against these, so the day a query changes shape, the contract test
 * says so rather than the SPA rendering `undefined` in production.
 *
 * They live in `packages/core` because that is the one package a browser
 * bundle, a Metro bundle and the API may all import. `packages/db` may not be
 * reached from a client, and `apps/api` may not be reached from anywhere.
 */

/**
 * A quantity, on the wire.
 *
 * `Decimal(12,3)` in the column and decimal.js in the engine — and a STRING
 * here, because JSON has no decimal type and `Number()` on "0.1" + "0.2" is
 * how a stock tracker starts disagreeing with itself. Clients hand these to
 * `@supplies/core/format` or `toDecimal`, never to arithmetic.
 */
export const quantityString = z.string();

/**
 * A date, on the wire: an ISO 8601 string, because JSON has no date type.
 *
 * Not `z.iso.datetime()`. Prisma returns `@db.Date` columns as midnight-UTC
 * `Date` objects and `@db.Timestamp` ones with a time, so both spellings
 * arrive here and a stricter rule would reject half the real traffic. The
 * clients' revivers are what turn these back into `Date`.
 */
export const dateString = z.string();

export const unitSchema = z.enum(UNITS);
export const movementReasonSchema = z.enum(MOVEMENT_REASONS);
export const stockStateSchema = z.enum(["OUT", "LOW", "OK"]);
export const expiryStateSchema = z.enum(["EXPIRED", "SOON", "FRESH", "NONE"]);

/** Who did something. Never an email — the movement log is not a directory. */
export const actorNameSchema = z.object({ name: z.string() });

/**
 * The API's refusal envelope: a message KEY and its params, never prose.
 *
 * Three clients render one Ukrainian catalogue (§8), so the sentence is built
 * where it is shown. `message` is included as a courtesy for anything reading
 * the API by hand — switch on `key`, never on it.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  message: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
