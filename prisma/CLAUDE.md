# prisma/ — schema, migrations, seed

Domain rules these tables serve: [PROJECT_PROMPT.md §3](../PROJECT_PROMPT.md).

## Workflow

- Config lives in `prisma.config.ts` at the repo root (Prisma 7 — **not** in `schema.prisma` or `package.json`). The datasource URL comes from there, which is why the `datasource db` block has no `url`.
- `pnpm db:up` — Postgres 17 via docker compose, host port **5434**. (Production runs Postgres 18 on Neon; see docs/ROADMAP.md.)
- `pnpm db:migrate` — `prisma migrate dev`, writes to `prisma/migrations/`.
- `pnpm db:seed` — runs `prisma/seed.ts` via tsx.
- `pnpm prisma generate` regenerates the one client into `packages/db/src/generated/prisma/` (gitignored; also runs on `postinstall` and in `pnpm build`). It is generated as **CommonJS** (`moduleFormat = "cjs"`) so that Nest can run it and Next, Vite and the scripts can all load it.
- Production migrations run through `pnpm migrate:deploy`, never `prisma migrate deploy` against the pooled URL ([docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) §2).

## Conventions

- **Quantities are `Decimal(12,3)`.** Three decimals covers 0,5 л and 0,25 кг. Pass values to Prisma as **strings** (`.toFixed(3)`), never JS numbers — floats silently lose precision.
- **Calendar days are `@db.Date`**, not `DateTime`: `StockBatch.expiresAt`, `StockBatch.openedAt`, `Household.lastDigestOn`. Compare and format them through `@supplies/core/period` (UTC getters only).
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

## After changing the schema: clear `.next`, not just restart

`pnpm prisma generate` rewrites `packages/db/src/generated/prisma/`, but **Turbopack has already compiled the old client into `apps/web/.next/dev/server/chunks/`** and keeps serving that chunk across a restart. The symptom is a `PrismaClientValidationError` naming your new column — *"Unknown argument `note`. Did you mean `item`?"* — while the generated client on disk plainly has it. Reads often keep working (the missing field just comes back `undefined`), so only writes fail, which makes it look like an action bug.

The fix, in this order:

1. stop the dev server (`pnpm dev:stop` if you used `dev:all`)
2. `rm -rf apps/web/.next` (it is locked while the server runs)
3. `pnpm dev`

## A stale `.next` also breaks auth, not just Prisma

The rule above — clear `.next` after schema changes — has a second symptom
that looks nothing like a database problem:

    [auth][error] UntrustedHost: Host must be trusted.
    URL was: http://localhost:3000/api/auth/session

If the stack frames name `...runtime.prod.js` or `chunks/ssr/...prod.js` while
you are running `pnpm dev`, `.next` holds a **production** build — usually
because someone ran `pnpm build` in the same working tree. Those chunks carry
`NODE_ENV=production`, where Auth.js stops trusting localhost automatically
and demands `AUTH_TRUST_HOST` or `AUTH_URL`.

The fix is the same: stop the dev server, delete `.next`, start it again. Do
not add `AUTH_TRUST_HOST` to make it go away — that hides a stale build rather
than fixing it. Set it only when deliberately serving `pnpm start` locally.

## Drift when a migration lives on another branch

Two branches that each add a migration will fight over one local database, and
the symptom is `prisma migrate dev` refusing to run:

    Drift detected: Your database schema is not in sync with your migration history.

It means the database has migrations applied that the *checked-out branch* has
no files for — you migrated on branch A, switched to branch B, and B knows
nothing about them. It is not corruption and it does not need a reset.

Find what the database has that the branch does not:

```sql
select migration_name from "_prisma_migrations" order by migration_name;
```

Compare with `prisma/migrations/`. For each extra one, drop what it created and
delete its history row — the files still exist on the other branch and will
re-apply when you check it out again:

```sql
drop table if exists "ThatNewTable";
delete from "_prisma_migrations" where migration_name = '20260831192302_client_operations';
```

`prisma migrate reset` also works and is more thorough, at the cost of the demo
data (`pnpm db:seed` rebuilds it).

**The cheaper fix is not to be in this position.** A branch carrying a
migration should merge in days, not weeks; the longer two of them coexist, the
more often this costs somebody twenty minutes.

Related: a **prod-copy database can be behind the schema** in the same way.
`pnpm db:prod-copy` restores whatever the dump held, which may predate
migrations that are already on `main` — the app then crashes on a column that
does not exist there. Fix by pointing `migrate deploy` at the copy:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/supplies" pnpm exec prisma migrate deploy
```
