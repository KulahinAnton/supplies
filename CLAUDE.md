# Supplies — Household Stock & Expiry Tracker

Family web app (mobile-first, PWA) + Telegram bot for tracking what the household has in stock, what is running low, and what is about to expire. One household, many equal members, one shared inventory. Full spec: [PROJECT_PROMPT.md](PROJECT_PROMPT.md).

> **Status.** Features 0–10 implemented and running against a live Postgres. Two migrations applied, seed idempotent, `pnpm test` (111), `pnpm test:db` (25 integration checks), `pnpm lint`, `pnpm typecheck` and `pnpm build` all pass. The only paths never exercised are the ones needing a real Telegram token: the bot's command handlers and actual message delivery.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3 (App Router), React 19.2, TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui (**Base UI**, not Radix — use `render` prop, not `asChild`; base-nova preset). Branded green oklch theme + dark mode via next-themes |
| DB | PostgreSQL 17 (Docker, host port **5434** — 5432 is AquaBill's, 5433 is Kvartal's) + Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Auth | Auth.js (next-auth v5 beta), Credentials provider, JWT sessions (8h), `id` + `householdId` claims |
| Forms | react-hook-form + zod v4 + @hookform/resolvers |
| Bot | grammy (`bot/`) — webhook in prod, long polling in dev |
| Barcode | native `BarcodeDetector`, `@zxing/browser` fallback; product lookup via Open Food Facts |
| Email | Resend via `lib/email.ts` `sendEmail()` (plain fetch, swappable) |
| Language | **Ukrainian only — no i18n layer** (no next-intl, no catalogs, no switcher, no `User.locale`). Copy inline in components; `uk-UA` formatting via `lib/format.ts` |
| Package manager | pnpm (build allowlist in `pnpm-workspace.yaml`) |

## Commands

- `pnpm dev` — dev server (Turbopack)
- `pnpm build` / `pnpm lint` / `pnpm typecheck`
- `pnpm test` / `pnpm test:watch` — vitest over pure `lib/` rules, colocated `lib/*.test.ts`, no DB (`@` alias in `vitest.config.mts`)
- `pnpm test:db` — integration smoke test against a **live** seeded database (`scripts/smoke.ts`): transactions, FEFO through Prisma, household scoping. It mutates the demo household and cleans up after itself; re-seed afterwards if you want pristine demo data.
- `pnpm db:up` — start Postgres (docker compose, port 5434)
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` → [prisma/CLAUDE.md](prisma/CLAUDE.md)
- `pnpm bot:dev` / `pnpm bot:start` — Telegram bot (long polling) → [bot/CLAUDE.md](bot/CLAUDE.md)
- `pnpm bot:webhook:set` / `pnpm bot:webhook:delete` — register/remove the production webhook (needs public HTTPS `APP_URL` + `TELEGRAM_WEBHOOK_SECRET`)
- `pnpm digest:run [--force]` — daily expiry + out-of-stock digest

## Before first run

1. `pnpm db:up` — Postgres 17 on port 5434.
2. `cp .env.example .env` and fill `AUTH_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
3. `pnpm db:migrate` — applies the two existing migrations.
4. `pnpm db:seed` — demo household, login `anton@example.com` / `supplies123`.

## Gotcha: `server-only` breaks the scripts

`lib/queries.ts` and `lib/stock-service.ts` deliberately do **not** `import "server-only"`. That package throws unconditionally outside a React Server Component build, and both modules have legitimate plain-Node consumers — `pnpm bot:start` and `pnpm digest:run`. Adding the import back kills both entry points at startup with "This module cannot be imported from a Client Component module". Client-safety is enforced instead by the Prisma import, which fails a browser build loudly (see the `node:module` note in components/CLAUDE.md).

## Domain in one paragraph

