# Supplies — Household Stock & Expiry Tracker

Family web app (mobile-first, PWA) + Telegram bot for tracking what the household has in stock, what is running low, and what is about to expire. One household, many equal members, one shared inventory. Full spec: [PROJECT_PROMPT.md](PROJECT_PROMPT.md).

> **Status.** Features 0–33 implemented and running in production on Vercel + Neon. 14 migrations, seed idempotent, `pnpm test` (339 across 22 files), `pnpm test:db` (52 integration checks against a live database, re-runnable), `pnpm test:e2e` (Playwright, 4 specs across desktop and mobile), `pnpm lint`, `pnpm typecheck` and `pnpm build` all pass.
>
> Not exercised by any automated check: the **camera barcode scan** (Features 10, 21, 26.2) and the **drag gesture** of Features 11 and 15.1 — the wiring, collision strategy and server actions behind both are verified, but no finger has driven them. The scan is no longer entirely unproven: on the phone it has been driven end to end against a barcode hung on the Android emulator's virtual-scene wall (`pnpm barcode` → [apps/mobile/CLAUDE.md](apps/mobile/CLAUDE.md)). The web clients' `BarcodeDetector` path, and focus and glare everywhere, still need hardware.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3 (App Router), React 19.2, TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui (**Base UI**, not Radix — use `render` prop, not `asChild`; base-nova preset). Branded green oklch theme + dark mode via next-themes |
| DB | PostgreSQL 17 (Docker, host port **5434** — 5432 is AquaBill's, 5433 is Kvartal's) + Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Auth | Auth.js (next-auth v5 beta), Credentials provider, JWT sessions (8h), `id` + `householdId` claims |
| Forms | react-hook-form + zod v4 + @hookform/resolvers |
| Bot | grammy (`bot/` = `@supplies/bot`) — webhook in prod, long polling in dev |
| Barcode | native `BarcodeDetector`, `@zxing/browser` fallback; product lookup via Open Food Facts |
| AI | Claude API via `@anthropic-ai/sdk` — Feature 32 recipe suggestions only. Model `claude-haiku-4-5` (cheapest), overridable with `ANTHROPIC_MODEL`. `packages/core/src/claude.ts` is the only module that talks to it |
| Email | Resend via `apps/web/lib/email.ts` `sendEmail()` (plain fetch, swappable) |
| Language | **Ukrainian only — no i18n layer** (no next-intl, no catalogs, no switcher, no `User.locale`). Copy inline in components; `uk-UA` formatting via `@supplies/core/format` |
| Package manager | pnpm **workspace**. Every deployable is an app — `apps/web` (Next), `apps/api` (NestJS), `apps/spa` (Vite) — and every shared thing is a package: `packages/core` (pure engine), `packages/db` (Prisma + the write services), `bot` (`@supplies/bot`). **The root holds no application code**; it is the workspace, the Prisma schema, the scripts and the docs ([SPA_API_PORT.md](SPA_API_PORT.md) §4) |

## Working on it

