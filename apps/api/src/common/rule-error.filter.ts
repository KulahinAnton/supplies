import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { ApiErrorBody } from "./api-rule-error";
import { MESSAGES } from "../core";

/**
 * Feature 34 — one error shape for every failure, so a client never has to
 * guess whether `error.key` exists.
 *
 * `ApiRuleError` already carries a key; Nest's own exceptions (404 from an
 * unmatched route, 429 from the throttler) do not, so they are mapped onto
 * keys the catalogue already has. Anything else is a bug, and becomes a plain
 * 500 with `error.unexpected` — never the thrown message, which is how stack
 * traces and connection strings end up in a response body.
 */
@Catch()
export class RuleErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "object" && body !== null && "key" in body) {
        void reply.status(status).send(body);
        return;
      }

      const fallback: ApiErrorBody = {
        statusCode: status,
        key: status === 429 ? "error.rateLimited" : "error.unexpected",
        message:
          status === 429
            ? MESSAGES["error.rateLimited"]
            : typeof body === "string"
              ? body
              : ((body as { message?: string }).message ?? MESSAGES["error.unexpected"]),
      };
      void reply.status(status).send(fallback);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const body: ApiErrorBody = {
      statusCode: 500,
      key: "error.unexpected",
      message: MESSAGES["error.unexpected"],
    };
    void reply.status(500).send(body);
  }
}
