# apps/api — NestJS over the shared engine

The HTTP API the SPA and the React Native app will both talk to. Plan and
phases: [SPA_API_PORT.md](../../SPA_API_PORT.md).

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

**Its own generated client, and one file allowed `../../../`.** A tsconfig
`paths` alias resolves for the type checker and is left verbatim in the emitted
JavaScript, so an aliased import reaches Node as a specifier nothing can
resolve. Hence a second generator writing to `src/generated/prisma`, and
`src/core.ts` reaching into `packages/core/src` relatively so the emitted
specifier still lands on something real inside `dist`. Every other file imports
`./core`.

## No class-validator

`ValidationPipe` is deliberately absent. Nest's default is built on
class-validator, and this API validates with the zod schemas in
`@supplies/core/validation` — the same objects the Next app's forms resolve
against, and soon the SPA's and the phone's. Two validation libraries would
mean two definitions of a valid item, and the second one always drifts.

## Config fails at boot, loudly

`src/config/env.ts` validates the environment once, before a provider is
constructed, and throws with every bad variable named at once. A CORS origin
that is not a URL, or `SameSite=None` without `Secure`, is a refusal to start —
not a browser mystery at 2am. `src/config/env.test.ts` covers both.

Every origin is a variable with a localhost default (SPA_API_PORT.md §4.2). No
domain appears anywhere in this source tree.

## Rate limiting is in-memory

`ThrottlerModule` counts in the process, which is correct for one long-lived
container and is one of the reasons this API does not belong on a serverless
platform — every request would arrive at a fresh instance and the counter would
always read zero.
