/**
 * The shape every server action returns. Actions never throw at the client —
 * a rule violation is data, not an exception, so forms can render it inline.
 */

import type { RuleMessage } from "@/lib/messages";

export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? { data?: undefined } : { data: T }))
  | { ok: false; error: RuleMessage };

export function actionOk(): ActionResult<void>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T) {
  return { ok: true as const, data };
}

export function actionError(error: RuleMessage): ActionResult<never> {
  return { ok: false, error };
}
