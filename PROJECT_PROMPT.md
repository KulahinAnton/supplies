# Project: Supplies — Household Stock & Expiry Tracker

## 1. Goal

Build a small full-stack web application (mobile-first, installable as a PWA, plus a Telegram bot) that replaces the family's "open the cupboard, guess what's missing, buy a third bottle of shampoo, throw away expired yoghurt" ritual.

The household records **what it has, how much, and when it expires**. The app:
- keeps a live **stock level per item**, summed from dated batches,
- flags what is **running low** (at or below a per-item threshold) and what is **expiring soon or already expired**,
- turns low stock into a **shared shopping list** that any family member can check off — checking an item off puts it back into stock,
- lets every member act from their phone: web PWA, a **Telegram bot** (fastest while standing in a shop), and **barcode scanning** when adding items.

The UI must look like a modern, polished household dashboard (Linear/Stripe-level polish), not a generic CRUD panel. It is a **single-household multi-user** app: one family shares one inventory; everyone sees and edits the same data.

## 2. Tech Stack (fixed — do not substitute without asking)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + shadcn/ui 4.x (**Base UI**, not Radix — use `render` prop, not `asChild`; nova preset) + dark mode via next-themes |
| Database | PostgreSQL 17 (Docker Compose, host port **5434** — 5432 is AquaBill, 5433 is Kvartal) |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Auth | Auth.js (NextAuth v5), Credentials provider, JWT sessions (8h), `id` + `householdId` claims |
| Forms/validation | react-hook-form + zod v4 (schemas shared between client and server) |
| Server mutations | Next.js Server Actions (no hand-rolled API routes except the bot webhook) |
| Telegram bot | grammy (`bot/`), webhook in production, long-polling in dev |
| Barcode | `BarcodeDetector` where available, `@zxing/browser` fallback; product lookup via Open Food Facts |
| Email (password reset, invites) | Resend via a thin swappable `sendEmail()` wrapper |
| Language | **Ukrainian only — no i18n layer.** No next-intl, no message catalogs, no locale switcher. UI copy is written in Ukrainian directly in the components (§8) |
| Unit tests | vitest — pure business rules in `lib/`, colocated `*.test.ts`, no DB |
| Package manager | pnpm (allow build scripts in `pnpm-workspace.yaml`) |

Do not introduce a separate backend service — a single full-stack Next.js app plus the bot process. Keep every business rule (stock math, FEFO, expiry states, low-stock detection) in pure `lib/` functions so the web UI, the bot, and any future native app share one implementation.

## 3. Domain: Household Stock

### 3.1 Items, batches, and why stock is not a single number

An **Item** is a *kind* of thing the household keeps ("Milk 2.5%", "Ibuprofen 200mg", "Dishwasher tablets"). A **StockBatch** is a concrete lot of that item with **its own quantity and its own expiry date** — because two cartons of milk bought a week apart expire on different days.

`Item.quantity` is therefore **never stored**. Current stock = sum of `batch.quantity` over the item's non-empty batches, computed at read time. Adding, consuming, or correcting stock always goes through batches, so the numbers can never drift out of sync.

**The same product is added as many times as it has distinct expiry dates.** 10 bottles of water where 2 expire in 3 months, 1 in 6 months and 7 in a year is **one item with three batches** (2 / 1 / 7). The item reads "10 pcs"; the expiry dashboard warns about the 2 when their date approaches, while the other 8 stay quiet; FEFO (§3.3) always draws from the soonest-expiring batch first. Entering such a purchase takes **one submit**, not three — see the multi-batch add form in Feature 4.

### 3.2 Units

`unit` is an enum on the item: `PIECE | PACK | GRAM | KILOGRAM | MILLILITRE | LITRE`. **No cross-unit conversion is performed** — an item is counted in exactly one unit for its whole life, and all its batches share it. This is a deliberate simplification: the family knows whether it counts eggs or milk. Changing an item's unit after batches exist is rejected with a rule error.

Quantities are Prisma `Decimal(12,3)` (three decimals covers 0.5 L, 0.25 kg). Never JS floats.

### 3.3 Consumption is FEFO (first expired, first out)

When someone consumes N units of an item, the app draws down batches in this order:
1. batches **with** an expiry date, soonest expiry first,
2. then batches **without** an expiry date, oldest `createdAt` first.

