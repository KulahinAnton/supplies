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
| Unit tests | vitest — pure business rules in `packages/core`, colocated `*.test.ts`, no DB |
| Package manager | pnpm (allow build scripts in `pnpm-workspace.yaml`) |

Keep every business rule (stock math, FEFO, expiry states, low-stock detection) in pure `packages/core` functions so the web UI, the bot, and any future native app share one implementation.

> **Amended by Feature 34.** This paragraph used to open "do not introduce a
> separate backend service", and `apps/api` is exactly that. The sentence was
> right about what it was protecting and wrong about how: what must not be
> duplicated is the *rules*, and a second HTTP surface duplicates them only if
> it reimplements them. `apps/api` does not — it is a third front end over the
> same `packages/core` and `packages/db`, which is the same standing the
> Telegram bot has had since Feature 9. The constraint that survives is the
> one in the sentence below: one implementation, many clients.

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

Items in `OUT` or `LOW` are **shopping-list candidates** (Feature 6) — *unless* `minQty = 0`, which opts the item out of **every** reminder: shopping candidates, the dashboard «Закінчується» panel and the Telegram digest. See Feature 25; this used to mean "out of LOW only", and OUT still nagged.

`stockState` itself is unaffected: an empty item still reads `OUT` and still shows the badge. The state is a fact about the shelf; the reminder is a policy about whether the household wants to hear it.

### 3.5 Expiry state

Household-level setting `expiryWarnDays` (default **7**). Given a batch with `expiresAt` and today:

| State | Condition |
|---|---|
| `EXPIRED` | `expiresAt < today` |
| `SOON` | `today <= expiresAt <= today + expiryWarnDays` |
| `FRESH` | `expiresAt > today + expiryWarnDays` |
| `NONE` | `expiresAt is null` |

An item's expiry state is the **worst** state among its non-empty batches. Dates are date-only (`@db.Date`) and compared with UTC getters via `packages/core/src/period.ts` — no timezone math anywhere.

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

### Feature 2 — Stock engine (pure `packages/core`, test-first)
Written and tested **before** any UI touches it.
- `packages/core/src/stock.ts` — `itemQuantity(batches)`, `availableQuantity(batches, today)`, `stockState(item, batches)`, `planConsume(batches, qty, today)` returning a FEFO draw-down plan or a `RuleMessage` shortfall error (§3.3).
- `packages/core/src/expiry.ts` — `batchExpiryState(batch, today, warnDays)`, `itemExpiryState(batches, ...)`, `daysUntil(date, today)`.
- `packages/core/src/shopping.ts` — `shoppingCandidates(items, batchesByItem)` returning items in `OUT`/`LOW` not already on an unchecked list row.
- `packages/core/src/period.ts` — date-only helpers (UTC getters, no TZ math).
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
- **Strings produced outside React keep a keyed map** — `packages/core/src/messages.ts`, a plain typed constant object (`RuleMessage` keys → Ukrainian text, with `{param}` interpolation). This covers exactly three cases, all of which must stay React-free and unit-testable:
  1. rule errors returned by the pure engine functions (`planConsume` shortfall, unit-change rejection, …),
  2. server-action / zod validation errors,
  3. bot replies and digest text.
  Pure functions return the **key plus params**, never a formatted sentence; the caller renders it. This is what makes the engine tests assert on stable keys instead of on prose.
- **Formatting is `uk-UA` everywhere**: dates `DD.MM.YYYY` via `Intl.DateTimeFormat("uk-UA")`, numbers with the Ukrainian decimal comma and space group separator via `Intl.NumberFormat("uk-UA")`. Formatting helpers live in `packages/core/src/format.ts` — never call `toLocaleString()` ad hoc in a component.
- **Ukrainian plurals are real**: "1 пляшка / 2 пляшки / 5 пляшок". Quantity and day-count strings go through an `Intl.PluralRules("uk-UA")` helper in `packages/core/src/format.ts` (`one | few | many` forms), not string concatenation. Unit labels and the "expires in N days" chips are the main consumers.
- `<html lang="uk">` in the root layout; the PWA manifest declares `"lang": "uk"` and `"dir": "ltr"`.
- Seeded data (categories, storage locations, demo items) is Ukrainian.

### Feature 9 — Telegram bot (grammy, `bot/`)
Mirrors AquaBill's bot layout (`bot/index.ts`, `bot.ts`, `auth.ts`, `session.ts`, `state.ts`) — **minus** its `i18n.ts`, since replies come from `packages/core/src/messages.ts` (§8).
- **Linking**: `/start <token>` binds the chat to a user via a short-lived link token generated in the web app, stored as `TelegramLink`. Unlinked chats can do nothing but link.
- Commands: `/low` (what's running low), `/expiring` (what's about to go off), `/list` (shopping list), `/add` (guided: item, quantity, expiry), `/took` (consume: item, quantity), `/bought` (check items off the list).
- **Notifications**: a daily digest at the household's `digestHour` listing items expiring within `expiryWarnDays` and items that went `OUT` since yesterday. Sent via `scripts/run-daily-digest.ts` (`pnpm digest:run`), safe to re-run — it never sends twice for the same day.
- Webhook in production (`app/api/telegram/route.ts`, secret-token verified), long-polling in dev (`pnpm bot:dev`).
- **Every bot action goes through the same server-side rules as the web UI** — the bot is a second front end, never a second implementation.

### Feature 10 — Barcode scanning
- "Scan" button on add-item and add-stock opens the camera (`<input capture="environment">` / `getUserMedia`), decodes with the native `BarcodeDetector` when the browser has it, `@zxing/browser` otherwise.
- A known barcode jumps straight to that item's add-stock form. An unknown one opens item-create **pre-filled from Open Food Facts** (`packages/core/src/barcode-source.ts`: pure `parseOffProduct(json)` tested against a captured fixture, plus `fetchProduct(barcode)`; override `OFF_BASE_URL`). Lookup failure is never blocking — the form just opens empty.
- **No images are stored.** Decoding happens in the browser; only the digits are sent to the server.
- In the bot, a photo of a barcode goes through the same decode path server-side, then into the existing `/add` flow.

### Feature 11 — Shopping list groups

The list is one flat column today. Once it holds more than a handful of rows that stops matching how shopping actually happens: some things come from the supermarket, some from the pharmacy, some from the market down the road. Groups let the family split the list by **whatever axis they choose** — most obviously the shop, but the name is free text, so "На дачу" or "Терміново" work just as well.

- **`ShoppingGroup`**: `id`, `householdId`, `name`, `sortOrder`, `createdAt`; unique `[householdId, name]`. Household-scoped like everything else, so the whole family sees the same groups.
- **Every list row belongs to a group.** `ShoppingListItem.groupId` is **nullable, and null means «Загальна група»** — the implicit default that everything lands in. It is deliberately *not* a row in the table: an implicit default cannot be renamed, deleted, or accidentally left missing for a household, and it needs no backfill for lists that already exist.
- **Nothing is auto-sorted into a group.** New rows — manual, from a low-stock suggestion, or from the bot — start in «Загальна група». The family moves them; the app never guesses which shop sells what.
- **Moving a row is drag and drop.** The app is mobile-first, so this must work under a finger, not only a mouse — HTML5 drag events are desktop-only in practice and are not sufficient. A non-drag fallback (a "move to group" control) ships alongside it, because drag is a poor fit for accessibility and fails badly on a cramped screen.
- **Groups collapse**, and their collapsed state is a **per-person, per-device preference** (localStorage) — not household data. One person folding away "Аптека" must not fold it for everyone else mid-shop.
- **Deleting a group never deletes its rows** — they fall back to «Загальна група». Renaming is free. A group holding rows can be deleted without a confirmation scare, because nothing is lost.
- Ordering within a group stays by `addedAt`; **reordering rows inside a group is out of scope** for v1. Drag is for moving *between* groups.

### Feature 12 — Editing a shopping row, and sorting the stock list

**12.1 Editing a shopping list row.** A row could be created but never corrected — a typo in "Свічки для торта" meant deleting it and typing it again. What is editable depends on what the row *is*, because the two kinds of row own their text differently:

- A **free-text one-off** owns its own text, so `freeText` is editable outright.
- A row that **names a real item** does not: its label is the item's name, and letting the list rename it would silently rename it in the stock, the dashboard and every past movement. That name stays read-only here; rename it on the item itself.

Both kinds gain a **`note`** — a short free-text line for the things a shopping list actually needs to carry: "2 пляшки", "тільки Roshen", "якщо буде акція". It is shown under the row and travels with it between groups. Notes are cleared along with the row when "Прибрати куплені" runs; they are not history.

**12.2 Sorting the stock list.** `/items` was hardcoded to alphabetical order, which answers "where is X" but never "what did we just buy". A sort control offers:

