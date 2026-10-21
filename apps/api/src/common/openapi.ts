import { applyDecorators } from "@nestjs/common";
import { ApiOkResponse, ApiResponse, type SchemaObject } from "@nestjs/swagger";
import * as z from "zod";
import { apiErrorSchema } from "../contracts";

/**
 * zod's `JSONSchema` and Nest's `SchemaObject` describe the same documents and
 * disagree in the type system: zod's permits a bare `boolean` where Nest's
 * insists on an object, among other JSON-Schema-isms Swagger never emits.
 *
 * One cast, in one place, rather than at each of forty call sites — and worth
 * it because the alternative was a DTO class per shape. `target:
 * "openapi-3.0"` is what makes the claim true at runtime.
 */
function asSchema(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "output",
  }) as SchemaObject;
}

/**
 * Publish a zod contract as this endpoint's response schema.
 *
 * The alternative was a DTO class per shape with `@ApiProperty` on every
 * field, which is what Nest expects. This API already refused that bargain
 * once — `common/zod.pipe.ts` explains why request validation does not use
 * class-validator: two definitions of a valid item drift, and the second one
 * always loses. Response shapes are the same problem, so they get the same
 * answer. `packages/core/src/contracts` holds one zod object per shape, the
 * SPA infers its types from it, `app.e2e.ts` parses real responses against it,
 * and this turns it into the OpenAPI document. Nothing here is written twice.
 *
 * `target: "openapi-3.0"` matters: without it zod emits JSON Schema 2020-12,
 * whose `type: ["string", "null"]` Swagger UI renders as an empty box. 3.0
 * wants `nullable: true`, and this app has nullable fields everywhere.
 */
export function ApiContract(schema: z.ZodType, options?: { array?: boolean; status?: number }) {
  const body = asSchema(schema);
  const payload: SchemaObject = options?.array
    ? { type: "array", items: body }
    : body;

  return applyDecorators(
    options?.status
      ? ApiResponse({ status: options.status, schema: payload })
      : ApiOkResponse({ schema: payload }),
  );
}

/**
 * The refusal envelope, documented once.
 *
 * Worth publishing precisely because it is the unusual part of this API: the
 * body carries a message KEY and its params rather than a sentence, so three
 * clients can render one Ukrainian catalogue. A reader of `/docs` who does not
 * see that will write `catch (e) { show(e.message) }` and ship English.
 */
export function ApiRefusal(...statuses: number[]) {
  const schema = asSchema(apiErrorSchema);
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        schema,
        description: "A rule refusal: switch on `key`, never on `message`.",
      }),
    ),
  );
}
