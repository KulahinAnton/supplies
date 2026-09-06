/**
 * The one file allowed to reach into `bot/` with a relative path, for the same
 * reason `core.ts` and `db.ts` are: a tsconfig `paths` alias resolves for the
 * type checker and is then left verbatim in the emitted JavaScript, so an
 * aliased import reaches Node as a specifier nothing can resolve. Reaching in
 * relatively means the emitted specifier still lands on something real inside
 * `dist`.
 *
 * Only Feature 19.1 is here. Everything else the bot does is the bot's own
 * business, and this API has no reason to know about it.
 */
export { sendDigestNow } from "../../../bot/digest-now";