- **За назвою** — Ukrainian collation (`uk-UA`), the default.
- **Спочатку нові** — newest `createdAt` first, for reviewing what was added recently.
- **Спочатку старі** — the reverse, which surfaces long-forgotten items.

Sorting is a **pure, tested function** over the already-fetched rows (`packages/core/src/item-sort.ts`), not an extra query: the list is small, the filters are already client-side, and re-sorting must not cost a round trip. Every mode breaks ties by name so the order is total and stable — two items added in the same second must not shuffle between renders.

The chosen mode is a **per-person, per-device preference** (localStorage), like the group collapse state: how one person likes to scan the list is not household data.

### Feature 19 — The expiry digest actually runs

Feature 9 described a daily digest and shipped it as a CLI script, which Vercel cannot schedule: its cron calls an HTTP endpoint, not a command. The digest therefore never ran in production.

- The logic moves to `bot/digest.ts`, called by **both** `pnpm digest:run` and a new `GET /api/cron/digest`, so the two cannot drift.
- The route is guarded by **`CRON_SECRET`** — Vercel sends it as `Authorization: Bearer …`. Without the guard, anyone who found the URL could spam the family's Telegram.
- `Household.lastDigestOn` still makes it **safe to call repeatedly**: a second run on the same day sends nothing.

**A constraint worth stating plainly: Vercel's Hobby plan runs cron at most once a day.** So `digestHour` cannot be honoured there — the digest arrives when the cron fires, not at each household's chosen hour. `sendDigests({ respectHour })` makes that explicit rather than pretending: the CLI respects the hour (it can be run hourly), the cron route does not.

### Feature 18 — Widening barcode coverage

Open Food Facts alone misses most Ukrainian products — measured: 3 of 4 Ukrainian barcodes absent, both international ones present. Two changes, neither involving a retailer's storefront (no public API, against their terms, and fragile).

**18.1 A chain of free databases.** Open Food Facts has sibling projects sharing one API shape: beauty, general products, pet food. A miss falls through to the next; first hit wins. Cheap, because the parser already exists.

**18.2 Give back what you looked up.** Those databases are empty of Ukrainian goods because they are crowd-sourced and nobody has added them. When a scan finds nothing and you then name the product, the form offers to submit it — **opt-in, unchecked by default**, because sending a household's data to a third party is publishing and must be a decision rather than a side effect. Needs `OFF_USER` / `OFF_PASSWORD`; without them the offer never appears.

That is the honest fix: the *second* scan of a product already works locally, because the barcode is stored on the item. Contributing is what makes the *first* scan work — for you next time, and for everyone else.

### Feature 17 — The bot as a real interface, not just commands

**17.1 The link is a link.** Settings rendered the `t.me/…` deep link in a read-only text box with a copy button, which made the obvious action — tapping it — impossible. It is now a button that opens Telegram directly. Copying stays, secondary, for linking a chat on a different device from the one showing the page.

**17.2 A persistent keyboard.** Typing `/expiring` on a phone is a poor interface. The bot now shows a reply keyboard that stays at the bottom of the chat: **Список покупок**, **Що закінчується**, **Що псується**. The slash commands keep working — the keyboard is an addition, not a replacement.

**17.3 The shopping list, in the chat.** «Список покупок» opens the same list the web app shows, with the same capabilities: see what is on it, tick things off, add things, and move between groups.

- **Groups first.** Tapping the button lists every group with its outstanding count, plus **➕ Нова група**. Picking one opens it.
- **Inside a group**: each row is a button that toggles bought — one tap, the message edits in place, no new message each time. Bought rows show struck through and stay in the group, exactly as the web UI behaves (Feature 14.2).
- **➕ Додати** adds to *that* group, matching Feature 14.1 — the bot cannot be a back door that dumps everything into «Загальна група».
- **⬅️ Групи** goes back.

**17.4 Conversation state moves into the database.** The bot's multi-step flows kept their state in a module-level `Map`. That was defensible while the bot ran as one long-polling process; on Vercel it is wrong — each webhook call may hit a fresh serverless instance, so a half-finished `/add` is lost between one message and the next. `TelegramLink.pending` now holds it, which is durable, scoped to the chat, and disappears with the link.

Where state can be avoided entirely it is: every inline button carries what it needs in its callback data, so navigating groups and ticking rows needs no memory at all.

**17.5 A home screen.** Every action is a button on one screen — «Список покупок», «Що закінчується», «Що псується», «Додати запас», «Записати, що взяли» — and every other screen carries a way back to it. Leaf screens (the two lists) end with «Головна»; a group carries both «Групи» and «Головна», because going up one level and going home are different intentions.

The reply keyboard is reduced to the single «Головна» button. A permanent row of shortcuts duplicating the home menu would be two places to keep in step, and the second would drift.

Screens are **edited in place** rather than appended, so the chat does not fill with stale copies of the same menu.

### Feature 16 — Catching duplicate items

Two people adding "Сіль" without noticing the other did is the normal failure of a shared inventory. Barcode uniqueness already prevents it when someone scans; typed items had nothing.

Three parts, all driven by one pure matcher (`packages/core/src/duplicates.ts`) so they cannot disagree about what "similar" means.

**16.0 What counts as similar.** Names are normalised — `toLocaleLowerCase("uk-UA")`, trimmed, punctuation dropped, whitespace collapsed — and then compared three ways, strongest first:

| Reason | Example |
|---|---|
| `exact` | "сіль" vs "Сіль" |
| `contains` | "Сіль" vs "Сіль кухонна" |
| `tokens` | "Сіль кухонна" vs "Кухонна сіль" — same word set, different order |

**Edit distance is deliberately excluded.** It is the obvious next step and it misfires badly on short Ukrainian words: "Сік" and "Сіль" are two edits apart and are not the same thing. Catching a typo is not worth telling someone their salt is juice.

Matching **never blocks**. Every part of this feature warns, suggests, or lists — the family decides. Two items that look alike may be genuinely different ("Сіль морська" / "Сіль кухонна"), and a hard constraint would fire at the worst moment: someone standing in the kitchen trying to record what they just bought.

**16.1 Warn while typing.** The new-item form checks the name against the household's existing items **as you type** and shows a note under the field naming what it might duplicate, with a link to that item. Matching runs on the client against the item names already sent with the page — the list is small, and a warning that needs a round trip arrives too late to be read.

When editing, the item being edited is excluded from its own matches.

**16.2 Search before create.** The duplicate usually exists because the person could not find it. Typing in the `/items` search now offers **«Створити „X"»** alongside the results, so searching is the first act and creating is the fallback rather than the obvious path. That button carries the query into the form (`/items/new?name=…`), so nothing is retyped.

**16.3 List what already exists.** Settings gains a **«Схожі товари»** section clustering existing items that match each other, each linking to both. It only appears when there is something to show. It reports; merging is out of scope here — archiving the emptier of a pair (Feature 3) is the tool available today, and a real merge that moves batches and movements is a separate, larger piece of work.

### Feature 15 — Ordering categories and locations, and a default for each

Both lists in Settings gain the same two behaviours, so they share one component rather than growing two near-identical implementations.

**15.1 Drag to reorder.** `sortOrder` already existed on both `Category` and `StorageLocation` and was only ever set by creation order. Dragging now rewrites it, and that order drives the selects on the item form — so the things you add most often can sit at the top instead of wherever they happened to be created.

Reordering is a **whole-list rewrite**: the client sends the ids in their new order and the action writes `sortOrder = index` for each, in one transaction. Sending a single moved id and patching around it invites gaps and ties; rewriting the list cannot drift.

**15.2 A starred default.** `isDefault` on both models. The starred row is pre-selected when adding a new item — the category select opens on it, and the location select does too instead of «Не вказано».

- **At most one per list**, enforced in a transaction that clears the others before setting the new one. The invariant lives in the action, not in hope.
- **Starring is a toggle**: starring the already-starred row clears it, leaving no default. That is a legitimate state — the first category by `sortOrder` is used for the category select, and the location select falls back to «Не вказано».
- Deleting a starred row simply leaves the list with no default; nothing needs repairing.

Both lists keep their existing rules: a category or location still cannot be deleted while items reference it, and categories keep their per-category expiry window from Feature 13.

### Feature 14 — Adding into a group, and archiving bought rows

Two revisions to Feature 11, from using it in a real shop.

**14.1 Add straight into a group.** Every group gets its own add field, so something can be written down where it belongs instead of landing in «Загальна група» and needing a second action to move it. The **top-level add field stays and still adds to «Загальна група»** — it is the fastest path when you do not yet know which shop a thing comes from, and losing it would make the common case slower.

**14.2 Bought rows stay put.** Ticking a row previously teleported it to a separate «Куплено» section at the bottom of the page. That is wrong in a shop: you tick things as you walk, and the list you are reading reorders itself under you, so you lose your place and cannot see at a glance what remains in *this* aisle.

Instead a ticked row **stays in its group, struck through**. It is still visible, still counted, still where you left it.

