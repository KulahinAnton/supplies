import { Injectable, type ArgumentMetadata, type PipeTransform } from "@nestjs/common";

/**
 * An absent request body arrives at a handler as `{}`, never `undefined`.
 *
 * Several endpoints take a body whose every field is optional — "archive this
 * row", "tick this one off", "move it here" — so a client with nothing to say
 * sends no body at all. Fastify hands that to Nest as `undefined`, and
 * `body.archived` on `undefined` is a `TypeError`: a **500** for a request
 * that was perfectly valid. Found by ticking a free-text row off in the SPA,
 * which posts `/shopping/:id/check` with nothing in it.
 *
 * Fixing it per handler means writing `body?.x` in nine places and remembering
 * it in the tenth. Doing it once here means a handler cannot get it wrong, and
 * the parameter types stay honest — `{ archived?: boolean }` really is what
 * arrives.
 *
 * Scoped to `body` deliberately. A missing `@Param` or `@Query` is a different
 * situation with different right answers, and quietly turning either into `{}`
 * would hide a routing mistake rather than a client's silence.
 */
@Injectable()
export class EmptyBodyPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== "body") return value;
    return value ?? {};
  }
}
