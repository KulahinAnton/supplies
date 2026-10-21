# apps/api — NestJS over the shared engine

The HTTP API the SPA and the React Native app talk to. The rules it enforces:
[PROJECT_PROMPT.md](../../PROJECT_PROMPT.md) Feature 34. The auth design and
the configuration model: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
§5 and §8. Not deployed yet; what the first deploy needs is in
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) §6.

Nothing here owns a rule. The rules are in
[`@supplies/core`](../../packages/core/CLAUDE.md); this is the layer that
authenticates a caller, scopes them to a household, and hands the engine rows
from the database. Same arrangement the Telegram bot has had all along.

## Running it

```bash
pnpm api:dev      # watch mode, port 3200
pnpm api:build
pnpm api:start    # node dist/apps/api/src/main.js
```

Needs `pnpm db:up` and an `API_JWT_SECRET` in the repo root's `.env` — the one
value with no default, deliberately. Everything else works on localhost out of
the box; see `.env.example`.

- `GET /health` — liveness, touches nothing
- `GET /health/ready` — readiness, `SELECT 1`
- `GET /docs` — OpenAPI
- Everything else is under `/api`

## Three toolchain decisions, and the dead end between them

**CommonJS, with `moduleFormat = "cjs"` on the generator.** Prisma 7's
`prisma-client` generator emits ESM by default, and its output carries
`import.meta` — which tsc happily passes through into a CommonJS build, leaving
a file with both `exports` and ESM syntax. Node's module detection then loads it
as ESM and dies on `exports is not defined`. The generator option produces a
CommonJS client with no `import.meta`, and everything downstream falls out.

**The ESM route is a dead end, and it is worth knowing why** before anyone tries
it again. Making the API `"type": "module"` with `nodenext` works right up until
the Next.js build: Node ESM demands file extensions on relative imports, tsc
*never adds them on emit*, so `packages/core` would have to carry `.js`
extensions in its source — and Turbopack does not resolve `./decimal.js` to
`decimal.ts`. One of the two consumers breaks whichever way core is written. The
generator option avoids the choice entirely.

**Four bridge files, and only they may use `../../../`.** A tsconfig `paths`
alias resolves for the type checker and is left verbatim in the emitted
JavaScript, so an aliased import reaches Node as a specifier nothing can
resolve. `src/core.ts`, `src/db.ts`, `src/contracts.ts` and `src/bot.ts`
re-export what the API needs from `packages/core`, `packages/db`,
`packages/core/src/contracts` and `bot/`, relatively, so the emitted
specifier still lands on something real inside `dist`. Every other file
imports `./core`, `./db` and so on. Because `nest build` compiles those
packages' sources too, they import each other relatively as well.

There is **one** generated Prisma client, in `packages/db`. The API briefly had
its own; `moduleFormat = "cjs"` on the shared generator made that
unnecessary.

## No class-validator

`ValidationPipe` is deliberately absent. Nest's default is built on
class-validator, and this API validates with the zod schemas in
`@supplies/core/validation` — the same objects the Next app's forms resolve
against, and the SPA's and the phone's. Two validation libraries would
mean two definitions of a valid item, and the second one always drifts.

## Config fails at boot, loudly

`src/config/env.ts` validates the environment once, before a provider is
constructed, and throws with every bad variable named at once. A CORS origin
that is not a URL, or `SameSite=None` without `Secure`, is a refusal to start —
not a browser mystery at 2am. `src/config/env.test.ts` covers both.

Every origin is a variable with a localhost default (docs/ARCHITECTURE.md §5).
No domain appears anywhere in this source tree.

## Rate limiting is in-memory

`ThrottlerModule` counts in the process: 120 requests a minute per client,
and 6 for recipe suggestions, which spend money. That is correct for one
long-lived container and is one of the reasons this API does not belong on a
serverless platform, where every request would arrive at a fresh instance and
the counter would always read zero.

**The counter keys on the client address**, which behind a host's proxy is
the proxy, unless `TRUST_PROXY` says how many proxies to believe
(docs/DEPLOYMENT.md §6). It is read in `main.ts` before Nest starts, because
`trustProxy` is a property of the Fastify instance, which exists before the
`ConfigService` does.

**No stricter limit on the credential endpoints yet.** `login` and friends
share the global 120 a minute. A tighter `@Throttle` there would trip the e2e
suite, which signs in about fifty times from one address, so it needs a
configurable limit to land with it; see docs/ROADMAP.md.

## Tests

```bash
pnpm test:api        # unit — tokens and config, no database, ~0.3s
pnpm test:api:e2e    # the whole app against a live seeded database
```

The split is the same bargain `pnpm test` and `pnpm test:db` make in the root
package. The unit suite runs on every commit; the e2e suite needs Docker and
`pnpm db:seed`, so it stays out of the hook — a gate that fails because Docker
is not running teaches people to reach for `--no-verify`.

What the e2e suite is for is the wiring nothing else can see: the guard actually
refusing, zod actually rejecting, an `ActionResult` actually becoming a 422, and
a replayed refresh token actually revoking every session. The arithmetic
underneath is covered in microseconds by `tokens.test.ts`; this covers whether
it is plugged in.

It mutates the demo household and puts back what it changed, so it runs twice in
a row.

**It also signs you out.** The refresh-replay check revokes every session for
`anton@example.com` on purpose — that is Feature 34's theft response — so a
browser logged in as the demo user is logged out whenever the suite runs. Log
back in; nothing is broken.

## No handler sees an undefined body

`EmptyBodyPipe` is registered globally and turns an absent request body into
`{}`. Several endpoints take a body whose fields are all optional, so a client
with nothing to say sends nothing — and Fastify hands that to Nest as
`undefined`, which made `body.archived` a `TypeError` and a **500** for a
perfectly valid request. Nine handlers had that shape; ticking a free-text row
off in the SPA is what found it.

It is scoped to `body`. A missing `@Param` or `@Query` is a different situation
with different right answers, and quietly turning either into `{}` would hide a
routing mistake rather than a client's silence.
