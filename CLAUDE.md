# Supplies — household stock & expiry tracker

A family app for tracking what the household has in stock, what is running low
and what is about to expire. One household, many equal members, one shared
inventory. **Four clients over one engine**: a Next.js web app, a Vite SPA, an
Expo phone app and a Telegram bot, plus a NestJS API that the SPA and the phone
talk to.

| Doc | Holds |
|---|---|
| [PROJECT_PROMPT.md](PROJECT_PROMPT.md) | **the spec**: domain rules (§3), data model (§4), every feature, conventions (§7), Ukrainian-only (§8) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the code is shaped and why: boundaries, sharing rule, config, auth, hosting, decision log |
| [docs/ROADMAP.md](docs/ROADMAP.md) | what is not built, known defects, and proposed improvements, in priority order |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + Neon, the pending cut-over, what the API and SPA need before their first deploy, backups |
| [CONTRIBUTING.md](CONTRIBUTING.md) | branch → PR → CI → squash; the gates; the PR template |
| `*/CLAUDE.md` | conventions and traps for the directory they sit in |
| [docs/archive/](docs/archive/README.md) | superseded plans and narratives. History, not instructions |

## Status

- Features 0–35 are implemented, except **31 (offline), which is parked**.
  `main` (production on Vercel + Neon) has Features 0–32 with the Next app at
  the repo root.
- **This branch, `feature/shared-core`, is not merged.** It holds the
  workspace split (`apps/web`), the API, the SPA, the phone app and four
  additive migrations. Merging it is a production cut-over:
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §3.
- The API and the SPA have never been deployed. The phone app works on a LAN
  only until the API is.
- No automated check exercises the camera scan on the web, drag gestures, or
  push delivery. The phone's scan has been driven end to end on the emulator
  (`pnpm barcode`, see [apps/mobile/CLAUDE.md](apps/mobile/CLAUDE.md)).

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 16.3 (App Router), React 19.2, TypeScript strict. Server actions for mutations |
| API | NestJS 11 + Fastify, zod (no class-validator), OpenAPI at `/docs` |
| SPA | Vite, React Router 7, TanStack Query 5 |
| Phone | Expo SDK 57, Expo Router, NativeWind 4, TanStack Query |
| Styling | Tailwind v4 + shadcn/ui on **Base UI** (not Radix: the `render` prop, never `asChild`), base-nova preset, oklch tokens, dark mode |
| DB | PostgreSQL (Docker locally on host port **5434**; 5432 and 5433 belong to other projects) + Prisma 7 with `@prisma/adapter-pg`, one CommonJS client in `packages/db` |
| Auth | Auth.js v5 Credentials + JWT (8 h) on the web; JWT access + rotating refresh on the API |
| Bot | grammy (`bot/` = `@supplies/bot`). Webhook in production, long polling in development |
| Barcode | `BarcodeDetector` → `@zxing/browser` on the web, `expo-camera` on the phone. Lookup: Open Food Facts → METRO → GS1 Ukraine |
| Email | Resend via `packages/db/src/email.ts` (plain fetch) |
| AI | Claude via `@anthropic-ai/sdk`, Feature 32 only. `packages/core/src/claude.ts` is the only module that talks to it |
| Language | **Ukrainian UI only, no i18n layer** (spec §8). Everything else is English |
| Package manager | pnpm workspace |

## Layout

**Nothing under `apps/` imports from another app.** If two need something, it
moves into a package. Details and the lint rules that enforce this:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §3.