Already-expired batches are **skipped, never auto-consumed** — the household must explicitly discard them (reason `WASTE`), so "we drank the milk" can never be silently recorded against a carton that went off. If the request exceeds available non-expired stock, the whole consume is rejected with a rule error naming the shortfall; partial consumption is never guessed.

A batch that reaches quantity 0 is kept as a row (history) but excluded from stock sums.

### 3.4 Stock state (drives the dashboard and the shopping list)

Each item has `minQty` (Decimal, default 0 = "don't track"). Given current stock `q`:

| State | Condition |
|---|---|
| `OUT` | `q == 0` |
| `LOW` | `minQty > 0` and `0 < q <= minQty` |
| `OK` | otherwise |

Items in `OUT` or `LOW` are **shopping-list candidates** (Feature 6). `minQty = 0` opts an item out of low-stock nagging entirely without deleting it.

### 3.5 Expiry state

Household-level setting `expiryWarnDays` (default **7**). Given a batch with `expiresAt` and today:

| State | Condition |
|---|---|
| `EXPIRED` | `expiresAt < today` |
| `SOON` | `today <= expiresAt <= today + expiryWarnDays` |
| `FRESH` | `expiresAt > today + expiryWarnDays` |
| `NONE` | `expiresAt is null` |

An item's expiry state is the **worst** state among its non-empty batches. Dates are date-only (`@db.Date`) and compared with UTC getters via `lib/period.ts` — no timezone math anywhere.

### 3.6 Worked example (acceptance test for the engine)

Item "Milk", unit `LITRE`, `minQty = 2`. Today is 2026-03-10, `expiryWarnDays = 7`. Batches:
- A: 1.000 L, expires 2026-03-08
- B: 2.000 L, expires 2026-03-14
- C: 1.500 L, no expiry

Expected:
- Total stock **4.500 L**; **available** (non-expired) **3.500 L**.
- Item stock state: `OK` (4.5 > 2). Item expiry state: `EXPIRED` (batch A is the worst).
- Batch states: A `EXPIRED`, B `SOON` (within 7 days), C `NONE`.
- `consume(3.0)` draws **2.000 from B** (soonest non-expired), then **1.000 from C**; batch A untouched. Resulting stock 1.500 L, state `LOW` (0 < 1.5 <= 2), so it becomes a shopping-list candidate.
- `consume(4.0)` is **rejected**, shortfall 0.500 (only 3.500 available; the expired litre does not count).

## 4. Core Data Model

Suggested Prisma shape (adjust names, keep the shape):

- **Household**: `id (uuid)`, `name`, `expiryWarnDays (Int, default 7)`, `digestHour (Int, default 8)`, `createdAt`
- **User**: `id (uuid)`, `email (unique)`, `passwordHash`, `name`, `isActive`, `householdId`, `createdAt`. Every user belongs to exactly one household; all members are equal (no roles). No `locale` column — the app is Ukrainian-only (§8).
- **HouseholdInvite**: `id`, `householdId`, `tokenHash (SHA-256)`, `email?`, `expiresAt (7d)`, `usedAt?`, `createdById` — single-use join link.
- **Category**: `id`, `householdId`, `name`, `icon`, `sortOrder`; unique `[householdId, name]`. Seeded defaults: Food, Drinks, Cleaning, Hygiene, Medicine, Pets, Other.
- **StorageLocation**: `id`, `householdId`, `name`, `sortOrder`; unique `[householdId, name]`. Seeded: Pantry, Fridge, Freezer, Bathroom, Garage.
- **Item**: `id`, `householdId`, `name`, `categoryId`, `locationId?`, `unit (enum)`, `minQty (Decimal 12,3, default 0)`, `barcode?`, `notes?`, `isArchived (default false)`, `createdAt`, `updatedAt`; unique `[householdId, barcode]` (nulls allowed), index `[householdId, isArchived]`.
- **StockBatch**: `id`, `itemId`, `quantity (Decimal 12,3)`, `expiresAt (@db.Date, nullable)`, `openedAt (@db.Date, nullable)`, `addedById`, `createdAt`; index `[itemId, expiresAt]`.
- **StockMovement**: `id`, `itemId`, `batchId?`, `delta (Decimal 12,3, signed)`, `reason (enum PURCHASE | CONSUME | WASTE | CORRECTION)`, `userId`, `occurredAt`, `note?`; index `[itemId, occurredAt]`. **Append-only audit** — every batch change writes one movement in the same transaction. Answers "who used the last of it".
- **ShoppingListItem**: `id`, `householdId`, `itemId?` (null for free-text one-offs), `freeText?`, `quantity (Decimal, nullable)`, `isChecked`, `addedById`, `addedAt`, `checkedById?`, `checkedAt?`. Exactly one of `itemId` / `freeText` is set.
- **TelegramLink**: `id`, `userId (unique)`, `chatId (BigInt, unique)`, `linkedAt` — binds a Telegram chat to an app user (Feature 9).
- **PasswordResetToken**: `id`, `userId`, `tokenHash (SHA-256)`, `expiresAt (1h)`, `usedAt?` — single-use.