An **Item** is a kind of thing ("Молоко 2,5%"); a **StockBatch** is a concrete lot of it with its own quantity and expiry date — the same product is batched as many times as it has distinct expiry dates (10 bottles of water as 2 + 1 + 7 across three dates is one item, three batches, entered in one submit via the multi-row add form). Item quantity is **never stored** — it is the sum of its live batches at read time. Consumption is **FEFO** (soonest expiry first, then undated oldest-first) and **skips expired batches**, which must be discarded explicitly as `WASTE`. Stock state is `OUT` / `LOW` (at or below `minQty`) / `OK`; expiry state is `EXPIRED` / `SOON` (within the household's `expiryWarnDays`) / `FRESH` / `NONE`, and an item takes the worst state of its batches. `OUT` and `LOW` items are shopping-list candidates. PROJECT_PROMPT.md §3 has the rules; §3.6 is the worked example that `lib/stock.test.ts` reproduces verbatim.

## Layout

- `app/login|register|join/[token]|forgot-password|reset-password` — public auth pages; each bounces a signed-in visitor via `validSessionOrNull()` (NOT the raw JWT)
- `app/(app)/` — authed shell (session-guarded layout + `AppNav`): `dashboard/` (expiring · running low · recent activity), `items/` (+ `new/`, `[id]/`, `[id]/edit/`, `archive/`), `shopping/`, `settings/`
- `app/api/auth/[...nextauth]/` — Auth.js handlers; `app/api/telegram/` — bot webhook (Node runtime, secret-token verified)
- `app/manifest.ts` + `app/icon.svg` + `public/icon*.svg` — installable PWA
- `auth.ts` (root) — NextAuth config; `types/next-auth.d.ts` — session/JWT augmentation
- `lib/prisma.ts` — Prisma singleton (pg adapter); `lib/generated/prisma/` — generated client (gitignored)
- **Pure engine, colocated tests, no DB:** `lib/stock.ts` (`itemQuantity`, `availableQuantity`, `stockState`, `fefoOrder`, `planConsume`, `planCorrection`, `planDiscard`), `lib/expiry.ts` (batch/item states, urgency), `lib/shopping.ts` (candidates), `lib/period.ts` (date-only, UTC), `lib/format.ts` (uk-UA, plurals), `lib/telegram-link.ts` (signed link tokens), `lib/barcode-source.ts` (`parseOffProduct`)
- `lib/stock-service.ts` — **the single stock write path**, called by both the server actions and the bot. Takes an `Actor` instead of reading a session, which is what makes "one implementation, two front ends" real
- `lib/actions/` — server actions (session guard + validation + `revalidatePath`); `lib/validation/` — zod schemas shared client/server
- `lib/queries.ts` — the only place the DB meets the pure engine; pages never compute states themselves
- `lib/auth-guard.ts` — `requireSession()` / `validSessionOrNull()` (re-checks the user in the DB; stale JWT → `/login`)
- `lib/messages.ts` — Ukrainian strings for everything produced outside React
- `bot/` → [bot/CLAUDE.md](bot/CLAUDE.md) · `prisma/` → [prisma/CLAUDE.md](prisma/CLAUDE.md) · `components/` → [components/CLAUDE.md](components/CLAUDE.md)
- `scripts/set-telegram-webhook.ts` — register/remove the production webhook; refuses a non-HTTPS `APP_URL` or a missing `TELEGRAM_WEBHOOK_SECRET`
- `scripts/smoke.ts` — `pnpm test:db`, the live-database integration test
- `scripts/run-daily-digest.ts` — hourly cron entry; picks households whose `digestHour` has arrived, skips any already sent today (`lastDigestOn`)

## Auth model

- JWT strategy, no DB adapter; `id` and `householdId` embedded in the token (`auth.ts` callbacks). 8h `session.maxAge`.
- Route protection is **layout-based**: `app/(app)/layout.tsx` requires a session and redirects to `/login`. No middleware.
- **Server actions must guard themselves** with `requireSession()` and scope every query by the session `householdId` — layouts protect pages only.
- Registration creates a **new household**; joining an existing one goes through a single-use `HouseholdInvite` link (`/join/[token]`, 7 days).
- `/` redirects to `/dashboard` (signed in) or `/login`.

## Conventions

- Quantities are Prisma `Decimal(12,3)` — never float math; pass values to Prisma as strings; round to 3 dp.
- Expiry and "opened" dates are **date-only** (`@db.Date`); compare/format via `lib/period.ts` (UTC getters — no timezone math anywhere).
- Business rules live in pure `lib/` functions with colocated vitest tests; when a rule changes, its tests change in the same commit.
- Every batch mutation writes its `StockMovement` in the **same transaction** — no exceptions. The movement log is the audit trail ("who used the last of it").
- Household settings (`expiryWarnDays`, `digestHour`) are **data**, not constants — pure functions take them as input.
- **Documentation-first**: any new feature/rule lands in PROJECT_PROMPT.md (+ this file) before code.
- **Ukrainian only** (PROJECT_PROMPT.md §8): UI copy is written in Ukrainian **directly in the components** — no `t()`, no keys, no catalogs. Do not add an i18n library. Strings generated outside React (pure-engine rule errors, server-action/zod errors, bot replies, digest text) live in `lib/messages.ts` as a typed key → Ukrainian map with `{param}` interpolation; **pure functions return the key + params, never a formatted sentence**, so tests assert on keys, not prose. All dates and numbers format through `lib/format.ts` (`uk-UA`, `DD.MM.YYYY`, decimal comma, `Intl.PluralRules` for `one/few/many` — "1 пляшка / 2 пляшки / 5 пляшок"); never call `toLocaleString()` ad hoc. `<html lang="uk">`, manifest `"lang": "uk"`, Ukrainian seed data.
- The **bot is a second front end, never a second implementation** — it calls `lib/stock-service.ts` and `lib/queries.ts`, same as the web UI.
- `lib/format.ts` is deliberately **Prisma-free** — client components import it, and the generated client pulls `node:module` into the browser bundle and breaks the build.
- Env (`.env`, gitignored; template `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`; optional `OFF_BASE_URL` (barcode source override).
