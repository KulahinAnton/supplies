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

Sorting is a **pure, tested function** over the already-fetched rows (`lib/item-sort.ts`), not an extra query: the list is small, the filters are already client-side, and re-sorting must not cost a round trip. Every mode breaks ties by name so the order is total and stable — two items added in the same second must not shuffle between renders.

The chosen mode is a **per-person, per-device preference** (localStorage), like the group collapse state: how one person likes to scan the list is not household data.

### Feature 19 — The expiry digest actually runs

Feature 9 described a daily digest and shipped it as a CLI script, which Vercel cannot schedule: its cron calls an HTTP endpoint, not a command. The digest therefore never ran in production.

- The logic moves to `lib/digest.ts`, called by **both** `pnpm digest:run` and a new `GET /api/cron/digest`, so the two cannot drift.
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

Three parts, all driven by one pure matcher (`lib/duplicates.ts`) so they cannot disagree about what "similar" means.

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
- **Resolution is a pure function** (`resolveWarnDays(category, household)`), so the fallback is stated once. Every place that computes an expiry state resolves it **per item, via that item's category** — the item list, the dashboard, the item detail page, the Telegram bot and the daily digest all go through `lib/queries.ts`, so they cannot disagree.
- **Range 0–365**, same as the household setting. 0 is meaningful: it means "only warn me on the day itself".
- The dashboard header shows the **household default**, with a note when any category overrides it — claiming a single number applies to everything would be a lie once overrides exist.
- Settings lists each category with its own days field, blank meaning inherit. Clearing the field returns the category to inheriting, rather than setting 0.

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

`lib/format.ts` exposes `formatExpiryLabel(date, today)`, which returns a
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
pure and tested against **real captured HTML** in `lib/__fixtures__/`, because
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
`BARCODE_PATTERN` in `lib/validation/shared.ts`, used by the item schema and
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

**`consumeBatch` lives in `lib/stock-service.ts`**, not in the action, like
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

**Written with `history.replaceState`, not `router.replace`.** The latter is a
navigation: every keystroke in the search box would refetch the page and
re-query the database. Only the address bar needs to change, so that the
history entry this page occupies still describes it when the user returns.

**Defaults are never written**, so an untouched list stays at plain `/items`
rather than carrying four parameters that all say "nothing is set".
`lib/item-list-params.ts` holds that rule and the parsers, tested — a
hand-edited value falls back instead of producing an empty list.

**localStorage and the URL do not conflict.** localStorage is "how I like lists
ordered"; the URL is "how this list was ordered when I left it". The URL wins
when it says something, so Back restores the view; opening `/items` fresh with
no `sort` still honours the remembered preference.

Also removed a latent discrepancy: the filter type was `"all" | "attention" |
StockState`, which admitted `"OK"` — a filter the chips never offer and the
list would have shown nothing for. There is now one definition, in lib, shared
with the URL parser.