Clearing the list is then a separate, deliberate act:

- **Archiving** a row hides it from the group. `ShoppingListItem.archivedAt` — null means visible. Archiving is not deletion: nothing is lost, and the row can come back.
- Each group has a **toggle to show its archived rows**. Hidden by default; the toggle is per-person and per-device, like the collapse state, and appears only when a group actually has archived rows — an control that reveals nothing is noise.
- An archived row can be **unarchived** (back into its group, still ticked) or **deleted** outright.
- The bulk action archives every ticked row at once, rather than deleting them. What it does is now recoverable, which is why it no longer needs the warning tone its "Прибрати" name carried.

Ordering within a group puts **unticked rows first, then ticked**, each by `addedAt`. Ticked rows sinking within their own group is the useful half of the old behaviour; jumping to a different part of the page was the harmful half.

### Feature 13 — Per-category expiry warning

One warning window for the whole household is wrong in practice. Yoghurt needs a few days' notice; medicine, cleaning products and tinned food are worth flagging weeks ahead, because replacing them is a planned errand rather than a trip to the corner shop.

- **`Category.expiryWarnDays` is nullable, and null means "inherit"** — the household's `expiryWarnDays` is used. It is deliberately not a copy of the household value: a category set to "inherit" must *follow* the household default when that default changes, and a copied number would silently stop tracking it.
- **Resolution is a pure function** (`resolveWarnDays(category, household)`), so the fallback is stated once. Every place that computes an expiry state resolves it **per item, via that item's category** — the item list, the dashboard, the item detail page, the Telegram bot and the daily digest all go through `@supplies/db/queries`, so they cannot disagree.
- **Range 0–365**, same as the household setting. 0 is meaningful: it means "only warn me on the day itself".
- The dashboard header shows the **household default**, with a note when any category overrides it — claiming a single number applies to everything would be a lie once overrides exist.
- Settings lists each category with its own days field, blank meaning inherit. Clearing the field returns the category to inheriting, rather than setting 0.

## 7. Conventions

- Quantities are Prisma `Decimal(12,3)` — never float math; pass values to Prisma as strings; round to 3 dp.
- Expiry and "opened" dates are **date-only** (`@db.Date`); compare/format via `packages/core/src/period.ts` (UTC getters).
- Business rules live in pure `packages/core` functions with colocated vitest tests; when a rule changes, its tests change in the same commit.
- Every mutation writes its `StockMovement` in the **same transaction** as the batch change — no exceptions.
- Server actions guard with `requireSession()` and scope **every** query by `householdId`. A household must never be able to read or write another household's rows.
- Household settings (`expiryWarnDays`, `digestHour`) are **data**, not constants — the engine takes them as input.
- **Ukrainian only** (§8): copy inline in components; rule/action/bot strings keyed in `packages/core/src/messages.ts`; all date and number formatting through `packages/core/src/format.ts` (`uk-UA`, plural rules). No English in the UI, no i18n library.
- Env (`.env`, gitignored; template `.env.example`): `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`; optional `OFF_BASE_URL` (barcode source override).

## 8. Implementation notes

Recorded per §5.6 as features landed. Deviations from the spec above, and the reasons.

### Feature 0
- Next.js **16.3.1** / React **19.2.8** (create-next-app latest), a patch ahead of Kvartal's 16.2.10. Same major, no API differences encountered.
- `vitest.config.mts` (not `.ts`) — Vite's native config loader warns about ESM-in-CJS otherwise. Uses `import.meta.dirname` for the `@` alias.
- shadcn components are added with `pnpm exec shadcn add`, **not** `pnpm dlx` — dlx's sandbox cannot resolve `zod` and the CLI crashes. `shadcn` is therefore a devDependency, as in the other two repos.
- `pnpm-workspace.yaml` uses pnpm 11's `allowBuilds:` map, matching Kvartal.

### Feature 2
- The engine is Prisma-typed but Prisma-runtime-light: it imports `Prisma.Decimal` for arithmetic only. §3.6 is reproduced verbatim in `packages/core/src/stock.test.ts` — 110 tests pass across the seven engine test files.
- `stockState` reads **total** stock, not available (§3.4 as written): an item whose only stock is expired reads OK/LOW while the expiry dashboard flags it separately. The two axes stay independent so neither can hide the other.

### Feature 4
- **Added: multi-batch add form.** One purchase with several expiry dates is one submit — see the Feature 4 bullet above. Rows naming the same date are merged into one batch rather than creating two the FEFO planner has to tie-break.
- **Refactor:** the stock write path lives in `@supplies/db/stock-service`, which takes an `Actor` (`{userId, householdId}`) instead of reading a session. Server actions call it after `requireSession()`, the bot after resolving a linked chat. Without this, Feature 9 would have been a second implementation of the same rules — exactly what that feature forbids.

### Feature 8
- `packages/core/src/format.ts` is deliberately **Prisma-free**. Client components import it for unit labels, and importing the generated client into a browser bundle drags `node:module` in, which fails the Turbopack build ("the chunking context does not support external modules"). It accepts any `Numeric` (anything with `toString()`), so a `Decimal` still works.
- `packages/db/src/generated/prisma/enums.ts` has no imports of its own and is safe client-side — that is how `Unit` reaches the forms.

### Feature 9
- **Link tokens are stateless**: a signed `userId.expiry.signature` triple (`packages/core/src/telegram-link.ts`, HMAC over `AUTH_SECRET`, 15 min). No table, no cleanup job, no replay after expiry. Rotating `AUTH_SECRET` invalidates outstanding link tokens — intended.
- Conversation state is an in-memory `Map` (`bot/state.ts`), so it is per-process and lost on restart. Acceptable: a half-finished `/add` costs one retyped word. Revisit only if the webhook is ever load-balanced.
- **Added:** `Household.lastDigestOn` (`@db.Date`) so `pnpm digest:run` is safe to re-run — a second run on the same day is a no-op.

### Database bring-up — three bugs only a live Postgres could find

The schema was written before Docker was available. Migrating and running it surfaced three defects that every static check (types, lint, unit tests, production build) had passed straight over:

1. **The seed was not idempotent.** `User.householdId` had no `onDelete: Cascade`, so the seed's own "delete the demo household and rebuild it" step failed with `P2003` on any *second* run — the first run passed only because there was nothing to delete. Fixed by the `cascade_household_delete` migration, which cascades `Household → User` and onward through every row referencing a user. Verified with three consecutive seeds.
2. **`import "server-only"` killed both scripts.** `@supplies/db/queries` and `@supplies/db/stock-service` carried it; that package throws unconditionally outside a React Server Component build, so **`pnpm bot:start` and `pnpm digest:run` both died at startup** — two documented entry points that could never have run. Removed from those two modules, with a comment explaining why they are the exception. Browser-bundle safety is already enforced by their Prisma import.
3. **Double period in the shortfall message**: the compact unit labels end in a dot, so the template rendered "Не вистачає 5 шт.. Доступно…". The message now uses the declined long form ("5 штук") and carries no trailing period of its own; `packages/core/src/stock.test.ts` asserts the rendered sentence so it cannot regress.

### Verified against a live database
`pnpm test:db` (`scripts/smoke.ts`, 25 checks) covers what unit tests structurally cannot: the multi-batch add landing 3 batches + 3 movements in one transaction, same-date rows merging, FEFO drawing from the soonest non-expired batch while leaving the expired one alone, all-or-nothing shortfall rejection writing nothing, and **household scoping** — a second household is refused on read and write. The web app was driven end to end: auth, dashboard, item detail (the water item reading 10 шт. across its three batches), items list, shopping list, settings, invite creation (stored SHA-256 only — confirmed the raw token appears nowhere), `/join` accepting a valid token and rejecting a forged one, and `/dashboard` 307-ing to `/login` without a session.

### Gap-closing pass
A review of the finished code against this spec found four things written but not wired. All four are now done:

- **Archive was dead code.** `setItemArchivedAction` existed, correctly guarded and scoped, and nothing called it — so Feature 3's "create/edit/**archive**" was two-thirds delivered. Added `components/item-archive-button.tsx` (with a confirm step, and a warning when the item still holds stock), `/items/archive` to list and restore, and a discoverable "Архів (n)" link on `/items`. Archived items are hidden from the item list, both dashboard cards, the shopping candidates and the header counts, and their stock actions disappear on the detail page — verified against the live database, all six surfaces.
- **`openedAt` had no input.** The row type, validation and schema all carried it; no form ever set it. It now appears behind a per-row "+ вказати дату відкриття" toggle rather than a third always-visible column, since most stock-ins are of sealed packs. The picker is capped at today, because the server rejects a future opened date.
- **Barcode scanning was only on add-item** (Feature 10 says add-item *and* add-stock). The add-stock form now scans too, but as a **check rather than an input**: it compares the scan against the item's stored barcode and says so when they differ. It warns, never blocks — a mismatched scan is often a repackaged product, not a mistake.
- **No webhook registration.** Feature 9 specifies a production webhook with nothing to register it. `scripts/set-telegram-webhook.ts` (`pnpm bot:webhook:set` / `:delete`) does it, and refuses two footguns: a non-HTTPS `APP_URL` (Telegram cannot reach localhost) and a missing `TELEGRAM_WEBHOOK_SECRET` (an unauthenticated webhook URL lets anyone who guesses it post fake updates).