Everything derived (item quantity, stock state, expiry state, shopping candidates) is **computed at read time, never stored**, so editing a batch automatically "recomputes" the dashboard.

## 5. Documentation & Memory Rules (IMPORTANT)

**Documentation comes before implementation — always.** Any new feature or rule change is first written into this file (as a new numbered section or an edit), then reflected in `CLAUDE.md`, and only then implemented.

Before writing feature code, create and continuously maintain:
1. **Root `CLAUDE.md`** — project summary, stack table, commands, folder layout, auth model, link to per-area docs. Facts and conventions only — never narrate what code does.
2. **`prisma/CLAUDE.md`** — schema conventions, migration workflow, seed credentials/data.
3. **`components/CLAUDE.md`** — installed shadcn/ui components, form patterns, layout shell, Base UI gotchas.
4. **`bot/CLAUDE.md`** — bot commands, conversation state, webhook vs polling.
5. Update the relevant `CLAUDE.md` in the same change as the convention/schema change it documents. Don't create boilerplate CLAUDE.md files for folders without non-obvious conventions. Never duplicate content — link.
6. After finishing a feature, append a short "Implementation notes" subsection to that feature's section here (deviations, gotchas).

## 6. Features (build in this order)

### Feature 0 — Project scaffolding
- Init Next.js + TS strict + Tailwind v4 + shadcn/ui (Base UI, nova); pnpm; ESLint; vitest config with `@/*` alias.
- Docker Compose for Postgres on host port **5434**; Prisma 7 (config in `prisma.config.ts`, not schema/package.json); initial migration.
- Seed: one household, two demo users, default categories + locations, ~15 items across categories with a deliberate spread — one `OUT`, two `LOW`, one with an `EXPIRED` batch, one `SOON`, one with no expiry at all.
- Root `CLAUDE.md` + `prisma/CLAUDE.md` written **before** any feature code.

### Feature 1 — Auth & household
- Register (email + password + name) — **creates a new household** and makes the user its first member. Login, logout. Auth.js v5 Credentials + JWT (8h `maxAge`), `id` and `householdId` in the token.
- `requireSession()` guard re-checks the user still exists and `isActive` in the DB (stale JWT redirects to `/login`).
- Public pages `/login`, `/register`, `/join/[token]`, `/forgot-password`, `/reset-password` — redirect to `/dashboard` if already signed in (via `validSessionOrNull()`, not the raw JWT).
- **Invite flow**: a member generates a single-use invite link (`HouseholdInvite`, 7d); opening it registers a new user **into that household** instead of creating one. Optional email delivery via Resend.
- Password reset by email: no user enumeration, hashed single-use token, 1h expiry.
- Route protection is layout-based: `app/(app)/layout.tsx` requires a session. **Every server action guards itself** with `requireSession()` and scopes every query by the session `householdId` — layouts protect pages only.

### Feature 2 — Stock engine (pure `lib/`, test-first)
Written and tested **before** any UI touches it.
- `lib/stock.ts` — `itemQuantity(batches)`, `availableQuantity(batches, today)`, `stockState(item, batches)`, `planConsume(batches, qty, today)` returning a FEFO draw-down plan or a `RuleMessage` shortfall error (§3.3).
- `lib/expiry.ts` — `batchExpiryState(batch, today, warnDays)`, `itemExpiryState(batches, ...)`, `daysUntil(date, today)`.
- `lib/shopping.ts` — `shoppingCandidates(items, batchesByItem)` returning items in `OUT`/`LOW` not already on an unchecked list row.
- `lib/period.ts` — date-only helpers (UTC getters, no TZ math).
- Colocated vitest tests covering the **§3.6 worked example end to end**, plus: expired batches excluded from FEFO, shortfall rejection, `minQty = 0` opting out, zeroed batches excluded from sums, `null` expiry ordering, and rounding to 3 decimals.

