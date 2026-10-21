# Supplies — specification

The household stock and expiry tracker: what it does, and the rules every client
must keep. This is the **source of truth for behaviour**. The code's shape is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), what is left to build is in
[docs/ROADMAP.md](docs/ROADMAP.md), and conventions for working in each
directory are in the nearest `CLAUDE.md`.

> **About this file.** Rewritten on 2026-10-21 from the original spec, which
> had accumulated a long implementation narrative and had drifted from the code
> in places. Section and feature numbers are **unchanged**, because hundreds of
> code comments cite them (`§3.3`, `Feature 26.4`). Each feature keeps its
> rules and one line of *why*. The full story of how each rule was found,
> including the bugs that produced it, is under the same heading in
> [docs/archive/PROJECT_PROMPT.md](docs/archive/PROJECT_PROMPT.md), where one
> exists.

---

## 1. Goal

Replace the family's "open the cupboard, guess what is missing, buy a third
bottle of shampoo, throw away expired yoghurt" ritual.

The household records **what it has, how much, and when it expires**. The app:

- keeps a live **stock level per item**, summed from dated batches;
- flags what is **running low** and what is **expiring soon or already
  expired**;
- turns low stock into a **shared shopping list**, where ticking an item off
  puts it back into stock;
- lets every member act from wherever they are: the web app, a phone app, a
  **Telegram bot** (fastest while standing in a shop), and **barcode
  scanning**.

It is a **single-household, multi-user** app: one family shares one
inventory, every member is equal (no roles), and everyone sees and edits the
same data. The UI should feel like a polished modern product, not a generic
CRUD panel, and it is **mobile-first** because it is used standing in a shop.

## 2. Stack

Fixed. Do not substitute without asking.

| Layer | Choice |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript strict, server actions for mutations |
| API | NestJS 11 on Fastify, zod validation, OpenAPI at `/docs` (Feature 34) |
| SPA | Vite, React Router 7, TanStack Query 5 |
| Phone | Expo SDK 57, Expo Router, NativeWind 4, TanStack Query. Android first; iOS parked |
| Bot | grammy. Webhook in production, long polling in development |
| Styling (web) | Tailwind CSS v4 + shadcn/ui on **Base UI** (not Radix: the `render` prop, never `asChild`), base-nova preset, dark mode |
| Database | PostgreSQL. Neon in production, Docker locally on host port **5434** |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter, one CommonJS client in `packages/db` |
| Auth | Auth.js v5 (Credentials, JWT, 8 h) for the web app. JWT access + rotating refresh tokens for the API |
| Forms | react-hook-form + zod v4. The schemas live in `@supplies/core/validation` and are shared by every client and the API |
| Quantities | `decimal.js`. Never float arithmetic |
| Barcode | `BarcodeDetector` with a `@zxing/browser` fallback on the web, `expo-camera` on the phone. Lookup: Open Food Facts → METRO Ukraine → GS1 Ukraine |
| Email | Resend through a thin `sendEmail()` in `packages/db/src/email.ts` |
| Push | Expo's push service (Feature 35) |
| AI | Claude via `@anthropic-ai/sdk`, Feature 32 only, off by default |
| Language | **Ukrainian only. No i18n layer** (§8) |
| Tests | vitest for the rules (colocated, no database), a live-database smoke test, supertest e2e for the API, Playwright for both web clients |
| Package manager | pnpm workspace |

**Every business rule lives once, in `packages/core`, and every write lives
once, in `packages/db`.** Five front ends call them: the Next app, the API
(and through it the SPA and the phone), the Telegram bot and the daily
digest. A front end that computes a rule itself is a second implementation
of it, which is the one thing this architecture exists to prevent.

## 3. Domain: household stock

### 3.1 Items, batches, and why stock is not a single number

An **Item** is a *kind* of thing ("Молоко 2,5%", "Ібупрофен 200 мг"). A
**StockBatch** is a concrete lot of it with **its own quantity, its own expiry
date and, optionally, its own storage location**, because two cartons bought a
week apart go off on different days and may sit in different fridges.

Item quantity is **never stored**. Current stock is the sum of `quantity` over
the item's non-empty batches, computed when it is read, so it cannot drift away
from the batches.

**A product is batched as many times as it has distinct expiry dates.** Ten
bottles of water where 2 expire in three months, 1 in six and 7 in a year is
**one item with three batches** (2 / 1 / 7), entered in **one submit**
(Feature 4).

### 3.2 Units

`PIECE | PACK | GRAM | KILOGRAM | MILLILITRE | LITRE`, declared in
`@supplies/core/units`. **No conversion between units.** An item is counted in
one unit for its whole life, and all its batches share it. Changing an item's
unit after batches exist is refused with a rule error.

Quantities are `Decimal(12,3)` (three decimals covers 0,5 л and 0,25 кг).

### 3.3 Consumption is FEFO (first expired, first out)

Consuming N units of an item draws batches down in this order:

1. batches **with** an expiry date, soonest first;
2. then batches **without** one, oldest `createdAt` first.

**Expired batches are skipped, never consumed automatically.** That way "we
drank the milk" can never be recorded *silently* against a carton that had
gone off. Expired stock leaves through an explicit discard (`WASTE`) or a
deliberate take from that one batch (Feature 24).

If the request exceeds the available (non-expired) stock, **the whole consume
is refused** with a rule error naming the shortfall. Partial consumption is
never guessed. When stock exists but all of it is expired, the refusal says so
(`stock.allExpired`) rather than reporting a shortfall of zero.

A batch that reaches 0 is kept as a row, because it is the history behind its
movements, and is excluded from every sum.