### Still not done
- **The Telegram bot's command handlers have never run.** `pnpm bot:start` starts correctly and refuses cleanly without a token; the digest builds a real message and survives a 401 from a deliberately fake token without aborting the run. But `/low`, `/add`, `/took` and the linking handshake need a real BotFather token, and `TELEGRAM_BOT_USERNAME` must be set before the Settings "Прив'язати Telegram" button can build its deep link.
- **Nothing schedules the digest.** `pnpm digest:run` is safe to run hourly and no-ops outside the household's `digestHour`, but no cron or Task Scheduler entry calls it.
- **No deployment target.** Docker Compose covers local Postgres only; there is no host, no production `DATABASE_URL`, and `RESEND_API_KEY` is unset so password-reset and invite emails silently no-op (by design — the UI never reveals it — which also means that path is untested).
### Feature 10 completed — barcode prefill
A scanned (or typed) barcode now fills the item form, via `lookupBarcodeAction`:

1. **The household already has that barcode** → say so and link to the item, before any network call. This is the likelier case — the family is restocking, not cataloguing — and it heads off a duplicate the unique index would reject with a far worse message.
2. **Otherwise** look it up in Open Food Facts and pre-fill the name, but **only when the name field is still empty** — silently overwriting typed text would be worse than not helping.
3. **A miss is not an error.** Verified against the live API: `5449000000996` → "Coca-cola 330 мл", while a real Ukrainian water barcode is simply absent from their database and leaves the form untouched.

Pack size is parsed by the pure, tested `parsePackSize` and appended to the *name* ("Coca-cola 330 мл"), the way the seed data reads — **never** to `minQty`. The distinction is the whole model: the app counts bottles, not the litres inside them, so 1,5 л is part of what the thing is called. `6 x 1.5 l` yields the unit size, not the multipack total; `cl` normalises to ml; and the first letter is capitalised because Open Food Facts is crowd-sourced and its names are often all-lowercase.

Typing a barcode triggers the same lookup on blur — the camera is a convenience, not the only way in.

### Expiry phrasing carries its own verb

`packages/core/src/format.ts` exposes `formatExpiryLabel(date, today)`, which returns a
complete phrase — «придатне ще 7 днів», «спливає сьогодні», «прострочено 3 дні
тому». It replaced `formatExpiryRelative`, which returned only *when the date
fell* («через 7 днів») and left each caller to supply the verb.

That split was a trap, and all three callers fell into it. `ExpiryBadge`
prefixed «Придатне», rendering **«Придатне через 7 днів»** — "becomes edible in
7 days" — for food that *goes off* in 7 days, the exact inversion of the
warning. The digest and the bot listed already-expired items under «⏳
Псується:» as a bare «3 дні тому».

The unit tests passed the whole time, because they asserted the fragment the
function returned and never the sentence the user read. Tests for user-facing
copy must assert the **rendered string**, including any prefix.

Consequently:

- Never prefix a state word onto a date phrase. A function that formats copy
  about a state returns that copy whole.
- The badge derives its wording from the date alone, not from `state`, so the
  two can no longer disagree.
- Note that "expires today" is `SOON`, not `EXPIRED` (`batchExpiryState` is
  inclusive of today), so «придатне» would have been *technically* true on the
  last day and still read as reassurance. Hence «спливає сьогодні».

### Feature 20 — GS1 Ukraine (GEPIR) as a barcode fallback

A last-resort source for barcodes Open Food Facts and its siblings do not
know. Ordered strictly after them: OFF chain → miss → GEPIR.

**It yields a manufacturer, never a product.** GEPIR is a registry of which
company licensed a GTIN, not a product catalogue — it answers «ТОВ «САНДОРА»»
and has no product-name field at all. So the name field is never pre-filled
from it. The form shows a separate sentence: «За даними GS1 Україна, виробник
— ТОВ «САНДОРА». Введіть назву вручну.» That is a genuine head start when the
user is about to type the name, and it is worded as a distinct fact so it can
never be mistaken for the product name.

**Only 482 prefixes are asked about.** Not tidiness — a foreign GTIN makes
gepir.gs1ua.org forward to the global GEPIR router, which never answers.
Measured: a Ukrainian code replies in ~0.3–0.7s, a Belgian one hung past 40s.
The prefix gate is what keeps the 6s timeout from being load-bearing.

**There is no API.** The flow is a Symfony form — GET for a session cookie and
a CSRF token, then POST. That makes it scraping, with scraping's lifespan:
every failure path returns "no hint" rather than an error, and the parser is
pure and tested against **real captured HTML** in `packages/core/src/__fixtures__/`, because
invented markup would hide the exact failure this feature is exposed to.

**Answers are cached in `GepirLookup`, misses included.** Global, not
per-household: a barcode has the same manufacturer for everyone. Caching the
misses is the point — "GS1 Ukraine has no record" is the common answer for a
code OFF also lacks, and re-asking on every scan is the traffic worth not
sending. `unavailable` is never cached, so one timeout cannot become a
permanent blank.

`GEPIR_BASE_URL` overrides the host, as `OFF_BASE_URL` does.

Rejected: **base2base.ua**. It is a Blazor Server app whose UI talks over a
SignalR WebSocket exchanging render-tree diffs — there is no REST endpoint to
call. Emulating it means driving a stateful, versioned protocol that breaks on
any redeploy of their site, and the headless-browser alternative does not fit
in a Vercel serverless function.

### Feature 21 — scanning from the items search

`/items` gets a scan button beside the search field.

- **Hit → open the item.** The scan already identified exactly one item, so
  filtering the list to it would be asking a question with one answer.
- **Miss → a hint under the search field**, naming the code, with a button to
  create it. The code travels as `/items/new?barcode=…` and is pre-filled,
  matching the existing `?name=` handover of Feature 16.2.

**Archived items count as a hit.** Their barcode still occupies the
`[householdId, barcode]` unique index, so offering "create" would walk the
user into a constraint error; showing the archived item they already own is
both truthful and what they need.

**A separate action from `lookupBarcodeAction`.** That one serves the item
*form*, and on a miss asks Open Food Facts and then GS1 Ukraine — seconds of
network for a question the search bar never asked. `findItemByBarcodeAction`
is one indexed query, so searching stays instant.

**The code is never written into the search box.** The text filter matches
names; a barcode there empties the list and then offers to create an item
literally named «4823063114912». It lives in its own state with its own hint,
and typing a name clears it, because typing replaces the scan as the active
question.

Arriving at the form with `?barcode=` starts the full lookup automatically —
otherwise the user would have to click into the pre-filled field and back out
to get the name suggestion. It is scheduled on a task boundary rather than
called in the effect body: setting state synchronously in an effect is what
causes cascading renders, and the React Compiler lint is right to reject it.

### Feature 21 fix — one barcode pattern, and failures that admit it

Two defects, found by the first real use of the items-page scan.

**The pattern was written out three times and one copy lost its backslash** —
`/^d{6,14}$/` rather than `/^\d{6,14}$/`. That matches the letter "d" repeated
and no digit at all, so every scan from the items list was rejected as
malformed while the identical scan in the item form worked. The two screens
contradicted each other about the same barcode. There is now a single
`BARCODE_PATTERN` in `packages/core/src/validation/shared.ts`, used by the item schema and
both actions, with tests that assert real GTIN-8/12/13/14 codes pass.

**The handler reported a failure as an answer.** `onScan` mapped any
unsuccessful result to "not in your stock", so a validation fault rendered as
a confident, wrong fact about the family's data — which is why the bug looked
like a data problem rather than a broken lookup. Failures now render as
failures. A wrong answer stated plainly is worse than an error, because
nobody goes looking for a cause.

### Feature 22 — per-batch storage location, and visible barcode/notes

**The problem.** A household can keep the same product in two places — the
kitchen fridge and the basement fridge. `Item.locationId` can only name one,
so the second place was unrepresentable.

**The model.** `StockBatch.locationId` is nullable and independent of the
item's. The item's location remains the default: it is where this product
normally goes, and it pre-fills every new row in the add-stock form. A batch
row may override it.

Null means "wherever the item says". That single rule covers three cases at
once: batches created before this feature, rows submitted by callers that know
nothing about locations (the shopping-list buy flow), and items with no
location at all.

**Migration.** Existing batches were backfilled from their parent item, since
that is what they implicitly meant — the only location the app could express.
Verified after applying: zero batches disagreed with their parent.