### Feature 3 — Items, categories, locations
- `/items` — searchable, filterable list (by category, location, state) with stock state and worst expiry state as badges. Mobile-first: cards on phone, table on desktop.
- Item create/edit/archive (archive, never hard-delete — movements reference it). Unit change rejected when batches exist (§3.2).
- `/settings` — manage categories and storage locations, `expiryWarnDays`, digest hour, household name, members list, invite link, change password, theme.

### Feature 4 — Stock in / out
- **Add stock**: quantity + optional expiry date + optional "opened" date creates a `StockBatch` + `PURCHASE` movement in one transaction.
- **Multi-batch add (one purchase, several dates)**: the add-stock form is a **repeatable row list** — "add another date" appends a `{quantity, expiresAt?, openedAt?}` row. One submit creates **all** the batches and **one `PURCHASE` movement per batch** inside a **single transaction**: either every row lands or none does. This is the common real case — buying 10 bottles of water where 2 expire in 3 months, 1 in 6, and 7 in a year is one shopping trip, not three data-entry sessions. Rules: at least one row; every row needs a positive quantity; rows may repeat the same date (they are simply merged into one batch); a row with no expiry is allowed alongside dated rows. The bot's `/add` flow offers "add another date?" after each row for the same reason.
- **Consume**: quantity runs `planConsume` (§3.3), applies the plan across batches and writes `CONSUME` movements, all in one transaction. Rejected shortfalls surface the rule message, never a partial write.
- **Discard**: explicit `WASTE` against a chosen batch (this is the only way expired stock leaves).
- **Correction**: set a batch's absolute quantity, writes the signed `CORRECTION` delta.
- Item detail page: batch list (quantity, expiry chip, added by) + movement history ("who used the last of it").

### Feature 5 — Dashboard
- `/dashboard` — the morning glance: **Expiring soon / expired** (worst first, with days remaining), **Running low / out**, and recent activity. Every card links to the action that fixes it.
- Counts as chips in the app-shell header so the state is visible from any page.

### Feature 6 — Shopping list
- `/shopping` — one shared list. Auto-candidates from §3.4 appear as suggestions ("Milk is low — add?") and are **never** silently inserted; the family decides.
- Manual add of a known item or a free-text one-off ("birthday candles").
- **Checking an item off is a stock-in**: it prompts for quantity + expiry and creates the batch (Feature 4), then marks the row checked with `checkedById`. Free-text rows just check off.
- Checked rows stay visible until a "Clear bought" action; history is not kept beyond that (the movements are the real record).

### Feature 7 — PWA
- `app/manifest.ts` + icons, standalone display, mobile-first everywhere. Same approach as Kvartal/AquaBill.

### Feature 8 — Ukrainian copy & formatting (applies from Feature 1, verified here)
The app is **Ukrainian-only**. There is no next-intl, no `messages/` catalogs, no locale cookie, no language switcher, and no `User.locale`. Do not add an i18n layer "just in case" — if English is ever wanted, it is a deliberate project of its own.

- **UI copy is written in Ukrainian directly in the components.** No key indirection, no `t()` wrapper. What you read in the JSX is what the user sees.
- **Strings produced outside React keep a keyed map** — `lib/messages.ts`, a plain typed constant object (`RuleMessage` keys → Ukrainian text, with `{param}` interpolation). This covers exactly three cases, all of which must stay React-free and unit-testable:
  1. rule errors returned by the pure engine functions (`planConsume` shortfall, unit-change rejection, …),
  2. server-action / zod validation errors,
  3. bot replies and digest text.
  Pure functions return the **key plus params**, never a formatted sentence; the caller renders it. This is what makes `lib/*.test.ts` assert on stable keys instead of on prose.
- **Formatting is `uk-UA` everywhere**: dates `DD.MM.YYYY` via `Intl.DateTimeFormat("uk-UA")`, numbers with the Ukrainian decimal comma and space group separator via `Intl.NumberFormat("uk-UA")`. Formatting helpers live in `lib/format.ts` — never call `toLocaleString()` ad hoc in a component.
- **Ukrainian plurals are real**: "1 пляшка / 2 пляшки / 5 пляшок". Quantity and day-count strings go through an `Intl.PluralRules("uk-UA")` helper in `lib/format.ts` (`one | few | many` forms), not string concatenation. Unit labels and the "expires in N days" chips are the main consumers.
- `<html lang="uk">` in the root layout; the PWA manifest declares `"lang": "uk"` and `"dir": "ltr"`.
- Seeded data (categories, storage locations, demo items) is Ukrainian.

