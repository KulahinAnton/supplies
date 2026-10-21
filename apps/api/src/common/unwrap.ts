import { ApiRuleError } from "./api-rule-error";
import type { ActionResult } from "../core";

/**
 * `ActionResult` → HTTP, in one place.
 *
 * The shape the whole codebase already speaks, and its failures carry a
 * message KEY — so turning one into an HTTP error loses nothing. The key
 * crosses the wire and the client renders the same Ukrainian the web app shows
 * for the same refusal.
 *
 * 422 rather than 400: the request was well-formed and a *rule* declined it.
 * "You only have 2 left" is not a malformed request.
 */
export function unwrap<T>(result: ActionResult<T>): T | { ok: true } {
  if (!result.ok) throw new ApiRuleError(422, result.error.key, result.error.params);
  return result.data ?? { ok: true };
}