**The merge key now includes the location.** `addStock` merges rows naming the
same date so that "3 bottles, 12.03" twice becomes one batch of 6. Two rows
for the same date on *different shelves* must not merge — doing so would
silently move stock, which is precisely what this feature exists to prevent.
Pinned by a smoke check.

**A row may only name this household's shelves.** The id arrives from a
client, so it is checked against the household's own locations; otherwise one
household could file stock under another's shelf.

**Display.** The item page shows a batch's location only when it *differs*
from the item's own. Repeating the item's shelf on every batch is noise; the
exception is the information. The items list still shows the item's default
location, which remains true — it is the product's home, not a claim about
every batch.

**Also:** the item page now shows the **barcode** and **notes**. Both could be
entered on the form and then never seen again — the barcode was effectively
write-only. A field you can fill but not read is worse than no field at all.

### Feature 23 — sorting the stock list by expiry

Two new modes beside the existing name and date-added ones:

- **«Спочатку прострочені»** — earliest expiry first, so the most overdue item
  is at the top and the next thing to go off is right behind it. One order
  answering both "what have we lost?" and "what must we use up?".
- **«Спочатку з довгим терміном»** — the mirror, for "what can wait?".

**Undated items sink to the bottom in both directions.** No date means
*unknown*, not *urgent* and not *safe*, and unknown never outranks a date. A
naive reverse comparator would float undated items to the top of the "can
wait" list — the one place nobody would think to check for a mistake. An
unparseable date is treated the same way, so corrupt data can never
masquerade as the most urgent thing in the house.

**The date-added labels were renamed.** «Спочатку нові» / «Спочатку старі»
read as either axis once expiry sorting existed; they are now «Нещодавно
додані» / «Давно додані». The stored *keys* are unchanged, so a preference
already in someone's localStorage keeps working — only the wording moved.

### Feature 22.1 — db:prod-copy points the app at the copy

The script used to load the dump and then print a DATABASE_URL for someone to
paste into `.env.local` themselves. Skipping that step leaves the app on the
dev database, and the symptom is the worst kind: the app looks exactly as it
did before, so a restore that fully succeeded reads as having failed.

It now writes `.env.local` itself when the file is absent, says so when it
already points at the copy, and refuses to overwrite a file pointing anywhere
else — printing the line to change instead, since that file may hold unrelated
overrides. `--no-env` skips it entirely.

It also says the two things that are not obvious: **restart the dev server**,
because env files are read once at startup, and **log in with the production
password**, because this is the real user table.

### Feature 24 — taking from a specific batch, expired included

**The problem.** With only expired stock, «Взяти» refused and said there was
none — «немає доступного запасу» — while the shelf held four cartons. FEFO's
available total is zero because it skips expired batches, so the message was
technically true and practically a lie, and it offered no way forward except
to record the food as waste, which is a different fact.

**The rule, restated.** §3.3's "consumption skips expired batches" exists so
that "we drank it" can never be recorded **silently** against food that had
gone off. That is a rule about silence, not prohibition. Someone looking at
one batch and choosing it has already made the judgement the rule exists to
force.

So there are now two verbs:

- **Item-level «Взяти»** — FEFO, still refuses expired stock. Unchanged.
- **Per-batch «Взяти»** — takes from exactly that batch, expiry not consulted,
  because the caller has consulted it.

Both write `CONSUME`. Discarding still writes `WASTE`. Used and binned are
different facts and the movement log is the only place that distinction
survives, so the per-batch take is deliberately *not* implemented as a
discard.

**`consumeBatch` lives in `@supplies/db/stock-service`**, not in the action, like
every other stock write: one implementation, two front ends. The bot will want
it the first time someone tries to finish an expired carton from their phone.

**The item-level message now tells the truth.** When live stock exists but
FEFO can reach none of it, `planConsume` returns `stock.allExpired` — «Усе
прострочено. Візьміть із конкретної партії або спишіть її.» — instead of a
shortfall of zero. The old test asserted the misleading wording, which is how
a confusing message survives a test suite; it now asserts the clear one, with
the refusal itself unchanged.

### Feature 25 — minQty 0 means no reminders at all

**Reported:** items with `minQty` set to 0 kept appearing in the dashboard's
«Закінчується» panel and in the Telegram digest.

**Cause.** `needsRestock` took only the `StockState`, and an empty item reads
`OUT` whatever its threshold. So `minQty = 0` suppressed `LOW` and nothing
else. That was the documented rule — §3.4 said "opts out of low-stock nagging"
and a test pinned it — but the item form had always promised «0 — не
нагадувати» with no qualification, and half an opt-out is not an opt-out.

Worse, it failed in precisely the case the setting exists for: something you
keep occasionally, do not want chased about, and which therefore sits at zero
most of the time. It came back every single day.

**Now** `needsRestock(item, state)` takes the item, because the threshold is
the opt-out and the state alone cannot express it. `stockState` is untouched —
the item still reads `OUT` and the badge still says «Закінчився». Fact and
policy are separate.

**Consequence worth knowing:** `minQty` defaults to 0, so an item whose
minimum was never set now never appears in a reminder. That is the honest
reading of "0 = don't remind", but it does mean restock reminders are
opt-*in*. Changing the new-item default from 0 to 1 would flip that back
without weakening the opt-out.

### Feature 26 — sets of interchangeable items («Набори»)

**The problem.** The same product arrives under a new barcode when a
manufacturer changes it, or under a different brand. `@@unique([householdId,
barcode])` forces those into separate items, and each then carries its own
`minQty` — so the household maintains three thresholds for one need and gets
three reminders that all mean "buy milk".

**The model.** `ItemGroup` (household-scoped, named, sortable) owns a `minQty`.
`Item.groupId` is nullable. Members stay separate items: separate batches,
separate expiry dates, and the item list still shows which brand is in the
cupboard. What changes is who answers "are we short?".

**The group owns the threshold.** A member's own `minQty` is ignored while it
is grouped, so there is exactly one number to maintain. The item form replaces
the field with a line saying where the threshold now lives — showing an input
that silently does nothing is worse than not offering it.

**One line per group, everywhere a reminder appears** — dashboard, shopping
suggestions, Telegram digest, bot, and the nav badge count. `getRestockEntries`
builds that list once so no surface can disagree; a grouped item never appears
on its own.

**The unit is derived, never stored.** Every member must share one unit, and
`canJoinGroup` refuses a mismatch at the moment of joining. Summing 2 litres
and 3 pieces gives 5 of nothing, and a reminder built on it is advice nobody
can act on. Deriving the unit from the members means the invariant cannot
drift the way a stored copy could.

**`stateFor(quantity, minQty)` was extracted** from `stockState` so an item and
a group ask the same question of a different total. Two copies of that
arithmetic would eventually disagree about what "low" means.

**A group suggestion goes on the shopping list as free text**, because the app
cannot know which brand will be bought — the shopper decides in the shop.
Writing down any member settles the need, so the group stops asking.

**An empty group never reminds**, whatever its threshold: that is someone
mid-setup, not a shopping need. Deleting a group with members is refused
rather than cascading, since emptying it silently would leave those items with
no threshold at all and they would quietly stop being watched.

**Not built:** multiple barcodes per item. That is the better answer to the
*same* product under a new barcode — one item, several codes, no new concept —
and remains worth doing separately. Groups answer the other half: different
products the household treats as interchangeable.

### Feature 26.1 / 26.2 — the set badge, and the sets view

**26.1 — a badge on the items list.** A grouped item's own minimum is ignored
and it never appears in a reminder on its own. Without saying so on the row,
an item sitting at zero and silently absent from the shopping list looks like
a bug. The badge names the set it is counted with.

**26.2 — `/groups`, and `/groups/[id]`.** The list shows every set with its
member count and threshold; the detail page shows the combined total, its
state, and the members, and is where members are added and removed.

- **Adding is by search or by barcode scan**, over items the household already
  has. The page deliberately **cannot create items**: a set is a way of
  counting things you already track, and minting items here would put a
  second, thinner item form in front of the user and produce items with no
  category, no location and no stock. An unknown scanned code says so and
  points at «Запаси».
- **Items already in another set are offered, with that set named.** The item
  form has always allowed changing the set, so refusing here would be an
  inconsistency to discover; naming the current set means a move is never a
  surprise.
- **Incompatible units are shown but not addable**, with the reason on hover.
  Hiding them would read as the item not existing.
- **Creating and deleting sets stays in Settings**, beside categories and
  storage locations. This view is about what is *in* a set, not which sets
  exist.

**Entry points:** the Settings row opens its set, and the items page shows a
sets button — only once at least one set exists, since a permanent button for
an unused feature is clutter and an absent one for a used feature is a dead
end. Not added to the bottom nav: five labelled items crowd a narrow phone.

### Feature 26.4 — a set says how much it holds, not only how many