### Feature 9 — Telegram bot (grammy, `bot/`)
Mirrors AquaBill's bot layout (`bot/index.ts`, `bot.ts`, `auth.ts`, `session.ts`, `state.ts`) — **minus** its `i18n.ts`, since replies come from `lib/messages.ts` (§8).
- **Linking**: `/start <token>` binds the chat to a user via a short-lived link token generated in the web app, stored as `TelegramLink`. Unlinked chats can do nothing but link.
- Commands: `/low` (what's running low), `/expiring` (what's about to go off), `/list` (shopping list), `/add` (guided: item, quantity, expiry), `/took` (consume: item, quantity), `/bought` (check items off the list).
- **Notifications**: a daily digest at the household's `digestHour` listing items expiring within `expiryWarnDays` and items that went `OUT` since yesterday. Sent via `scripts/run-daily-digest.ts` (`pnpm digest:run`), safe to re-run — it never sends twice for the same day.
- Webhook in production (`app/api/telegram/route.ts`, secret-token verified), long-polling in dev (`pnpm bot:dev`).
- **Every bot action goes through the same server-side rules as the web UI** — the bot is a second front end, never a second implementation.

### Feature 10 — Barcode scanning
- "Scan" button on add-item and add-stock opens the camera (`<input capture="environment">` / `getUserMedia`), decodes with the native `BarcodeDetector` when the browser has it, `@zxing/browser` otherwise.
- A known barcode jumps straight to that item's add-stock form. An unknown one opens item-create **pre-filled from Open Food Facts** (`lib/barcode-source.ts`: pure `parseOffProduct(json)` tested against a captured fixture, plus `fetchProduct(barcode)`; override `OFF_BASE_URL`). Lookup failure is never blocking — the form just opens empty.
- **No images are stored.** Decoding happens in the browser; only the digits are sent to the server.
- In the bot, a photo of a barcode goes through the same decode path server-side, then into the existing `/add` flow.

## 7. Conventions