Branch → PR → CI → squash into `main`; `main` is what production runs. A pre-commit hook runs lint, typecheck and unit tests (~20s); CI runs those plus `test:db` against a real Postgres and a production build. Full flow and conventions: [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

- `pnpm mobile:dev` — Expo dev server (`expo start`); `pnpm mobile:android` for a connected device; `pnpm mobile:bundle` exports an Android bundle with no device, which is how a Metro resolution mistake surfaces in seconds → [apps/mobile/CLAUDE.md](apps/mobile/CLAUDE.md)
- `pnpm dev:all` / `pnpm dev:stop` — **all three web processes at once**: Next :3000, API :3200, SPA :5173, labelled and colour-coded. The port map is deliberate — 3100 is Playwright's production build, so nothing collides
- **Moving or renaming a file while `dev:all` is running can leave Turbopack compiling the old copy.** It reports as `Module not found` quoting a line the file no longer contains, and no amount of editing fixes it because the file is not what is being compiled. `pnpm dev:stop`, `rm -rf apps/web/.next`, start again. A clean `pnpm build` passing while dev fails is the tell
- `pnpm dev` — Next dev server (Turbopack) · `pnpm api:dev` → [apps/api](apps/api/CLAUDE.md) · `pnpm spa:dev` → [apps/spa](apps/spa/CLAUDE.md)
- `pnpm build` / `pnpm lint` / `pnpm typecheck`
- `pnpm verify` — lint + typecheck + unit tests, the same gate the pre-commit hook runs
- `pnpm test:e2e` — Playwright over a production build of the Next app on port 3100 (needs Docker + `pnpm db:seed`). Desktop and mobile viewports; deliberately small — see [CONTRIBUTING.md](CONTRIBUTING.md)
- `pnpm test:e2e:spa` — the same for the SPA: 14 checks on `vite preview` at 4173 against a compiled API at 3210, both started by Playwright. It rebuilds the SPA first because `VITE_API_URL` is inlined at build time
- ESLint is **type-aware** (`typescript-eslint` `recommendedTypeChecked`), which is what catches unawaited promises and unsafe `any`. That is why a lint run takes ~15s
- `pnpm test` / `pnpm test:watch` — vitest from the root over `packages/**/*.test.ts` and `bot/**/*.test.ts`, no DB. The apps run their own suites (`pnpm test:api`), because they need different environments
- `pnpm typecheck` covers the root — bot, scripts, packages, prisma — and `pnpm -r --filter "./apps/*" typecheck` covers each app under its own compiler settings. `pnpm verify` runs both
- `pnpm test:db` — integration smoke test against a **live** seeded database (`scripts/smoke.ts`): transactions, FEFO through Prisma, household scoping. It mutates the demo household and cleans up after itself, and its checks are written as properties rather than against particular seeded rows — a check that fails because the fixture drifted, while the rule it names is intact, teaches people to ignore the output
- `pnpm --filter @supplies/api test:e2e` — the API against the same live database (38 checks). Needs Docker and a seed; deliberately outside `pnpm test` and the commit hook, because a hook that fails when Docker is down teaches people to reach for `--no-verify`. It deletes the invites and reset tokens it creates
- `pnpm db:up` — start Postgres (docker compose, port 5434)
- `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` → [prisma/CLAUDE.md](prisma/CLAUDE.md)
- `pnpm bot:dev` / `pnpm bot:start` — Telegram bot (long polling) → [bot/CLAUDE.md](bot/CLAUDE.md)
- `pnpm bot:webhook:set` / `pnpm bot:webhook:delete` — register/remove the production webhook (needs public HTTPS `APP_URL` + `TELEGRAM_WEBHOOK_SECRET`)
- `pnpm digest:run [--force]` — daily expiry + out-of-stock digest
- `pnpm barcode <code> <out.png>` — draw an EAN-13 as a PNG (12 digits and the check digit is computed for you). It exists so the scanner can be tested without hardware: hung on the Android emulator's virtual-scene wall it is the only way `expo-camera` decodes anything in an unattended run
- `pnpm migrate:deploy` — migrations against the DIRECT Neon endpoint. **This is the deploy's build command**, not `prisma migrate deploy`: Prisma takes a session-level advisory lock, and the pooled endpoint cannot hold one (Feature 19.2)
- `pnpm backup:prod` / `pnpm backup:verify [file]` — dump production to `backups/`, and prove a dump restores by loading it into a throwaway Postgres
- `pnpm db:prod-copy [file]` — load a dump into a local Postgres 18 on port 5435 and point the app at it via `.env.local`. The Prisma CLI keeps reading `.env`, so `db:seed` and `migrate dev` cannot reach production data by accident

## Before first run

1. `pnpm db:up` — Postgres 17 on port 5434.
2. `cp .env.example .env` and fill `AUTH_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
3. `pnpm db:migrate` — applies the existing migrations.
4. `pnpm db:seed` — demo household, login `anton@example.com` / `supplies123`.

## Gotcha: `server-only` breaks everything that is not Next

Nothing in `packages/db` may `import "server-only"`. That package throws unconditionally outside a React Server Component build, and its consumers now include `pnpm bot:start`, `pnpm digest:run`, `pnpm test:db` **and the whole NestJS API**. Adding the import back kills all of them at startup with "This module cannot be imported from a Client Component module". Client-safety is enforced instead by the Prisma import, which fails a browser build loudly (see the `node:module` note in apps/web/components/CLAUDE.md). `server-only` belongs in `apps/web/lib/queries.rsc.ts`, which is genuinely Next-only, and nowhere else.

## Domain in one paragraph

An **Item** is a kind of thing ("Молоко 2,5%"); a **StockBatch** is a concrete lot of it with its own quantity, expiry date and (Feature 22) its own optional storage location — null meaning "wherever the item says", so the same product can sit in the kitchen fridge and the basement fridge at once — the same product is batched as many times as it has distinct expiry dates (10 bottles of water as 2 + 1 + 7 across three dates is one item, three batches, entered in one submit via the multi-row add form). Item quantity is **never stored** — it is the sum of its live batches at read time. Consumption is **FEFO** (soonest expiry first, then undated oldest-first) and **skips expired batches**, which must be discarded explicitly as `WASTE`. Stock state is `OUT` / `LOW` (at or below `minQty`) / `OK`; expiry state is `EXPIRED` / `SOON` (within the household's `expiryWarnDays`) / `FRESH` / `NONE`, and an item takes the worst state of its batches. `OUT` and `LOW` items are shopping-list candidates. PROJECT_PROMPT.md §3 has the rules; §3.6 is the worked example that `packages/core/src/stock.test.ts` reproduces verbatim.

## Layout

Four clients, one engine. **Nothing under `apps/` may import from another app** — if two need it, it moves into a package.

### Shared

- **`packages/core/contracts/` — the wire, described once.** One zod object per response shape; `z.infer` gives the SPA its types, `z.toJSONSchema` gives `/docs` its schemas, and `apps/api/src/app.e2e.ts` parses real responses against them. Adding a field to an endpoint means adding it here, or no client can read it
- **`packages/core/` — the pure engine, colocated tests, no DB, no framework** → [packages/core/CLAUDE.md](packages/core/CLAUDE.md). Imported as `@supplies/core/<module>` (subpaths only, no barrel): `decimal` (decimal.js + `ZERO`/`toDbQuantity`), `units` (`Unit`, `MovementReason`), `stock` (`itemQuantity`, `availableQuantity`, `stockState`, `fefoOrder`, `planConsume`, `planCorrection`, `planDiscard`), `expiry` (batch/item states, urgency, `splitExpiring`), `shopping` (candidates), `period` (date-only, UTC), `format` (uk-UA, plurals), `messages`, `action-result`, `telegram-link` (signed link tokens), `barcode-source` (`parseOffProduct`, `needsLocalName` — whether OFF answered in Ukrainian), `gepir` (GS1 Ukraine fallback — manufacturer only, 482 prefixes only), `metro` (METRO Ukraine — product names for own-label goods, and for anything OFF holds only in English), `item-group` (Feature 26 sets: combined total, derived unit, one-unit rule), `item-filter` / `item-sort` / `item-list-params` / `pagination` (Feature 27 list view state as URL params), `ordering`, `duplicates`, `shopping-groups`, `off-contribute`, `claude` + `recipes` (Feature 32), and `validation/` (zod schemas)
- **`packages/ui/` — the design system both web clients render with** → [packages/ui/CLAUDE.md](packages/ui/CLAUDE.md). Base UI primitives, the oklch tokens, the state badges and the three per-device hooks. **Framework-neutral by lint rule**: it may import neither `next/*` nor `react-router`, because it renders under both. Navigation arrives through Base UI's `render` prop and refusals come back as booleans from host-supplied callbacks
- **`packages/db/` — everything that touches Postgres** → [packages/db/CLAUDE.md](packages/db/CLAUDE.md). `prisma` (the singleton, pg adapter), `generated/prisma/` (gitignored), `queries` (the only place the DB meets the pure engine — pages never compute states themselves; sets have two readers, cheap `getItemGroups` for pickers and `getItemGroupViews` where a combined total is shown), and the write services: `stock-service` (**the single stock write path**, taking an `Actor` rather than reading a session, which is what makes "one implementation, four front ends" real), `item-service`, `shopping-service`, `settings-service`, `barcode-service`, `recipes-service`. Cross-package imports here are **relative** (`../../core/src/x`), not aliased
- `bot/` — `@supplies/bot`, the Telegram bot and `digest.ts` (`kyivHour`, DST-correct scheduling) → [bot/CLAUDE.md](bot/CLAUDE.md). A package rather than a folder because `apps/web`'s cron route sends the digest
- `prisma/` → [prisma/CLAUDE.md](prisma/CLAUDE.md) — one schema, one seed, shared by all of the above

### `apps/web` — the Next.js app

- `app/login|register|join/[token]|forgot-password|reset-password` — public auth pages; each bounces a signed-in visitor via `validSessionOrNull()` (NOT the raw JWT)
- `app/(app)/` — authed shell (session-guarded layout + `AppNav`): `dashboard/` (expired · expiring soon · running low · recent activity), `items/` (+ `new/`, `[id]/`, `[id]/edit/`, `archive/`), `groups/`, `shopping/`, `recipes/` (Feature 32 — hidden unless `Household.aiEnabled`), `settings/`
- `app/api/auth/[...nextauth]/` — Auth.js handlers; `app/api/telegram/` — bot webhook (Node runtime, secret-token verified); `app/api/cron/digest/` — Vercel Cron
- `app/manifest.ts` + `app/icon.svg` + `public/icon*.svg` — installable PWA.
  `apps/spa/public/manifest.webmanifest` is the same document by hand, so
  installing either client gives the same icon and the same `start_url`
- `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`,
  `app/(app)/loading.tsx` — the App Router's four. `global-error.tsx` ships its
  own `<html>` and inline styles because the failure it exists for includes the
  theme provider or the font loader being what threw
- `auth.ts` — NextAuth config; `types/next-auth.d.ts` — session/JWT augmentation
- `lib/actions/` — server actions (session guard + validation + `revalidatePath`), thin over `packages/db`; the zod schemas they validate against are `@supplies/core/validation/*`, so the API and the other clients share them. `actions/auth.ts` is the extreme case and the one to imitate: six exports, every one a delegation to `@supplies/db/account-service`, with nothing left in the app but the session guard and the `appUrl`
- `lib/queries.rsc.ts` — the same hot readers wrapped in `React.cache` for server components. Feature 33: the layout and the page beneath it were each scanning the whole household; measured 6 loader calls per dashboard render, now 2. `server-only`, so the bot and the digest keep importing the uncached `@supplies/db/queries`
- `lib/auth-guard.ts` — `requireSession()` / `validSessionOrNull()` (re-checks the user in the DB; stale JWT → `/login`)
- `components/` → [apps/web/components/CLAUDE.md](apps/web/components/CLAUDE.md) · `e2e/` — Playwright, run from here
- **Env comes from the repo root.** Next only reads env files in its own directory, so `next.config.ts` loads `../../.env` explicitly with `override: false` — one file for the app, the Prisma CLI, the bot and the scripts, and a real environment variable (Vercel) always wins

### `apps/mobile` — the React Native app

→ [apps/mobile/CLAUDE.md](apps/mobile/CLAUDE.md). Expo SDK 57 + Expo Router + NativeWind 4, on `@supplies/core` and the API. **`@supplies/ui` is web-only and stays that way** — React Native has no DOM, so the primitives are rebuilt and only the colour tokens are transcribed. `metro.config.js` is the interesting file: pnpm's private `node_modules` per package means `disableHierarchicalLookup` must stay **off**, which is the opposite of the usual monorepo advice. `pnpm mobile:bundle` resolves the whole graph without a device

### `apps/api` and `apps/spa`

→ [apps/api/CLAUDE.md](apps/api/CLAUDE.md) · [apps/spa/CLAUDE.md](apps/spa/CLAUDE.md). The API is a **third front end, never a third implementation**: it calls the same `packages/db` services the server actions do. See [SPA_API_PORT.md](SPA_API_PORT.md).

### `scripts/`

- `scripts/set-telegram-webhook.ts` — register/remove the production webhook; refuses a non-HTTPS `APP_URL` or a missing `TELEGRAM_WEBHOOK_SECRET`
- `scripts/smoke.ts` — `pnpm test:db`, the live-database integration test
- `scripts/run-daily-digest.ts` — hourly cron entry; picks households whose `digestHour` has arrived, skips any already sent today (`lastDigestOn`)
- `scripts/check-dev-ports.mjs` — the `dev:all` preflight; names the process holding 3000/3200/5173 instead of failing with `EADDRINUSE`
- `scripts/make-barcode-png.mjs` — `pnpm barcode`; an EAN-13 as a PNG, no dependency. Hung on the Android emulator's virtual-scene wall it is what makes Feature 21 testable without a phone

## Auth model

- JWT strategy, no DB adapter; `id` and `householdId` embedded in the token (`auth.ts` callbacks). 8h `session.maxAge`.
- Route protection is **layout-based**: `app/(app)/layout.tsx` requires a session and redirects to `/login`. No middleware.
- **Server actions must guard themselves** with `requireSession()` and scope every query by the session `householdId` — layouts protect pages only.
- Registration creates a **new household**; joining an existing one goes through a single-use `HouseholdInvite` link (`/join/[token]`, 7 days).
- `/` redirects to `/dashboard` (signed in) or `/login`.

## Conventions

- Quantities are `Decimal(12,3)` in the column and **decimal.js** in the engine (`@supplies/core/decimal`) — never float math; pass values to Prisma as strings via `toDbQuantity()`; round to 3 dp. The engine does **not** import `Prisma.Decimal`: the generated client opens with `node:process`/`node:path`/`node:url`, so a value import of it poisons any browser or Metro bundle. `Prisma.Decimal` *is* decimal.js, so the two interoperate — `packages/db/src/prisma-decimal.test.ts` pins that, because if it ever stopped being true the symptom would be wrong quantities rather than a crash.
- Units live in `@supplies/core/units`, not in the generated enums, so schemas and formatting can be shared with clients that have no database. `packages/db/src/prisma-units.test.ts` compares the two lists and fails if the schema gains a unit this one lacks.
- Expiry and "opened" dates are **date-only** (`@db.Date`); compare/format via `@supplies/core/period` (UTC getters — no timezone math anywhere).
- Business rules live in pure `packages/core` functions with colocated vitest tests; when a rule changes, its tests change in the same commit.
- Every batch mutation writes its `StockMovement` in the **same transaction** — no exceptions. The movement log is the audit trail ("who used the last of it").
- Household settings (`expiryWarnDays`, `digestHour`) are **data**, not constants — pure functions take them as input.
- **Documentation-first**: any new feature/rule lands in PROJECT_PROMPT.md (+ this file) before code.
- **Ukrainian is the UI language, and ONLY that.** Docs (README, every CLAUDE.md, PROJECT_PROMPT.md), code, comments, identifiers and commit messages are **English**. Where English prose quotes a literal UI label — «Загальна група» — the Ukrainian stays, because the doc is naming what the user sees on screen; translating it would make the doc disagree with the app.
- **Ukrainian only** (PROJECT_PROMPT.md §8): UI copy is written in Ukrainian **directly in the components** — no `t()`, no keys, no catalogs. Do not add an i18n library. Strings generated outside React (pure-engine rule errors, server-action/zod errors, bot replies, digest text) live in `@supplies/core/messages` as a typed key → Ukrainian map with `{param}` interpolation; **pure functions return the key + params, never a formatted sentence**, so tests assert on keys, not prose. All dates and numbers format through `@supplies/core/format` (`uk-UA`, `DD.MM.YYYY`, decimal comma, and `selectUkPlural` for `one/few/many` — "1 пляшка / 2 пляшки / 5 пляшок"); never call `toLocaleString()` ad hoc. That plural rule is CLDR's `uk` **written out** rather than `Intl.PluralRules`, because Hermes does not have that constructor and every React Native screen importing the formatter crashed on it; `format.test.ts` proves the hand-written version matches Node's for every integer 0–1000. Check any new `Intl` API against Hermes before adding it — see [packages/core/CLAUDE.md](packages/core/CLAUDE.md). `<html lang="uk">`, manifest `"lang": "uk"`, Ukrainian seed data.
- The **bot is a second front end, never a second implementation** — it calls `@supplies/db/stock-service` and `@supplies/db/queries`, same as the web UI — and so does the API.
- `@supplies/core/format` is deliberately **Prisma-free** — client components import it, and the generated client pulls `node:module` into the browser bundle and breaks the build.
- Env (`.env`, gitignored; template `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`; optional `OFF_BASE_URL` and `GEPIR_BASE_URL` (barcode source overrides), `ANTHROPIC_API_KEY` + optional `ANTHROPIC_MODEL` (Feature 32 — without the key the Recipes page loads and says so).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