**Reported:** the settings panel shows the number of products in a set but not
their combined stock, which makes choosing the set's minimum uncomfortable —
the minimum is a number you pick by comparing it against what is actually in
the house, and that number was on another page.

The member count and the total now sit together under the set's name, in both
places that list sets: «товарів: 2 · разом 38 л» in Settings, and the same in
`/groups` ahead of the existing «мінімум 6 л». Nothing was moved; the line that
already said how many products now also says how much.

The total comes from `buildGroupView`, the engine the set's own page uses, so
the number under the name and the number on the set page cannot drift apart.

**Two queries, not one.** `getItemGroups` stays cheap — id, name, unit, count —
and still serves the item form's set selector and the /items header. The new
`getItemGroupViews` loads every member's batches, because quantity is derived
from live batches at read time and never stored, so there is no column to sum
in SQL. Feature 28 worked to keep the items list's query small; making all five
callers pay for the batches would have undone part of that.

**Archived members no longer count.** The settings count included them while
the set page did not, so a set could report four products and then show three.
Both now read the live members, and `pnpm test:db` asserts it: archiving a
member drops it from the count and its stock from the total.

### Feature 27 — the items list keeps its state across Back

**Reported:** filter and sorting reset after opening an item and pressing Back.

Search text, filter chip and category were plain component state, so the
component remounting rebuilt the list from scratch. Sorting was already
persisted in localStorage and did survive — but with the other three gone the
list looked reset, which is the same thing from the user's side.

**The state now travels in the URL.** `/items?q=…&filter=…&cat=…&sort=…`, read
on the server and used to seed the client state. Back restores exactly what was
on screen because the browser already remembers URLs — no restore logic, no
sessionStorage, and the view is now linkable.

**Written with `router.replace`, debounced.** The first attempt used
`history.replaceState` to avoid a server round trip per keystroke. It does not
work: replaceState never tells Next's router, so Back was answered from the
cached payload for a bare `/items` and this effect then overwrote the restored
parameters with the empty state it had just been handed. A real navigation
keeps the router cache keyed by the URL the user actually sees; a 350ms
debounce stops the search box navigating on every character, and an equality
check makes the mount pass a no-op.

**Do not wrap this list in `Suspense` around `useSearchParams`.** The second
attempt read the URL on the client to dodge the caching problem. The subtree
then never hydrated — every filter chip rendered but had no React fiber and no
click handler, so the whole list was inert while looking perfectly normal. The
state is seeded from the page's `searchParams` props instead.

**Defaults are never written**, so an untouched list stays at plain `/items`
rather than carrying four parameters that all say "nothing is set".
`packages/core/src/item-list-params.ts` holds that rule and the parsers, tested — a
hand-edited value falls back instead of producing an empty list.

**localStorage and the URL do not conflict.** localStorage is "how I like lists
ordered"; the URL is "how this list was ordered when I left it". The URL wins
when it says something, so Back restores the view; opening `/items` fresh with
no `sort` still honours the remembered preference.

Also removed a latent discrepancy: the filter type was `"all" | "attention" |
StockState`, which admitted `"OK"` — a filter the chips never offer and the
list would have shown nothing for. There is now one definition, in lib, shared
with the URL parser.

### Feature 27.1 — the item page returns to the view you left

Browser Back restored the list, but the item page’s own «Запаси» link went to
a bare `/items` and threw the filtering away. The page cannot know which view
it was opened from, so the list tells it: item links carry the current query
string as a `from` parameter, and the back link rebuilds `/items?…` from it.

Carrying it on the link rather than reading history also means the back link
still works after a refresh, and when the URL is shared.

`from` arrives inside a URL, so it is **re-parsed and re-serialised**, never
pasted through: only `q`, `filter`, `cat` and `sort` survive, and the filter and
sort are validated. The result can only ever describe a list this app renders.

### Feature 26.3 — the search survives adding to a set

Adding an item cleared the search box, so the results emptied after every
single add and filling a set of six meant typing «горошок» six times. Filling a
set is inherently a repeated action; the form was built as though it were a
one-off.

The term now stays. The added item leaves the candidate list by itself once
the page refreshes — it is a member now — so what remains on screen is exactly
what is still left to add, and the next slot fills from further down the
matches.

### Feature 28 — pagination, with the page chosen on the server

The list shows one page at a time — 10, 25, 50, 100 or all — and the server
sends only that page.

**Filtering and sorting had to move server-side with it.** They cannot be
split: filtering one page in the browser filters the wrong set, and the result
looks entirely plausible. `packages/core/src/item-filter.ts` now holds the predicate the
component used to own, so the rule is applied once, in one place, and tested.

**The server still loads every item, and that is not laziness.** `stock` and
`expiry` are derived from batches by the engine and never stored, so nothing
can know which items belong on page 1 without considering all of them.
Expressing §3.4 and §3.5 in SQL would be a second implementation of the rules,
free to disagree with the first. What the page buys is the wire and the DOM:
25 rows reach the browser instead of the whole cupboard, which is what costs
on a phone.

**Every control navigates explicitly**, replacing the effect that watched all
the state and rewrote the URL. That effect could not tell a filter change (go
to page 1) from a pager click (go to page 4), and would have bounced the user
back to page 1 the moment they paged.

**A page past the end clamps to the last real page** rather than rendering
nothing: narrowing a filter while on page 7 would otherwise show an empty list,
which reads as "your filter matched nothing".

**The page-size control shows whenever the list does**, not only when there are
several pages — it is how you get back to seeing everything, so hiding it on a
short list would strand anyone who picked 10 and then filtered down to 8.

**Categories come from the whole household**, never the page: a chip list that
changed as you paged would be unusable.

### Feature 29 — METRO Ukraine as a barcode source

METRO's own labels — METRO Chef, aro, METRO Professional — are in no open
database. Open Food Facts has never heard of them and GEPIR can only ever name
the company, so scanning one produced nothing useful.

Their shop knows them. Two unauthenticated JSON calls: search resolves a
barcode to an internal id, then a second endpoint turns that id into a
description («METRO Chef Курага 500г»).

**Placed before GEPIR, after Open Food Facts.** It answers a better question
than GEPIR — the product rather than the company — so when it hits, the name
is filled in and a manufacturer hint has nothing to add.

**The exactness had to be established by experiment.** No response contains an
EAN — not the search, not the detail endpoint, not the rendered product page —
so a match cannot be checked against the question that produced it. If the
search were fuzzy it would confidently prefill the wrong product, which is
worse than finding nothing. Five valid-check-digit codes that no product uses
all returned zero results, while a real EAN returned the right product, so the
search is exact on EAN.

That test mattered: the first suspicious result, `4820000000000` returning
«aro Крупа перлова», looked like fuzzy matching. Its check digit is valid — it
is simply aro's real barcode.

**Caching moved to one table.** `BarcodeFact(barcode, source, value)` replaced
`GepirLookup`; two sources answering the same question about the same key did
not warrant two tables, and a third would have made it three. The migration
carries the existing GEPIR answers across rather than making every cached
lookup happen again.

**Caveats, since this is an undocumented internal API.** It can change without
notice, it is a commercial site's endpoint rather than a public one, and
METRO is a wholesale catalogue whose pack sizes are cases — «12 х 0,33л» where
a household would say one bottle. Every failure path returns no suggestion.
`METRO_BASE_URL` and `METRO_STORE_ID` are overridable; unsetting the base URL
is not a kill switch, so if it should be removable, say so and I will add one.

#### 29.1 — METRO also answers when Open Food Facts replies in English

Confirming Feature 29 with a real METRO Chef code, `4337182256663`, showed the
feature would not have fired at all: OFF **does** know that barcode, as
«METRO Chef HASH BROWN TRIANGLES» with no pack size. Since OFF came first and
its answer was non-empty, METRO was never asked, and a Ukrainian-only UI got an
English name.

So OFF's answer is now judged before it is accepted. `needsLocalName` decides,
on the product NAME alone:

- Cyrillic anywhere in it → OFF answered in Ukrainian, keep it.
- Otherwise, a name led by its own brand is a proper noun — «Nutella»,
  «Coca-Cola» — keep it. Nobody wants a brand replaced by a wholesale
  description.
- Otherwise it is untranslated prose («HASH BROWN TRIANGLES» under brand
  «METRO Chef») → ask METRO, and use its name if it has one.

Two details this rule had to avoid. `product_name_uk` is **not** the signal:
none of the three real entries above has one, including the two worth keeping.
And the check is on the name, never on the composed suggestion —
`suggestedItemName` appends a localised pack size, so "Coca-Cola 330 мл"
contains Cyrillic without being any more Ukrainian than the METRO Chef stub is.

Verified against the live shops:

| barcode | source chosen | name |
|---|---|---|
| 4337182256663 | METRO | METRO Chef Картопляні трикутники 2,5кг |
| 4820000000000 | METRO | aro Крупа перлова ячмінна 1кг |
| 5449000000996 | OFF | Coca-Cola 330 мл |
| 3017620422003 | OFF | Nutella |
| 4823063114912 | — | GEPIR manufacturer hint |