- Quantities are Prisma `Decimal(12,3)` — never float math; pass values to Prisma as strings; round to 3 dp.
- Expiry and "opened" dates are **date-only** (`@db.Date`); compare/format via `lib/period.ts` (UTC getters).
- Business rules live in pure `lib/` functions with colocated vitest tests; when a rule changes, its tests change in the same commit.
- Every mutation writes its `StockMovement` in the **same transaction** as the batch change — no exceptions.
- Server actions guard with `requireSession()` and scope **every** query by `householdId`. A household must never be able to read or write another household's rows.
- Household settings (`expiryWarnDays`, `digestHour`) are **data**, not constants — the engine takes them as input.
- **Ukrainian only** (§8): copy inline in components; rule/action/bot strings keyed in `lib/messages.ts`; all date and number formatting through `lib/format.ts` (`uk-UA`, plural rules). No English in the UI, no i18n library.
- Env (`.env`, gitignored; template `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`; optional `OFF_BASE_URL` (barcode source override).

## 8. Implementation notes

Recorded per §5.6 as features landed. Deviations from the spec above, and the reasons.

### Feature 0
- Next.js **16.3.1** / React **19.2.8** (create-next-app latest), a patch ahead of Kvartal's 16.2.10. Same major, no API differences encountered.
- `vitest.config.mts` (not `.ts`) — Vite's native config loader warns about ESM-in-CJS otherwise. Uses `import.meta.dirname` for the `@` alias.
- shadcn components are added with `pnpm exec shadcn add`, **not** `pnpm dlx` — dlx's sandbox cannot resolve `zod` and the CLI crashes. `shadcn` is therefore a devDependency, as in the other two repos.
- `pnpm-workspace.yaml` uses pnpm 11's `allowBuilds:` map, matching Kvartal.

### Feature 2
- The engine is Prisma-typed but Prisma-runtime-light: it imports `Prisma.Decimal` for arithmetic only. §3.6 is reproduced verbatim in `lib/stock.test.ts` — 110 tests pass across the seven `lib/*.test.ts` files.
- `stockState` reads **total** stock, not available (§3.4 as written): an item whose only stock is expired reads OK/LOW while the expiry dashboard flags it separately. The two axes stay independent so neither can hide the other.

### Feature 4
- **Added: multi-batch add form.** One purchase with several expiry dates is one submit — see the Feature 4 bullet above. Rows naming the same date are merged into one batch rather than creating two the FEFO planner has to tie-break.
- **Refactor:** the stock write path lives in `lib/stock-service.ts`, which takes an `Actor` (`{userId, householdId}`) instead of reading a session. Server actions call it after `requireSession()`, the bot after resolving a linked chat. Without this, Feature 9 would have been a second implementation of the same rules — exactly what that feature forbids.

### Feature 8
- `lib/format.ts` is deliberately **Prisma-free**. Client components import it for unit labels, and importing the generated client into a browser bundle drags `node:module` in, which fails the Turbopack build ("the chunking context does not support external modules"). It accepts any `Numeric` (anything with `toString()`), so a `Decimal` still works.
- `lib/generated/prisma/enums.ts` has no imports of its own and is safe client-side — that is how `Unit` reaches the forms.

### Feature 9
- **Link tokens are stateless**: a signed `userId.expiry.signature` triple (`lib/telegram-link.ts`, HMAC over `AUTH_SECRET`, 15 min). No table, no cleanup job, no replay after expiry. Rotating `AUTH_SECRET` invalidates outstanding link tokens — intended.
- Conversation state is an in-memory `Map` (`bot/state.ts`), so it is per-process and lost on restart. Acceptable: a half-finished `/add` costs one retyped word. Revisit only if the webhook is ever load-balanced.
- **Added:** `Household.lastDigestOn` (`@db.Date`) so `pnpm digest:run` is safe to re-run — a second run on the same day is a no-op.

### Database bring-up — three bugs only a live Postgres could find

The schema was written before Docker was available. Migrating and running it surfaced three defects that every static check (types, lint, unit tests, production build) had passed straight over:

1. **The seed was not idempotent.** `User.householdId` had no `onDelete: Cascade`, so the seed's own "delete the demo household and rebuild it" step failed with `P2003` on any *second* run — the first run passed only because there was nothing to delete. Fixed by the `cascade_household_delete` migration, which cascades `Household → User` and onward through every row referencing a user. Verified with three consecutive seeds.
2. **`import "server-only"` killed both scripts.** `lib/queries.ts` and `lib/stock-service.ts` carried it; that package throws unconditionally outside a React Server Component build, so **`pnpm bot:start` and `pnpm digest:run` both died at startup** — two documented entry points that could never have run. Removed from those two modules, with a comment explaining why they are the exception. Browser-bundle safety is already enforced by their Prisma import.
3. **Double period in the shortfall message**: the compact unit labels end in a dot, so the template rendered "Не вистачає 5 шт.. Доступно…". The message now uses the declined long form ("5 штук") and carries no trailing period of its own; `lib/stock.test.ts` asserts the rendered sentence so it cannot regress.

### Verified against a live database
`pnpm test:db` (`scripts/smoke.ts`, 25 checks) covers what unit tests structurally cannot: the multi-batch add landing 3 batches + 3 movements in one transaction, same-date rows merging, FEFO drawing from the soonest non-expired batch while leaving the expired one alone, all-or-nothing shortfall rejection writing nothing, and **household scoping** — a second household is refused on read and write. The web app was driven end to end: auth, dashboard, item detail (the water item reading 10 шт. across its three batches), items list, shopping list, settings, invite creation (stored SHA-256 only — confirmed the raw token appears nowhere), `/join` accepting a valid token and rejecting a forged one, and `/dashboard` 307-ing to `/login` without a session.

### Still not done
- **The Telegram bot's command handlers have never run.** `pnpm bot:start` now starts correctly and refuses cleanly without a token, and the digest builds and attempts a real send (verified: it produced "Псується:…" and survived a 401 from a deliberately fake token without aborting the run). But `/low`, `/add`, `/took` and the linking handshake need a real BotFather token to exercise.
- Feature 10's item-create prefill from Open Food Facts is wired at the parser level (`parseOffProduct`, tested against a fixture) and the scanner writes the barcode into the form, but the "unknown barcode → prefilled create form" jump is not built.
