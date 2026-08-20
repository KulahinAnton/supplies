# prisma/ — schema, migrations, seed

Domain rules these tables serve: [PROJECT_PROMPT.md §3](../PROJECT_PROMPT.md).

## Workflow

- Config lives in `prisma.config.ts` at the repo root (Prisma 7 — **not** in `schema.prisma` or `package.json`). The datasource URL comes from there, which is why the `datasource db` block has no `url`.
- `pnpm db:up` — Postgres 17 via docker compose, host port **5434**.
- `pnpm db:migrate` — `prisma migrate dev`, writes to `prisma/migrations/`.
- `pnpm db:seed` — runs `prisma/seed.ts` via tsx.
- `pnpm prisma generate` regenerates the client into `lib/generated/prisma/` (gitignored; also runs on `postinstall`).

## Conventions

- **Quantities are `Decimal(12,3)`.** Three decimals covers 0,5 л and 0,25 кг. Pass values to Prisma as **strings** (`.toFixed(3)`), never JS numbers — floats silently lose precision.
- **Calendar days are `@db.Date`**, not `DateTime`: `StockBatch.expiresAt`, `StockBatch.openedAt`, `Household.lastDigestOn`. Compare and format them through `lib/period.ts` (UTC getters only).
- **Item stock is never stored.** There is no `quantity` column on `Item` — it is the sum of live `StockBatch` rows, computed at read time (§3.1). Do not add one "for performance"; that is the drift this schema exists to prevent.
- **`StockMovement` is append-only.** Every batch write inserts one in the *same transaction* (§7). Never update or delete a movement row.
- **Zeroed batches are kept**, not deleted — they are the history behind a movement. Queries filter with `quantity > 0`.
- **Everything is scoped by `householdId`.** Item, Category, StorageLocation and ShoppingListItem carry it directly; StockBatch and StockMovement reach it through `item`. A query that does not constrain the household is a bug.
- `Item.barcode` is unique **per household** and nullable — Postgres treats NULLs as distinct, so any number of items may have no barcode.
- **Deleting a `Household` cascades all the way down** — including to `User`, and onward to every row that references a user (`StockBatch.addedBy`, `StockMovement.user`, `HouseholdInvite.createdBy`, `ShoppingListItem.addedBy`, `TelegramLink`, `PasswordResetToken`). `ShoppingListItem.checkedBy` is `SetNull` because it is nullable. Without the cascade on `User.householdId` the seed's own teardown fails with `P2003` on the second run — that is what the `cascade_household_delete` migration fixes.
- Cascading a user away takes their movement history with them. That is only reachable via household deletion; the app itself **deactivates** users (`isActive = false`) and **archives** items (`isArchived = true`), never deletes either.

## Seed

`prisma/seed.ts` is idempotent: it deletes the household named **«Наша родина»** and rebuilds it, so re-running never duplicates (verified — three consecutive runs leave 1 household, 2 users, 15 items, 17 batches). This only works because of the cascade rules above. Dates are relative to the run day, so the demo never goes stale.

Re-seeding invalidates existing sessions: the JWT names a `userId` that no longer exists, so `validSessionOrNull()` sends you back to `/login`. That is correct behaviour, not a bug — sign in again.

The data is deliberately uneven so every screen has something to show:

| Item | State it demonstrates |
|---|---|
| Вода негазована 1,5 л | **the §3.1 example** — one item, three batches (2 / 1 / 7) at three expiry dates |
| Молоко 2,5% | an `EXPIRED` batch alongside a good one — something to discard on day one |
| Йогурт натуральний | `SOON` |
| Хліб житній | `OUT`, and already on the shopping list |
| Кава мелена, Пральний порошок | `LOW` |
| Сіль кухонна | no expiry at all, `minQty = 0` (opted out of low-stock warnings) |

Every seeded batch also writes its `PURCHASE` movement, so the seed obeys the same rule the app does and the history is not empty.

**Demo login:** `anton@example.com` / `supplies123` (also `olena@example.com`, same password).