OFF still wins whenever METRO does not stock the code: a Latin name beats an
empty form. The extra call costs at most one request per barcode ever, because
`BarcodeFact` caches METRO's misses as well as its hits.

`packSize` is no longer computed for METRO hits. `parsePackSize` is anchored at
the start of the string for OFF's "1.5 l", and METRO writes the size at the end
(«…2,5кг»), so the call could only ever return null — and nothing in the UI
reads the field, which is why that went unnoticed. The size still reaches the
user inside the name.


### Feature 30 — expired and expiring are two lists, not one

**Reported:** «it's hard to see what I need to use faster and what is already
expired» — in the web app and in Telegram alike.

Both halves were always there, sorted with expired first and each row badged.
But a badge is read one row at a time, and the two halves ask for opposite
actions: bin the first, cook the second. In Telegram there was not even a
badge — the only thing separating them was the tail of each line.

**One rule, three surfaces.** `splitExpiring` in `packages/core/src/expiry.ts` divides the
attention list into `expired` and `soon`; the dashboard card, the daily digest
and the bot's `/expiring` all use it. `needsAttention` still decides what
enters the list at all — one rule each, and no third opinion about which half
a thing belongs in. Order is preserved inside each half, so the dashboard's
urgency sort survives the split.

- **Dashboard:** the «Псується» card grows two headed sections —
  «Прострочено» in destructive red, «Спожити найближчим часом» in warning
  amber, each with its count. A section with nothing in it renders nothing at
  all, so a household with only expired items sees one heading rather than an
  empty section explaining what it does not have.
- **Digest and bot:** two blocks, «❌ Прострочено:» and «⏳ Спожити найближчим
  часом:». The line itself is unchanged, because `formatExpiryLabel` already
  carries its own verb — «прострочено 3 дні тому» / «спливає завтра» — and so
  reads correctly under either heading.

`pnpm test:db` asserts the split in the real digest text: every expired item
under the expired heading and none of them under the other.

#### 30.1 — the bottom buttons answered with the menu

**Reported:** the two buttons above the text field — «Що закінчується» and
«Що псується» — showed the main menu's five buttons instead of a list.

They are a keyboard **Telegram was still showing from an older version of this
bot**. A custom reply keyboard lives in the client until a message replaces it,
and Feature 17.5 cut the row down to a single «Головна» while only ever sending
that replacement to chats linked *after* it. Chats linked before kept the old
row for good.

So the taps arrived as ordinary text that nothing matched, and an unmatched
message with no conversation in progress opens the menu — the bot answering a
question it had not been asked. Nothing was broken on the server; the client
was sending a vocabulary the server had forgotten.

**The fix keeps the buttons.** They are what the household reaches for, and
evicting a keyboard someone is using to replace it with one fewer shortcut is
not a fix. `BUTTONS` in `bot/menu.ts` is now the single list of labels: the
reply keyboard is built from it, `shortcutFor` matches an incoming message
against it, and each label routes to the same view the inline menu opens. A
label is one more way in, never a second implementation — which is what
Feature 17.5 was guarding against.

A tap also **ends any flow in progress**. It is a navigation, and leaving
`pending` set would feed whatever was typed next into a half-finished `/add`
nobody remembers starting.

**The labels are a wire format.** Old clients keep sending the old text
forever, so renaming one silently breaks a button in someone's chat.
`bot/menu.test.ts` pins every label, including the three shipped in `5fd1e8c`,
so a rename fails in CI instead. It is also why `vitest.config.mts` now looks
in `bot/` as well as `packages/core`.

#### 30.2 — the Android back button was trapped in the chat

**Reported:** in the bot's chat the Android back button does nothing, and
neither does the swipe that replaces it. It should leave the chat.

