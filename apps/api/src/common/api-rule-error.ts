import { HttpException } from "@nestjs/common";
import { MESSAGES, renderMessage, type MessageKey } from "../core";

/**
 * Feature 34 — the error envelope, carrying a message **key** and its params
 * rather than a formatted sentence.
 *
 * This is PROJECT_PROMPT.md §8 extended over HTTP. Pure rules already return
 * `RuleMessage` objects so that tests assert on keys, not prose; sending the
 * key over the wire keeps that property across the network, and means three
 * clients render one string from one catalogue instead of the API picking the
 * wording for all of them.
 *
 * The rendered Ukrainian ships too, in `message`. A client that has not been
 * taught the key still shows something a person can read, and `curl` output is
 * legible — which matters more than the few bytes it costs.
 */
export type ApiErrorBody = {
  statusCode: number;
  /** The stable identifier. Clients switch on this. */
  key: MessageKey;
  /** Interpolation values, when the key takes any. */
  params?: Record<string, string | number>;
  /** The same message rendered in Ukrainian, for clients that just display it. */
  message: string;
};

export class ApiRuleError extends HttpException {
  constructor(
    status: number,
    key: MessageKey,
    params?: Record<string, string | number>,
  ) {
    const body: ApiErrorBody = {
      statusCode: status,
      key,
      params,
      message: renderMessage({ key, params }),
    };
    super(body, status);
  }

  /** True when `key` names something in the catalogue — used by the filter. */
  static known(key: string): key is MessageKey {
    return key in MESSAGES;
  }
}