| Path | What | Conventions |
|---|---|---|
| `packages/core` | the pure engine: rules, messages, `uk-UA` formatting, zod schemas, wire contracts. Subpath imports only (`@supplies/core/stock`), no barrel | [CLAUDE.md](packages/core/CLAUDE.md) |
| `packages/db` | Prisma client, `queries` (where the DB meets the engine; pages never compute states), and every write service: `stock-service` (**the single stock write path**, taking an `Actor`), `item-`, `shopping-`, `shopping-groups-`, `settings-`, `account-`, `barcode-`, `recipes-`, `push-`, `telegram-service` | [CLAUDE.md](packages/db/CLAUDE.md) |
| `packages/ui` | the web design system, shared by `apps/web` and `apps/spa`. Framework-neutral by lint rule | [CLAUDE.md](packages/ui/CLAUDE.md) |
| `apps/web` | Next.js. `app/(app)/` is the authed shell; `lib/actions/` holds thin server actions; `lib/queries.rsc.ts` holds the `React.cache` readers (the **only** `server-only` file); `lib/auth-guard.ts` | [components/CLAUDE.md](apps/web/components/CLAUDE.md) |
| `apps/api` | NestJS: a third front end, never a third implementation | [CLAUDE.md](apps/api/CLAUDE.md) |
| `apps/spa` | the same app without a framework | [CLAUDE.md](apps/spa/CLAUDE.md) |
| `apps/mobile` | the same app on a phone | [CLAUDE.md](apps/mobile/CLAUDE.md) |
| `bot/` | Telegram bot and `digest.ts` (a package, because `apps/web`'s cron route sends the digest) | [CLAUDE.md](bot/CLAUDE.md) |
| `prisma/` | one schema, one seed, migrations | [CLAUDE.md](prisma/CLAUDE.md) |
| `scripts/` | smoke test, digest runner, webhook registration, backups, prod copy, dev-port check, barcode PNG | — |

**Env comes from the repo root's `.env`** for everything. `apps/web/next.config.ts`
loads `../../.env` with `override: false`, so a real environment variable
(Vercel) always wins. `.env.example` documents every variable.

## Commands

| Command | Does |
|---|---|
| `pnpm dev:all` / `dev:stop` | Next :3000 + API :3200 + SPA :5173 together; `dev:stop` frees the ports |
| `pnpm dev` · `api:dev` · `spa:dev` | one at a time |
| `pnpm mobile:dev` · `mobile:android` · `mobile:bundle` | Expo dev server; a connected device; a device-free Hermes bundle (how Metro mistakes surface in seconds) |
| `pnpm verify` | lint + every typecheck + unit tests + API unit tests: **the pre-commit gate** (~30 s) |
| `pnpm test` | vitest over `packages/**` and `bot/**`, no database |
| `pnpm test:db` | live-database smoke test (`scripts/smoke.ts`). Needs Docker and a seed. Mutates and restores the demo household |
| `pnpm test:api:e2e` | the API against the same live database, contracts included. **Signs the demo user out** (the replay check revokes every session) |
| `pnpm test:e2e` / `test:e2e:spa` | Playwright over each web client's production build (Next on :3100, from `pnpm build`; SPA on :4173 with an API on :3210, both compiled by the suite itself) |
| `pnpm db:up` · `db:migrate` · `db:seed` · `db:studio` | database ([prisma/CLAUDE.md](prisma/CLAUDE.md)) |
| `pnpm bot:dev` · `bot:local` · `bot:webhook:set` / `:delete` | the bot ([bot/CLAUDE.md](bot/CLAUDE.md)) |
| `pnpm digest:run [--force]` | the daily digest, respecting `digestHour` |
| `pnpm migrate:deploy` | migrations against the **direct** Neon host. This is the deploy's build command |
| `pnpm backup:prod` · `backup:verify` · `db:prod-copy` | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §7 |
| `pnpm barcode <code> <out.png>` | an EAN-13 as a PNG, for testing the scanner without hardware |

ESLint is **type-aware** (`recommendedTypeChecked`), which is why a lint run
takes about 15 s and why it catches unawaited promises.

## First run

1. `pnpm install`, then `pnpm db:up` (Docker Desktop must be running; it does
   not start by itself after a reboot).
2. `cp .env.example .env`; fill `AUTH_SECRET` and `API_JWT_SECRET`
   (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
3. `pnpm db:migrate`, then `pnpm db:seed`. Demo login: `anton@example.com` /
   `supplies123`.

A Prisma error on whatever query runs first almost always means the database
is down, not that the query is wrong.

## Traps that have already cost time

- **`server-only` kills everything that is not Next.** It throws outside a
  React Server Component build, and `packages/db`'s consumers include the bot,
  the digest, the smoke test and the whole API. It belongs in
  `apps/web/lib/queries.rsc.ts` and nowhere else.
- **Turbopack can keep compiling a file you moved or renamed** while
  `dev:all` runs, and the same goes for a Prisma client you regenerated. The
  symptom is an error quoting code the file no longer contains. Fix:
  `pnpm dev:stop`, `rm -rf apps/web/.next`, start again. A clean `pnpm build`
  passing while dev fails is the tell.
- **A `.next` holding a production build** makes `next dev` reject localhost
  with `UntrustedHost`. Delete `.next`; do not add `AUTH_TRUST_HOST`.
- **Anything compiled by `nest build`** (the API, and the `packages/db` and
  `bot/` sources it pulls in) must import across packages **relatively**.
- **Prisma must never reach a browser or Metro bundle.** The engine uses
  `decimal.js`, not `Prisma.Decimal`, and units come from
  `@supplies/core/units`, not the generated enums.
- **Hermes has a partial `Intl`.** Check any new `Intl` API, *and its
  arguments*, on a device ([packages/core/CLAUDE.md](packages/core/CLAUDE.md)).

## Domain in one paragraph

An **Item** is a kind of thing ("Молоко 2,5%"); a **StockBatch** is a lot of it
with its own quantity, expiry date and optional storage location. Item quantity
is **never stored**; it is the sum of live batches when read. Consumption is
**FEFO** and **skips expired batches**, which leave as `WASTE` or a deliberate
per-batch take. Stock state is `OUT` / `LOW` / `OK`; expiry state is `EXPIRED` /
`SOON` / `FRESH` / `NONE`. The two are always shown as **separate** chips.
`minQty = 0` means no reminders. An **ItemGroup** («набір») owns the threshold
for interchangeable items. Every stock write re-plans on a concurrent change
(spec §3.7). Full rules: spec §3; §3.6 is the worked example that
`packages/core/src/stock.test.ts` reproduces verbatim.

## Auth model

- **Web:** JWT sessions, no DB adapter; `id` and `householdId` in the token.
  Route protection is **layout-based** (`app/(app)/layout.tsx`); there is no
  middleware. **Server actions guard themselves** with `requireSession()`,
  which re-reads the user, and scope every query by `householdId`.
- **API:** a global guard verifies the access token; handlers receive the
  caller (`@CurrentUser`) and never read `householdId` themselves.
- Registering creates a **new household**; joining an existing one is a
  single-use invite (`/join/[token]`, 7 days).
- `/` redirects to `/dashboard` or `/login`.

## Conventions

The full list is spec §7 and §8. The ones most often broken:

- **Documentation first.** A feature or rule change lands in
  `PROJECT_PROMPT.md` (and the nearest `CLAUDE.md`) before the code.
- **One implementation, many front ends.** Rules in `packages/core`, writes in
  `packages/db`. Actions, controllers and bot handlers stay thin.
- Quantities: `Decimal(12,3)` and `decimal.js`; never float arithmetic, never
  `Number()` on a quantity; to Prisma as strings via `toDbQuantity()`.
- Dates that mean a day are `@db.Date` and go through `@supplies/core/period`.
- **Every batch change writes its `StockMovement` in the same transaction.**
- **Ukrainian UI only**, inline in components. Strings built outside React
  are keys in `@supplies/core/messages`; pure functions return key + params.
  All formatting goes through `@supplies/core/format`. **Docs, code, comments,
  identifiers and commit messages are English.**
- Business rules have colocated tests that change in the same commit as the
  rule.
- **The response shape of an endpoint is its zod contract** in
  `packages/core/contracts`. A field not added there is one no client can
  read.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