### 3.4 Stock state

Each item has `minQty` (default 0). Given current stock `q` (total, including
expired, so that the two axes stay independent):

| State | Condition |
|---|---|
| `OUT` | `q == 0` |
| `LOW` | `minQty > 0` and `0 < q <= minQty` |
| `OK` | otherwise |

`OUT` and `LOW` items are **reminder candidates**: shopping suggestions, the
dashboard's «Закінчується» card, the nav badge and the daily digest. Two
exceptions:

- **`minQty = 0` opts the item out of every reminder**, including when it is
  `OUT` (Feature 25). The state still reads `OUT` and the badge still shows
  it, because the state is a fact about the shelf and the reminder is a policy.
- **A grouped item is never a candidate on its own.** Its set is (Feature 26).

### 3.5 Expiry state

`warnDays` comes from the item's category if it sets one, otherwise from the
household's `expiryWarnDays` (default **7**; Feature 13). For a batch with
`expiresAt`, and today:

| State | Condition |
|---|---|
| `EXPIRED` | `expiresAt < today` |
| `SOON` | `today <= expiresAt <= today + warnDays` |
| `FRESH` | `expiresAt > today + warnDays` |
| `NONE` | `expiresAt` is null |

"Expires today" is therefore `SOON`, not `EXPIRED`. An item's expiry state is
the **worst** among its non-empty batches. Dates are date-only (`@db.Date`)
and are compared with UTC getters through `@supplies/core/period`, with no
timezone arithmetic anywhere.

**Stock state and expiry state are shown separately, as two chips, and are
never merged.** An item can be well stocked and half-expired, and collapsing
the two would hide whichever half is worse.

### 3.6 Worked example (the engine's acceptance test)

Item "Milk", unit `LITRE`, `minQty = 2`. Today is 2026-03-10, `warnDays = 7`.
Batches:

- A: 1.000 L, expires 2026-03-08
- B: 2.000 L, expires 2026-03-14
- C: 1.500 L, no expiry

Expected:

- Total stock **4.500 L**; **available** (non-expired) **3.500 L**.
- Stock state `OK` (4.5 > 2). Expiry state `EXPIRED` (batch A is the worst).
- Batch states: A `EXPIRED`, B `SOON`, C `NONE`.
- `consume(3.0)` draws **2.000 from B**, then **1.000 from C**; A is
  untouched. The result is 1.500 L, state `LOW`, so the item becomes a
  shopping candidate.
- `consume(4.0)` is **refused** with a shortfall of 0.500. Only 3.500 is
  available, because the expired litre does not count.

`packages/core/src/stock.test.ts` reproduces this verbatim.

### 3.7 A stock write never acts on a stale read

Every stock write is read, plan, then write an **absolute** quantity, and
another member can change the same row in between: two phones in one kitchen is
the normal case. So every batch update states what it believed
(`WHERE quantity = <planned from>`). If zero rows match, someone moved first:
the transaction rolls back and the **whole load-plan-write runs again**, up to
three times. **Re-plan, never just retry the write.** FEFO depends on what is
in the fridge *now*, so a second attempt may draw from different batches or
correctly refuse. A correction keeps its absolute target across a retry and
recomputes its signed delta. (Feature 33.)

## 4. Data model

The authoritative version is `prisma/schema.prisma`, and its conventions are in
[prisma/CLAUDE.md](prisma/CLAUDE.md). The shape:

| Model | Key fields | Notes |
|---|---|---|
| **Household** | `name`, `expiryWarnDays` (7), `digestHour` (8), `aiEnabled` (false), `lastDigestOn` (date) | Settings are data, not constants |
| **User** | `email` (unique), `passwordHash` (bcrypt), `name`, `isActive`, `householdId` | One household per user; all members equal. Deactivated, never deleted |
| **HouseholdInvite** | `tokenHash` (SHA-256), `email?`, `expiresAt` (7 days), `usedAt?`, `createdById` | Single-use join link |
| **PasswordResetToken** | `tokenHash`, `expiresAt` (1 h), `usedAt?` | Single-use |
| **ApiRefreshToken** | `tokenHash`, `expiresAt` (30 days), `revokedAt?`, `revokedReason?` (`rotated` / `reuse` / `logout`), `userAgent?` | Feature 34 |
| **PushDevice** | `token` (unique Expo push token), `platform`, `lastSeenAt` | Feature 35. Keyed by device, not by user |
| **TelegramLink** | `userId` (unique), `chatId` (unique), `pending?`, `keyboardVersion` | Features 9, 17.4, 30.3 |
| **Category** | `name`, `icon`, `sortOrder`, `expiryWarnDays?` (null = inherit), `isDefault` | Unique per household |
| **StorageLocation** | `name`, `sortOrder`, `isDefault` | Unique per household |
| **Item** | `name`, `categoryId`, `locationId?`, `groupId?`, `unit`, `minQty`, `barcode?`, `notes?`, `isArchived` | Barcode unique per household (nulls allowed). Archived, never deleted |
| **ItemGroup** | `name`, `sortOrder`, `minQty` | Feature 26. The unit is derived from the members, not stored |
| **StockBatch** | `itemId`, `quantity`, `expiresAt?`, `openedAt?`, `locationId?` (null = the item's), `addedById` | |
| **StockMovement** | `itemId`, `batchId?`, `delta` (signed), `reason` (`PURCHASE` / `CONSUME` / `WASTE` / `CORRECTION`), `userId`, `occurredAt`, `note?` | **Append-only.** Answers "who used the last of it" |
| **ShoppingGroup** | `name`, `sortOrder` | Feature 11. «Загальна група» is `groupId = null`, not a row |
| **ShoppingListItem** | `groupId?`, `itemId?` **xor** `freeText?`, `note?`, `quantity?`, `isChecked`, `checkedById?`, `archivedAt?` | |
| **BarcodeFact** | `(barcode, source)`, `value?` | Cache for GEPIR and METRO answers, misses included. Global, not per household |

Every household-owned row carries `householdId` directly, or reaches it through
its item. **A query that does not constrain the household is a bug.** Deleting
a household cascades all the way down; the app itself never deletes a
household, a user or an item.

Everything derived (item quantity, stock state, expiry state, shopping
candidates, a set's total) is **computed when read, never stored**.

## 5. Documentation rules

**Documentation comes before implementation.** A new feature or a rule change
is written here first, as a new numbered section or an edit to an existing one,
then reflected in the relevant `CLAUDE.md`, and only then implemented.

- **This file** holds rules and the one-line reason for each. When a feature
  lands, record any deviation from what was written as a short **Notes**
  bullet under that feature, not a narrative.
- **`CLAUDE.md` files** hold conventions and traps for the directory they sit
  in: facts, not narration of what the code does. Update the relevant one in
  the same change as the convention it documents. Do not create one for a
  folder with nothing non-obvious in it. Link rather than duplicate.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** holds structural
  decisions; **[docs/ROADMAP.md](docs/ROADMAP.md)** holds what is not built
  yet. When a roadmap item lands, it moves into this file as a feature.
- **[docs/archive/](docs/archive/README.md)** is read-only history.

## 6. Features

Numbered in the order they were specified; sub-numbers are revisions. Where a
feature has a longer narrative, it is under the same heading in
[docs/archive/PROJECT_PROMPT.md](docs/archive/PROJECT_PROMPT.md).

### Feature 0 — Project scaffolding

pnpm workspace; TypeScript strict; ESLint (type-aware); vitest; Docker
Compose for Postgres on **5434**; Prisma 7 with its config in
`prisma.config.ts` (not the schema, not `package.json`).

**The seed** builds one demo household with deliberately uneven data: one
`OUT`, two `LOW`, one item with an `EXPIRED` batch, one `SOON`, one with no
expiry at all, and the §3.1 water example. It is idempotent: it deletes and
rebuilds the household «Наша родина», and dates are relative to the run day.
Demo login `anton@example.com` / `supplies123`.

### Feature 1 — Auth and household

- **Registering creates a new household** and makes the user its first
  member, seeded with the default categories and storage locations.
- **Joining** an existing household goes through a single-use invite link
  (`/join/[token]`, 7 days), optionally emailed. Only the token's SHA-256 is
  stored.
- **Password reset** by email: a hashed, single-use, one-hour token. **The
  request always answers "ok"**, so the form cannot be used to test whether an
  address has an account. All three ways a token can be bad (never issued,
  used, expired) give the same message.
- **A new password ends the old API sessions** (Feature 34). A reset revokes
  every refresh token the user holds, because a reset is what someone does
  when they think the account is compromised, and the attacker's phone must
  not survive it. A change revokes every token **except the session that
  made the change**, so the device in your hand stays signed in. A change made
  on the web app has no API session to spare, so it ends all of them. Web
  sessions (Auth.js JWTs, 8 h) are not revocable and are unaffected; see
  docs/ROADMAP.md §8.
- Registration, invites and reset live in `@supplies/db/account-service`,
  shared by the Next app and the API. Two implementations had already
  drifted: one consumed invites atomically and the other did not.
- **Web:** JWT sessions (8 h) carrying `id` and `householdId`.
  `requireSession()` re-reads the user and their `isActive` flag on every
  call, so a stale or deactivated JWT is sent to `/login`. Public pages bounce
  a signed-in visitor via `validSessionOrNull()`, never the raw JWT.
- **Route protection is layout-based** (`app/(app)/layout.tsx`).
  **Every server action guards itself** with `requireSession()` and scopes by
  the session's `householdId`, because layouts protect pages, not actions.

### Feature 2 — The stock engine

Pure functions in `packages/core`, written and tested before any UI used them:
`stock.ts` (`itemQuantity`, `availableQuantity`, `stockState`, `stateFor`,
`needsRestock`, `fefoOrder`, `planConsume`, `planConsumeBatch`, `planCorrection`,
`planDiscard`),
`expiry.ts` (batch and item states, urgency, `splitExpiring`),
`shopping.ts` (candidates) and `period.ts` (date-only helpers).

A plan is **returned, not applied**: the engine says which batches to draw
and by how much, and `stock-service` applies it in a transaction. That
separation is what makes §3.7's re-planning possible and FEFO testable without
a database.

### Feature 3 — Items, categories, locations

- `/items`: a searchable, filterable, sortable, paginated list showing the
  stock chip and the worst expiry chip (Features 12.2, 23, 27, 28).
- Create, edit and **archive** items. Never hard-delete: movements reference
  them. Archived items disappear from the list, the dashboard, suggestions and
  the badges, and are listed and restored at `/items/archive`. Archiving an
  item that still holds stock warns first.
- Changing an item's unit is refused once it has batches (§3.2).
- `/settings`: household name, `expiryWarnDays`, digest hour, the AI switch,
  categories, locations, sets, possible duplicates, members, invites, the
  Telegram link, password, theme.
- A category or location cannot be deleted while items reference it.

### Feature 4 — Stock in and out

Every operation here goes through `@supplies/db/stock-service` and writes its
`StockMovement` in the **same transaction** as the batch change.

- **Add stock** is a **repeatable row list**: quantity, optional expiry,
  optional opened date (hidden behind a toggle; never in the future), and
  optional location (Feature 22). One submit creates every batch and one
  `PURCHASE` movement per batch, **all or nothing**. Rows with the same date
  *and location* merge into one batch. At least one row is required, and
  every quantity must be positive.
- **Consume («Взяли»)**: FEFO via `planConsume` (§3.3), `CONSUME` movements,
  refused whole on a shortfall.
- **Discard**: `WASTE` against a chosen batch.
- **Correction**: set a batch's absolute quantity, which writes the signed
  `CORRECTION` delta.
- **Take from one batch**: Feature 24.
- The item page lists batches in the order they will be drawn, with expired
  batches last, and shows the movement history with who did what.

### Feature 5 — Dashboard

`/dashboard` is the morning glance: what is **expired**, what to **use soon**
(two sections, Feature 30), what is **running low**, and **recent activity**.
Every row links to where it can be fixed. The attention counts ride in the
navigation badges, so they are visible from every page.

### Feature 6 — Shopping list

- `/shopping` is one shared list, split into groups (Feature 11).
- **Suggestions** come from §3.4 ("Молоко закінчується — додати?") and are
  **never inserted silently**. The family decides.
- Rows are a known item or a free-text one-off ("свічки для торта").
- **Ticking an item row is a stock-in.** It asks for quantity and expiry
  (the batches land on the item's own location) and creates them (Feature 4), then marks the row checked
  with who checked it. Free-text rows just tick.
- Ticked rows stay where they are, struck through; clearing them is archiving
  (Feature 14.2).

### Feature 7 — Installable app (PWA)

`app/manifest.ts` and icons, standalone display, `"lang": "uk"`. The SPA ships
the same manifest by hand (`apps/spa/public/manifest.webmanifest`), so
installing either web client gives the same icon and the same start URL. The
phone app's icons are rendered from the same SVG (`apps/web/app/icon.svg`).
No service worker on `main`; see Feature 31.

### Feature 8 — Ukrainian copy and formatting

See §8. It applies from Feature 1 onwards; this feature is where it was
verified.

### Feature 9 — Telegram bot

- **Linking:** `/start <token>`, where the token is a signed
  `userId.expiry.signature` (`@supplies/core/telegram-link`, HMAC over
  `AUTH_SECRET`, 15 minutes), minted in Settings. It is stateless, so there is
  no table and no cleanup, and an expired token cannot be replayed. Rotating
  `AUTH_SECRET` invalidates outstanding tokens, as intended. An unlinked chat
  can do nothing but link.
- **Commands:** `/low`, `/expiring`, `/list`, `/add` (guided: item →
  quantity → expiry, then "another date?"), `/took` (guided, FEFO), `/menu`,
  `/cancel`. The originally specified `/bought` became the in-chat shopping
  list of Feature 17.3.
- **Every bot action calls the same services as the web UI.** The bot is a
  second front end, never a second implementation.
- **The daily digest** lists what is expired, what to use soon and what is
  out (Feature 30), once per household per day (`lastDigestOn` makes re-runs
  harmless). Scheduling: Feature 19.
- Webhook in production (`app/api/telegram/route.ts`), long polling in
  development. Every update must carry `TELEGRAM_WEBHOOK_SECRET` in Telegram's
  secret-token header. **With the secret unset, the route refuses everything
  (503)** rather than accepting unsigned updates: the URL alone is not a
  credential, and a forged update carrying a member's chat id would act as
  them. Same posture as the cron route's `CRON_SECRET`.
  `pnpm bot:dev` refuses to start while a webhook is registered.

### Feature 10 — Barcode scanning

- A scan button on the item form, the add-stock form, the items search
  (Feature 21) and the set membership page (Feature 26.2). The camera decodes
  with `BarcodeDetector` where available and `@zxing/browser` otherwise (lazy:
  it is 408 KB); the phone uses `expo-camera`. Typing a code and leaving the
  field triggers the same lookup.
- **The household already has the code** → say so and link to the item,
  before any network call.
- **Otherwise** look it up (Features 18, 20, 29) and pre-fill the name **only
  if the name field is still empty**. Pack size is appended to the *name*
  ("Coca-Cola 330 мл"), never to `minQty`, because the app counts bottles,
  not the litres inside them.
- **A miss is not an error.** Lookup failure never blocks; the form just
  opens empty. A failure must never be *reported as* a miss either (Feature
  21 fix).
- On the add-stock form a scan is a **check, not an input**: it warns when
  the code differs from the item's stored one, and never blocks.
- **No images are stored.** Decoding happens on the device; only the digits
  reach the server.
- **Not built:** decoding a photo of a barcode sent to the bot.

### Feature 11 — Shopping list groups

- **`ShoppingGroup`**, household-scoped, named freely: a shop, «На дачу»,
  «Терміново».
- **«Загальна група» is `groupId = null`**, not a row. It cannot be renamed,
  deleted or missing, and it needs no backfill.
- **Nothing is sorted into a group automatically.** New rows land in the
  group they were added to (Feature 14.1) or in «Загальна група».
- **Moving a row is drag and drop**, which must work under a finger, plus a
  "move to group" menu, because drag is poor for accessibility and on small
  screens. On the phone a long press opens a sheet instead.
- **Collapsed groups are a per-person, per-device preference**
  (localStorage), not household data.
- **Deleting a group never deletes its rows.** They fall back to «Загальна
  група», so no confirmation is needed.
- Within a group: unticked rows first, then ticked, each by `addedAt`.
  Reordering rows within a group is out of scope.

### Feature 12 — Editing a shopping row, and sorting the stock list

**12.1 Editing a row.** A free-text row owns its text and can edit it. An item
row's label *is* the item's name and is read-only here, because renaming it
would rename the item everywhere. Every row has a **`note`** («2 пляшки»,
«тільки Roshen») that travels with it between groups and goes when the row is
deleted.

**12.2 Sorting.** «За назвою» (`uk-UA` collation, the default), «Нещодавно
додані», «Давно додані», plus the expiry modes of Feature 23. Sorting is a
pure tested function (`item-sort.ts`), and every mode breaks ties by name so
the order is total and stable. The chosen mode is remembered per person and
device; the URL wins when it says something (Feature 27).

### Feature 13 — Per-category expiry warning

- **`Category.expiryWarnDays` is nullable, and null means inherit** the
  household value. It is not a copy, because a copied number would stop
  following the household default when that changes.
- Resolution is one pure function (`resolveWarnDays`) applied **per item via
  its category**, everywhere a state is computed: list, dashboard, item page,
  bot, digest.
- Range 0–365. 0 means "warn on the day itself". Clearing the field returns to
  inheriting; it does not set 0.
- The dashboard caption shows the household default and notes when any
  category overrides it.

### Feature 14 — Adding into a group, and archiving bought rows

**14.1** Every group has its own add field. The top-level field still adds to
«Загальна група», which is the fastest path when you do not know the shop yet.

**14.2 Ticked rows stay put, struck through.** A list that reorders itself
while you shop loses your place. Clearing is a separate act:

- **Archiving** hides a row (`archivedAt`). Nothing is lost.
- Each group can **show its archived rows**. The toggle is per person and
  device, and it only appears when there is something to show.
- An archived row can be unarchived (still ticked) or deleted outright.
- The bulk action archives every ticked row; it does not delete them.

### Feature 15 — Ordering categories and locations, and a default for each

**15.1 Drag to reorder**, on the web. On the phone, up and down arrows instead.
The order drives the selects on the item form. Reordering **rewrites the whole
list** (`sortOrder = index` for every id, in one transaction), because patching
around one moved id invites gaps and ties.

**15.2 A starred default** (`isDefault`), pre-selected when adding an item.
**At most one per list**, enforced in a transaction. Starring the starred row
clears it, which is a legitimate state. The same panel serves categories and
locations, and sets reuse it.

### Feature 16 — Catching duplicate items

One pure matcher (`duplicates.ts`). Names are normalised (lower-cased with
`uk-UA`, trimmed, punctuation dropped, whitespace collapsed), then compared:

| Reason | Example |
|---|---|
| `exact` | "сіль" / "Сіль" |
| `contains` | "Сіль" / "Сіль кухонна" |
| `tokens` | "Сіль кухонна" / "Кухонна сіль" |

**No edit distance.** "Сік" and "Сіль" are two edits apart and are not the
same thing. **Matching never blocks**; it warns, suggests or lists.

- **16.1** The item form warns while you type, client-side, against names
  sent with the page. The item being edited is excluded.
- **16.2** The items search offers **«Створити „X"»**, carrying the query to
  `/items/new?name=…`.
- **16.3** Settings lists clusters of similar items («Схожі товари») when there
  are any. Merging is out of scope.

### Feature 17 — The bot as a real interface

- **17.1** Settings links Telegram with a button that opens the bot directly;
  copying the link stays as the secondary option.
- **17.2** Superseded by 17.5 and 30.1.
- **17.3 The shopping list in the chat**, with the same capabilities as the
  web: groups with their outstanding counts, rows that toggle bought with one
  tap (edited in place), adding into *that* group, and moving between
  groups.
- **17.4 Conversation state is in the database** (`TelegramLink.pending`),
  because each webhook call may land on a fresh serverless instance. Inline
  buttons carry their state in callback data (64 bytes max) wherever possible.
- **17.5 A home screen.** Every action is a button on one screen. Leaf
  screens offer «Головна»; a group offers both «Групи» and «Головна». Screens
  are edited in place, not appended.

### Feature 18 — Widening barcode coverage

- **18.1** A chain of Open Food Facts databases (food, beauty, products, pet
  food); the first hit wins.
- **18.2 Contribute back.** When a scan found nothing and the user names the
  product, the form offers to submit it to Open Food Facts. **Opt-in and
  unchecked by default**, because sending household data to a third party is
  publishing. Needs `OFF_USER` / `OFF_PASSWORD`; without them the offer never
  appears.

### Feature 19 — The digest actually runs

- The digest logic lives in `bot/digest.ts`, called by both `pnpm digest:run`
  and `GET /api/cron/digest`, so the two cannot drift.
- The route requires **`CRON_SECRET`** (`Authorization: Bearer …`), and
  answers 503 when it is unset.
- **Production timing:** Vercel Hobby allows only daily cron jobs, so
  `vercel.json` fires at 09:00 and 10:00 UTC and the route sends only on
  whichever firing is **12:00 in Kyiv** (`DIGEST_HOUR_KYIV`), which keeps
  delivery steady across DST. **`Household.digestHour` is not honoured
  there**; Settings says so. `pnpm digest:run` respects it when run hourly,
  as an hour **in Kyiv**, the same clock the cron route uses (`kyivHour()`).
  Making the hour real in production is on [docs/ROADMAP.md](docs/ROADMAP.md).

**19.1 «Надіслати зведення зараз».** A Settings button sends the same digest
on demand (`bot/digest-now.ts`, also exposed by the API). It **does not mark
the day**, so the scheduled one still arrives.

### Feature 20 — GS1 Ukraine (GEPIR) as a barcode fallback

- **It yields a manufacturer, never a product name.** The form shows it as a
  separate sentence («За даними GS1 Україна, виробник — …»), never in the name
  field.
- **Only `482` codes are asked**, because foreign codes hang the global router.
  6-second timeout.
- **It is scraping** (a Symfony form, cookie and CSRF token). Every failure is
  "no hint", never an error, and the parser is tested against real captured
  HTML.
- Answers are cached in `BarcodeFact`, **misses included**. `unavailable` is
  never cached.

### Feature 21 — Scanning from the items search

- **A hit opens the item**, archived items included, because their code
  still occupies the unique index.
- **A miss shows a hint** naming the code, with «Створити», which carries
  `?barcode=…` to the form. The form then starts the full lookup by itself.
- It uses a separate, single-query lookup (`findItemByBarcode`), not the
  network chain.
- **The code is never written into the search box**, which filters by name.
  Typing a name clears the scan.
- **Fix:** there is one `BARCODE_PATTERN` (`validation/shared.ts`). A copy that
  had lost its backslash rejected every scan from one screen. And a lookup that
  *fails* is shown as a failure, never as "not in your stock".

### Feature 22 — Per-batch storage location; barcode and notes visible

- **`StockBatch.locationId` is nullable and means "wherever the item
  says"** when null. The item's location is the default and pre-fills new rows.
- **The merge key includes the location**, so two rows for the same date on
  different shelves stay two batches.
- A submitted location id must belong to the household.
- The item page shows a batch's location **only when it differs** from the
  item's own.
- The item page shows the **barcode** and **notes**, which were previously
  write-only.

### Feature 22.1 — `db:prod-copy` points the app at the copy

It writes `.env.local` itself when that file is absent, says so when it
already points at the copy, and refuses to overwrite a file pointing anywhere
else (`--no-env` skips this). It tells you to restart the dev server and to
sign in with the production password.

### Feature 23 — Sorting the stock list by expiry

«Спочатку прострочені» (earliest expiry first) and «Спочатку з довгим
терміном» (latest first). **Undated items sink to the bottom in both
directions**, and so do unparseable dates: unknown is neither urgent nor safe.
Stored sort keys never change when labels are renamed.

### Feature 24 — Taking from a specific batch, expired included

Two verbs:

- **Item-level «Взяти»**: FEFO, refuses expired stock (§3.3).
- **Per-batch «Взяти»**: takes from exactly that batch, without consulting
  expiry, because the person chose it.

Both write `CONSUME`. **It is deliberately not a discard**, because used and
binned are different facts and the movement log is the only place that
difference survives. `consumeBatch` lives in `stock-service` like every other
write.

### Feature 25 — `minQty` 0 means no reminders at all

`needsRestock(item, state)` takes the item, because the threshold is the
opt-out and the state alone cannot express it (§3.4). **Consequence:** since
`minQty` defaults to 0, restock reminders are opt-*in* per item. Changing the
new-item default would flip that without weakening the opt-out (see the
roadmap).

### Feature 26 — Sets of interchangeable items («Набори»)

- **`ItemGroup` owns `minQty`; a member's own minimum is ignored** while it
  is grouped. The item form replaces the field with a line saying where the
  threshold lives.
- **One reminder per set**, everywhere a reminder appears (dashboard,
  suggestions, digest, bot, badge). `getRestockEntries` builds that list once.
- **The unit is derived, never stored.** Every member must share one unit, and
  `canJoinGroup` refuses a mismatch.
- `stateFor(quantity, minQty)` is shared by items and sets, so both ask the
  same question.
- A set's suggestion goes on the list **as free text**, because the shopper
  picks the brand. Writing down any member settles the need.
- **An empty set never reminds.** **Deleting a set with members is refused**
  rather than cascading.
- **Not built:** several barcodes per item, which is the better answer to the
  same product under a new barcode.

**26.1** The items list shows a badge naming the set, so an item absent from
reminders does not look like a bug.

**26.2** `/groups` lists sets with member count and threshold; `/groups/[id]`
shows the combined total, its state and the members. Members are added **by
search or scan, from items the household already has**. The page never creates
items. Items in another set are offered with that set named. Items with an
incompatible unit are shown and disabled, with the reason. Creating and deleting
sets stays in Settings. The items page shows a «Набори» button once a set
exists.

**26.3** Adding a member keeps the search term, because filling a set is a
repeated action.

**26.4** Wherever sets are listed, the member count shows with the combined
stock («товарів: 2 · разом 38 л»), computed by the same `buildGroupView` the
set page uses. There are two queries: the cheap `getItemGroups` for pickers,
and `getItemGroupViews` (which loads batches) where a total is shown.
**Archived members never count.**

### Feature 27 — The items list keeps its state

- The view state is in the URL: `/items?q=…&filter=…&cat=…&sort=…&per=…&page=…`,
  read on the server and used to seed the client. Back restores it because the
  browser remembers URLs.
- Written with **`router.replace`, debounced 350 ms**. Not
  `history.replaceState`, which Next's router never hears about.
- **Do not wrap the list in `Suspense` around `useSearchParams`.** The subtree
  never hydrated. Seed from the page's `searchParams` instead.
- **Defaults are never written**, so an untouched list is plain `/items`.
  Parsers live in `item-list-params.ts` and fall back on a hand-edited value.
- The URL is "how this list was when I left it"; localStorage is "how I like
  lists". The URL wins when it says something.
- The phone keeps this state locally, because it has no address bar.

**27.1** Item links carry the list's query as `from`, and the item page's back
link rebuilds the list from it. `from` is **re-parsed and re-serialised**,
never pasted through.

### Feature 28 — Pagination, chosen on the server

- Pages of 10, 25, 50, 100 or all; **the server sends only the page.**
- **Filtering and sorting run on the server with it** (`item-filter.ts`).
  Filtering one page in the browser filters the wrong set.
- **The server still loads every item.** States are derived from batches, so
  page 1 cannot be known without all of them, and expressing §3.4/§3.5 in SQL
  would be a second implementation of the rules. What pagination saves is the
  wire and the DOM.
- Every control navigates explicitly: a filter change goes to page 1, a pager
  click does not. A page past the end clamps to the last page. The page-size
  control shows whenever the list does. Category chips come from the whole
  household.

### Feature 29 — METRO Ukraine as a barcode source

- Two unauthenticated calls: search (EAN → internal id), then detail (id →
  description). **Exact on EAN**, which was established by experiment because
  no response contains the EAN.
- **Order: Open Food Facts → METRO → GEPIR.** METRO names the product, so a
  hit makes the manufacturer hint redundant.
- Cached in `BarcodeFact` with misses. `METRO_BASE_URL` and `METRO_STORE_ID`
  override it. It is an undocumented commercial endpoint, so every failure
  returns no suggestion.

**29.1 METRO also answers when Open Food Facts replies in English.**
`needsLocalName` judges OFF's *name* alone: Cyrillic means keep it; a name led
by its own brand ("Nutella") means keep it; otherwise it is untranslated prose,
so ask METRO and prefer its name. OFF still wins when METRO has nothing.

### Feature 30 — Expired and expiring are two lists

`splitExpiring` divides the attention list into `expired` and `soon`. The
dashboard card, the digest and the bot's `/expiring` all use it.
`needsAttention` still decides what enters the list. Order is kept within each
half. A section with nothing in it renders nothing.

**30.1 The reply keyboard is a wire format.** Telegram keeps a custom keyboard
in the client until a message replaces it, so old chats keep sending old
labels. `BUTTONS` in `bot/menu.ts` is the single list: the keyboard is built
from it and `shortcutFor` matches against it. **Never rename a label.**
`bot/menu.test.ts` pins every label, past ones included. A tap ends any flow in
progress.

**30.2 Never send the keyboard with `is_persistent`.** It traps the Android
back button in the chat. A bare `/start` on a linked chat re-sends the
keyboard.

**30.3 Delivering a keyboard change.** `TelegramLink.keyboardVersion` records
what each chat was last *sent*; `KEYBOARD_VERSION` is what the code builds.
**Bump it whenever the keyboard changes.** The debt is paid on the chat's next
interaction (one short message, then the reply) and by the daily digest, which
carries no markup of its own. The version is written only after Telegram
accepts the send. Never broadcast.

### Feature 31 — Offline writes (parked)

Taking and adding stock with no signal, synced on reconnect. **Built for the
Next app on `feature/offline-sync` and never merged.** The branch predates the
workspace split, so it cannot be rebased. Its design (queue *intents*, never
results; re-plan FEFO at sync time; `clientOpId` idempotency; show a failed
queued take rather than swallowing it; `occurredAt` from the device) is the
reference for rebuilding offline on the API. Records:
[docs/archive/OFFLINE_SYNC.md](docs/archive/OFFLINE_SYNC.md) and
[docs/archive/FEATURE_31_OFFLINE.md](docs/archive/FEATURE_31_OFFLINE.md).
Status: [docs/ROADMAP.md](docs/ROADMAP.md).

### Feature 32 — «Рецепти»: what to cook from what is in the house

- One button. Pressing it asks Claude for **one dish** made from current stock,
  in Ukrainian. **Nothing is spent on a page view**; the page says how many
  items it would send. A near-empty pantry is refused before any request.
- The model is **Claude Haiku 4.5** (cheapest), overridable with
  `ANTHROPIC_MODEL`. `max_tokens` 900. Client timeout 12 s with 1 retry, under
  the route's `maxDuration = 30`; the arithmetic matters, or the platform kills
  the request before the Ukrainian error can be returned.
- **What is sent:** one line per item (name, quantity, a note only when it is
  about to spoil), urgent first, at most 60 lines. **Expired and zero-stock
  items are never sent.** Non-food is excluded by instruction, not by filter.
- The answer is shown as the text the model wrote, not parsed. **Nothing is
  stored.**
- **`packages/core/src/claude.ts` is the only module that talks to the
  provider**; `recipes-service` builds the prompt and calls it.

**32.1** The cost is shown in words («Надіслано 639 токенів…, отримано 229 ·
приблизно 0,0018 USD»), and only for models with a price on file.
**`Household.aiEnabled`, default off**, is checked in three places: the nav
hides the tab, `/recipes` redirects, and **the service refuses**. A hidden link
is not an access control. The API additionally throttles the endpoint to 6
requests a minute.

### Feature 33 — What the architecture review found

The full review: [docs/archive/ARCHITECTURE_REVIEW.md](docs/archive/ARCHITECTURE_REVIEW.md).
What it changed:

- **§3.7**: stock writes are conditional on what they planned from, and
  re-plan on conflict.
- **Movement timestamps render in Kyiv time** (`formatDateTime` pins
  `Europe/Kyiv`). Date-only values stay UTC. Hardcoded beside a comment naming
  the `Household.timezone` upgrade path; `bot/digest.ts` hardcodes the same
  zone, and the two change together.
- **Server components read through `apps/web/lib/queries.rsc.ts`**, which
  wraps the hot readers in `React.cache` and threads them into
  `getAttentionCounts` / `getDashboard`. The bot and the digest keep the
  uncached module.
- **Playwright** exists, and is deliberately small.

### Feature 34 — The HTTP API

`apps/api` is a **third front end, never a third implementation**: every read
goes through `@supplies/db/queries`, every write through the `@supplies/db`
services. The toolchain is in [apps/api/CLAUDE.md](apps/api/CLAUDE.md); the
auth design is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §8.

- **Access token:** JWT, 15 minutes, `Authorization: Bearer`, carrying `sub`
  and `householdId`.
- **Refresh token:** opaque, 30 days, stored as SHA-256 in `ApiRefreshToken`,
  **rotated on every use**. A cookie for the SPA; the request body for the
  phone (`/auth/login` answers both ways).
- **Reuse detection:** presenting a revoked token revokes **every** token for
  that user. A 10-second grace window applies only to tokens revoked by
  rotation. **One exception:** a token revoked by a password reset or change
  (`revokedReason = password`) answers 401 and nothing more. Its device was
  signed out on purpose and will try to refresh, and treating that as theft
  would sign out the session the change was meant to keep.
- **Every access token names its session** (`sid`, the id of the refresh-token
  row issued with it), which is how a password change knows which session to
  keep.
- **`API_JWT_SECRET` is separate from `AUTH_SECRET`.** Two secrets, two blast
  radii.
- **Same `User` row, same bcrypt hash** on every client.
- **Household scoping is a guard.** Handlers receive `householdId` from the
  verified token and never read it themselves.
- **Refusals are message keys** (`{ statusCode, key, params?, message }`), so
  every client renders the same Ukrainian.
- **Response shapes are zod contracts** in `packages/core/contracts`,
  enforced by the API's e2e suite ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §7).
- Config is zod-validated at boot; every origin is an env var with a localhost
  default. Rate limited in memory (120 requests a minute, 6 for recipes).

### Feature 35 — The daily reminder as a phone notification

- **One message a day, and it is the digest's message**, flattened for a
  notification (`digestText` is the single source).
- **`PushDevice` is keyed by the Expo push token**, so one person may have
  several devices. Registering an existing token *reassigns* it, because two
  people signing into one phone get the same token.
- **Permission is asked once, from «Налаштування → Сповіщення»**, never on
  launch. **No in-app off switch**; the operating system's is the honest one.
- **Only `DeviceNotRegistered` deletes a row.** Rate limits and transport
  errors are temporary.
- **Push never fails the digest**, which has already reached Telegram by
  then.
- The Expo push service relays to FCM and APNs; the credentials live on EAS,
  not in this repository. **Delivery is unverified.** It needs FCM credentials
  and a real device.

## 7. Conventions

- Quantities are `Decimal(12,3)` in the column and `decimal.js` in code
  (`@supplies/core/decimal`). Never float arithmetic, never `Number()` on a
  quantity. Pass them to Prisma as strings via `toDbQuantity()`, rounded to 3
  dp.
- Expiry and opened dates are **date-only** (`@db.Date`) and go through
  `@supplies/core/period` (UTC getters).
- Business rules live in pure `packages/core` functions with colocated vitest
  tests. When a rule changes, its tests change in the same commit. Tests for
  user-facing copy assert the **rendered string**, prefix included.
- **Every batch change writes its `StockMovement` in the same transaction.**
  Movements are never updated or deleted.
- **Every stock write goes through `@supplies/db/stock-service`**, and every
  other write through its `@supplies/db` service. Server actions and
  controllers are thin: session, validation, cache invalidation.
- Server actions guard with `requireSession()`; API handlers receive the
  caller from the guard. **Every query is scoped by `householdId`.**
- Household settings (`expiryWarnDays`, `digestHour`) are **data**. Pure
  functions take them as input.
- Never prefix a state word onto a date phrase. A function that formats copy
  about a state returns the whole phrase («придатне ще 7 днів», «спливає
  сьогодні», «прострочено 3 дні тому»).
- Env lives in the repo root's `.env` (template: `.env.example`, which lists
  every variable with its purpose). Real environment variables always win.

## 8. Language — Ukrainian only

The **interface is Ukrainian, and only Ukrainian.** There is no next-intl, no
message catalogue for UI copy, no locale cookie, no switcher and no
`User.locale`. Do not add an i18n layer "just in case": if English is ever
wanted, it is a deliberate project of its own.

- **UI copy is written in Ukrainian directly in the components.** No `t()`,
  no keys. What you read in the JSX is what the user sees.
- **Strings produced outside React use a typed key map**:
  `@supplies/core/messages` (key → Ukrainian, with `{param}` interpolation).
  This covers engine rule errors, validation errors (zod messages are keys),
  API refusals, bot replies and digest text. **Pure functions return the key
  and its params, never a formatted sentence**, so tests assert on keys and
  three clients render one catalogue.
- **All formatting goes through `@supplies/core/format`**: `uk-UA`,
  `DD.MM.YYYY`, a decimal comma, a space as the thousands separator. Never call
  `toLocaleString()` ad hoc.
- **Plurals are real** («1 пляшка / 2 пляшки / 5 пляшок»). The CLDR `uk` rule
  is **written out** in `selectUkPlural`, because Hermes has no
  `Intl.PluralRules`. Digit grouping is written out too, because Hermes'
  `NumberFormat` rejects a BigInt. Both are tested against Node's real `Intl`.
- `<html lang="uk">`; the manifest declares `"lang": "uk"`. Seed data is
  Ukrainian.
- **Everything else is English**: docs, code, comments, identifiers, commit
  messages. Where English prose quotes a UI label («Загальна група»), the
  Ukrainian stays, because it names what the user sees.
