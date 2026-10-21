import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { ApiRuleError } from "./api-rule-error";
import { firstIssueAsRuleMessage } from "../core";

/**
 * Feature 34 — request validation through the **same zod schemas** the Next
 * app's forms resolve against (`@supplies/core/validation`).
 *
 * Nest's own `ValidationPipe` is built on class-validator, which would mean a
 * second definition of a valid item living in DTO decorators. Two definitions
 * drift; the second one always loses.
 *
 * Failures come back as a message key, not prose, so the SPA and the phone
 * render the same Ukrainian the web app shows for the same mistake.
 */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;

    const rule = firstIssueAsRuleMessage(parsed.error);
    throw new ApiRuleError(422, rule.key, rule.params);
  }
}

/** `@Body(zodBody(itemSchema))` — reads better than `new ZodPipe(...)`. */
export function zodBody<T>(schema: ZodType<T>): ZodPipe<T> {
  return new ZodPipe(schema);
}