The keyboard was sent with **`is_persistent`**. That flag asks the client to
keep the custom keyboard up and takes away the control that hides it, so on
Android the back press is spent trying to dismiss a keyboard that will not
dismiss — and the chat cannot be left at all. Telegram's own tracker carries
this as expected behaviour of the flag rather than a client bug
([bugs.telegram.org/c/18400](https://bugs.telegram.org/c/18400)).

The flag is gone. The shortcuts collapse like any other keyboard and come back
from the keyboard icon; a row of shortcuts is not worth trapping someone in the
chat.

**Removing the flag does not reach chats that already have that keyboard.** A
custom keyboard lives in the client until a message carries a new one, and the
only message that ever carried one was the reply to the link — the same
mechanism behind 30.1, biting a second time. So a bare `/start` on an
already-linked chat now re-sends the keyboard and opens the menu. `/start` is
what Telegram itself offers for a bot behaving oddly, so it is where someone
will look; it also stops that command telling a linked user they are not
linked.

#### 30.3 — how a keyboard change actually reaches people

**Asked:** what does a real bot do when a keyboard fix is waiting and thousands
of users are never going to type `/start`?

It does not broadcast. A reply keyboard is replaced by *any* message carrying
one, so the fix rides along with the next message that user was going to get
anyway. `/start` stays as the manual escape hatch — it is what someone reaches
for when a bot misbehaves — but it is not how a fix is delivered.

The wrinkle is that **one message carries one `reply_markup`**, and inline and
reply keyboards are mutually exclusive. Nearly everything this bot sends is an
inline menu, so its replies cannot double as the carrier. Hence a version.

**`TelegramLink.keyboardVersion` records what a chat was last SENT** — not what
the code builds, because those are different things and confusing them is what
shipped 30.1 and 30.2 as bugs. `KEYBOARD_VERSION` in `bot/menu.ts` is bumped
whenever the keyboard changes; anything below it is a debt, and two paths pay
it:

- **The next interaction.** `withUser` runs on every update, so any command,
  shortcut or inline tap settles it: one short message carrying the keyboard,
  then the thing the user actually asked for. One extra message per chat per
  version, and never again.
- **The daily digest.** The one message that reaches a linked chat whether or
  not anyone opens the bot. It was plain text with no `reply_markup` to give
  up, so the keyboard attaches for free and costs no extra message at all —
  everyone who reads the noon note is fixed by tomorrow without touching
  anything.

A chat that is already current gets no keyboard: resending is pointless
traffic, and it would reopen a keyboard someone had deliberately collapsed.
The version is written only after Telegram accepts the send, so one bad moment
cannot mark a debt paid that never was. A newly linked chat is created at the
current version, because the link reply already carries the keyboard.

**Why not a broadcast.** Bots are capped at roughly 30 messages/second overall
and about one per second per chat, and going over returns `429` with a
`retry_after` that blocks the bot for the duration
([Bots FAQ](https://core.telegram.org/bots/faq),
[grammY on flood limits](https://grammy.dev/advanced/flood)). At this app's
scale a loop would finish instantly; at a hundred thousand chats it is a
throttled job, and a message every dormant user ignores. Fixing on next contact
needs neither.

`bot/menu.test.ts` pins the two properties that matter: the keyboard never
carries `is_persistent`, and every key on it is a label `shortcutFor` answers —
a key the handler does not recognise is exactly the 30.1 symptom.

### Feature 32 — «Рецепти»: what to cook from what is in the house

A tab with one button. Pressing it asks Claude for a single dish made from the
household's current stock, in Ukrainian.

**The model is Claude Haiku 4.5**, because the cheapest was asked for: $1/$5 per
million tokens, the least expensive available. The task is a short list in and a
short recipe out and does not reward a larger model. `ANTHROPIC_MODEL` overrides
it without a deploy if that judgement proves wrong. Haiku 4.5 predates adaptive
thinking and effort levels, so neither is set — `effort` is rejected on it, and a
thinking budget would buy deliberation this task does not need.

**Nothing is spent on a page view.** The model is consulted only when someone
presses the button; the page itself renders from the database and says how many
items it would consider, so the answer is not a surprise. An almost-empty pantry
is refused before any request is made.

**What the model is told, and why it is short:**

- One line per item — name, quantity, and a note only when it is about to
  spoil. Sorted with the urgent first, and the model is told the list is sorted
  that way. That ordering IS the recommendation: cheaper than restating a
  priority on every line.
- **Expired items are not sent at all.** Suggesting someone cook with food the
  app itself flags as spoiled would be worse than suggesting nothing, and no
  prompt wording is as reliable as not sending it.
- Items at zero are not sent — a recipe is about what is in the house; the
  shopping list is a different screen.
- Capped at 60 lines. The household holds tens of items, so this is a guard
  against a pathological list, not a routine trim.
- `max_tokens` is 900. Output is billed at five times input here, so that
  number matters more than the pantry does.

**Non-food is handled in the prompt, not by filtering.** The list is the whole
inventory — shampoo, paracetamol and cat food sit in it beside the eggs. A
category filter would be sturdier, but categories are named by each household
and cannot be matched reliably, so the model is told to ignore them. If that
ever slips, the sturdy version is a per-category "це їжа" flag in Settings.

**The answer is rendered as the text the model produced**, not parsed into
fields. A recipe is prose with a shape, and every parser for that shape is one
wording change away from showing nothing. The model is asked for a fixed layout
and the layout is preserved.

Nothing is stored. Pressing again asks again and replaces the suggestion —
keeping a history would mean a table, a page, and a decision about whose
suggestions those are, none of which was asked for. The token count of each
answer is shown, so the cost of pressing the button is never a mystery.

**Not verified against the live API.** There is no key on this machine, so the
request was proven against a local stub that records what the SDK sends —
correct model, `max_tokens`, and message shape, and the response parses. What a
real Claude reply looks like, and whether the format instruction holds, is
untested.

#### 32.1 — a switch, a position, and a number that meant nothing

Three things asked for after the first day of use.

**The token line said nothing.** «Токени: 1628 → 218» is two bare numbers with
no unit and no scale, and it invites exactly one question — is that a lot? So
the line now answers it: «Надіслано 639 токенів (ваш список), отримано 229
(рецепт) · приблизно 0,0018 USD». Input and output are priced separately
because they are billed separately — output is five times dearer here, which is
why `max_tokens` is the lever that matters and not the length of the pantry.
Only models with a price on file get a figure; an `ANTHROPIC_MODEL` override
that is not listed shows the counts alone, because a confidently wrong price is
worse than none.

**The tab moved after «Покупки»**, so Settings stays last.

**The helper is off until a household turns it on.** `Household.aiEnabled`,
default false. Every press spends money at an external provider, and a
household that never asked for that should not be shown a tab offering it.

The switch is checked in three places, and the two that matter are not the
visible one:

- The nav omits the tab — presentation.
- `/recipes` redirects to Settings when it is off — because the URL is typeable
  whether or not a link exists.
- **`suggestRecipeAction` refuses** — a hidden link is not an access control,
  and the action is the thing that actually spends the money.

**Existing households get it switched off**, this one included: the column
defaults to false, so the tab disappears until someone turns it back on. That
is the intended reading of "by default disabled" and not an upgrade accident.

### Feature 33 — what the architecture review found, and what was done

A read of the whole codebase against its own rules. Most of it held; four things
did not. Full findings and the fix log: [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md).

**A stock write must not act on a stale read.** This is a rule, not an
optimisation, and it belongs beside §3.3. Every write here is a
read-modify-write — load the batches, plan, store an ABSOLUTE quantity — and
between the read and the write another member of the household can change the
same row. Two phones in one kitchen is the normal case. The second writer used
to overwrite the first with a number computed from stock that no longer existed:
a take vanished, or a batch was resurrected to a quantity nobody had.

So every write states what it believed — `WHERE quantity = <what I planned
from>` — and zero matched rows means someone moved first. That throws, the
transaction rolls back, and the whole load-plan-write runs again, up to three
times. **Re-planning rather than retrying the write is the rule**: FEFO depends
on what is in the fridge *now*, so a second attempt may draw from different
batches, or find there is no longer enough and refuse with the shortfall. This
is the same principle the offline replay (Feature 31) uses for a take applied an
hour late.

Correction is the subtle case. Its target is an absolute claim about reality —
"there are actually 5" — and survives a retry unchanged. Its **signed delta**
does not, and re-planning against the current value is what keeps the movement
log truthful.

Chosen over serializable isolation because it aborts only on real conflicts, and
because the conflict branch is injectable and therefore testable.

**Movement timestamps are Kyiv time**, not the server's. `formatDateTime` had no
`timeZone`, so Vercel's UTC made every «Останні дії» entry read 2–3 hours early
— and an instant at 23:30Z rendered as the *previous day*. Hardcoded next to a
comment naming the `Household.timezone` upgrade path; `bot/digest.ts` already
hardcodes the same zone to decide when noon is, and the two change together.

**Server components read through `apps/web/lib/queries.rsc.ts`.** The authed layout and
the page beneath it each scanned the whole household. Wrapping the exported
readers in `React.cache` fixes nothing on its own — the scan happens *inside*
`getAttentionCounts` and `getDashboard` — so both take their inputs as optional
arguments and the cached module threads them through. Measured on a dashboard
render: six loader calls became two. The bot and the digest keep importing the
uncached `@supplies/db/queries`, because `server-only` would kill them.

**End-to-end tests exist now** (`e2e/`, `pnpm test:e2e`) and are deliberately
small: a form in a real browser, a server action, a database write, and the
number on screen changing to match. Everything provable without a browser stays
in the unit and smoke suites.

---

### Feature 34 — the HTTP API, and token auth for clients that have no cookies

Plan and phases: [SPA_API_PORT.md](SPA_API_PORT.md). This section records only
the **rules**, which are the part that belongs in the spec; the toolchain lives
in [apps/api/CLAUDE.md](apps/api/CLAUDE.md).

`apps/api` is a **third front end, never a third implementation** — the same
rule the Telegram bot has followed since Feature 9. Every read goes through the
same queries and every write through the same engine in `@supplies/core`. An
endpoint that computed a stock state itself would be a second definition of
"low".

**Auth is tokens, not a session cookie.** Auth.js keeps the Next app signed in
with an httpOnly cookie, which a React Native app cannot use and a cross-origin
SPA can only use awkwardly. So the API issues:

- an **access token** — JWT, 15 minutes, sent as `Authorization: Bearer …`,
  carrying `sub` and `householdId` exactly as the Auth.js token does;
- a **refresh token** — 30 days, opaque, stored **hashed** in
  `ApiRefreshToken`, and **rotated on every use**.

Short access token because it cannot be revoked before it expires. Long refresh
token because it can: it is a row, and deleting the row ends the session.

**Rotation with reuse detection.** Refreshing revokes the presented token and
issues a new one. Presenting an already-revoked token means either a bug or a
stolen token being replayed, and the API cannot tell which — so it revokes
**every** token for that user and forces a fresh login. A legitimate user
re-authenticating is a smaller harm than an attacker keeping a session alive.

**Only the hash is stored.** Same rule as `HouseholdInvite.tokenHash` and
`PasswordResetToken.tokenHash` (Features 1, 8): a database dump must not be a
set of live credentials.

**`API_JWT_SECRET` is separate from `AUTH_SECRET`.** `AUTH_SECRET` signs Auth.js
sessions *and* Telegram link tokens; rotating it to end API sessions would sign
everyone out of the web app and invalidate every outstanding bot link. Two
secrets, two blast radii.

**Passwords are the same bcrypt hashes.** One `User` row, one password, whether
you sign in on the web, in the SPA, or on a phone. Registration through the API
creates the same household defaults as Feature 1, because it calls the same
code.

**Household scoping is a guard, not a convention.** Every authed request
carries `householdId` from the verified token, and handlers receive it rather
than reading it themselves — a handler that forgets to scope a query cannot
compile.

---

### Feature 35 — the daily reminder as a phone notification

The digest already reaches the household two ways: a Telegram message, and the
dashboard whenever somebody opens the app. Feature 35 adds a third for the one
case neither covers — a phone in a pocket, with the app closed and Telegram
muted.

**One message a day, and it is the same message.** Not a new channel with its
own content: `digestText` is the single source, flattened for a notification
because a push shows two or three lines in a system font and cannot render the
bot's markdown. A household that gets a notification and then opens Telegram
must not read two different accounts of the same cupboard.

**A device agrees, not a person.** `PushDevice` is keyed by the Expo push
token, because one person may carry two phones and a tablet and each of them is
allowed separately. The token can also move between users: two people signing
into the same phone receive the same address from the OS, so registration
reassigns it — otherwise the first would keep receiving the second one's
reminders.

**Permission is asked once, from a screen somebody chose to open.** iOS and
Android both grant an app one prompt per install; spending it on a cold launch,
before anyone knows what the app is for, is how an app ends up permanently
denied with no way back except the system settings. «Налаштування → Сповіщення»
is the only place that asks.

**There is no in-app switch to turn reminders off**, only the operating
system's. A second toggle creates the state where the app believes it may
notify and the system disagrees, and the honest answer to "stop these" is the
one the platform already provides.

**A dead address is deleted; a busy one is not.** Expo answers per message, and
only `DeviceNotRegistered` — the app is gone from that device — removes the
row. A rate limit or a transport error looks similar and is temporary; deleting
on those would lose a live device over a busy minute.

**Push never fails the digest.** By the time notifications are sent the
Telegram half has already gone out. A push service that is down is a worse day,
not a failed run.

Expo's push service carries the message rather than FCM and APNs directly: one
address format, one endpoint, and the credentials sit on EAS instead of in this
repository. The cost is a dependency on a service Expo runs, which for one
message a day to one household is the right side of the trade.
