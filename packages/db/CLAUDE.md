# packages/db — where the database meets the rules

`@supplies/db` is the Prisma client, the read queries and the single stock write
path, shared by every consumer: the Next app, the Telegram bot, the daily
digest, the scripts and the NestJS API.

It exists because PROJECT_PROMPT.md Feature 34 made the API a **third front
end**, and a front end that wrote its own queries would be a third
implementation. `bot/CLAUDE.md` has made the same promise since Feature 9.

## What is here

- `prisma.ts` — the client singleton (driver adapter over `pg`)
- `queries.ts` — the only place the DB meets the pure engine; pages and
  endpoints never compute states themselves
- `stock-service.ts` — the single write path, taking an `Actor` rather than
  reading a session, which is what makes "one implementation, N front ends" real
- `src/generated/prisma` — the client, gitignored, `pnpm prisma generate`

`lib/queries.rsc.ts` stays in the Next app: it wraps these readers in
`React.cache` and imports `server-only`, neither of which the bot or the API can
have.

## One generated client, in CommonJS

There was briefly a second one under `apps/api`. The reason it is gone matters:
`moduleFormat = "cjs"` in `prisma/schema.prisma` produces a client that Nest can
compile *and* that Next and Vite bundle without complaint, so one client can
serve everyone — which is the precondition for this package existing at all.

The ESM default carries `import.meta`, which survives a CommonJS build and
leaves a file Node loads as ESM and then rejects.

## Imports into `packages/core` are relative, on purpose

`import { selectItems } from "../../core/src/item-filter"` rather than
`@supplies/core/item-filter`.

**tsc does not rewrite module specifiers.** A package specifier survives into the
emitted JavaScript, and at runtime Node resolves `@supplies/core/item-filter`
through the exports map to a `.ts` file it cannot execute. The API compiles
these sources into its own `dist`, so the specifier has to be one that still
points at something after compilation.

This has now bitten three times — tsconfig `paths` in the API, the API reaching
for core, and this. The rule to remember: **anything compiled by `nest build`
must import across packages relatively.** Bundled consumers (Next, Vite, Metro)
are happy either way.

## `DATABASE_URL` is read at import time

`prisma.ts` builds its client at module scope, which is what a singleton has to
do. That is earlier than any framework's config loading, so `apps/api` has
`src/env-first.ts` as the literal first import in `main.ts`. Without it the
client is constructed with no connection string and every query fails at
runtime, with nothing in the config validation to warn you.
