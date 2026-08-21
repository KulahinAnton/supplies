# Supplies

Household stock and expiry tracker for a family. Mobile-first web app (installable as a PWA) plus a Telegram bot.

**The interface is Ukrainian.** Everything technical — this file, the docs, code, comments, identifiers, commit messages — is English. See [Language](#language) below.

- **Shared pantry.** Everyone has their own login; the household sees one inventory.
- **One product, many batches.** Ten bottles of water that expire on three different dates is one item with three batches, entered in a single submit.
- **FEFO consumption.** Taking stock draws from whatever expires soonest, and never touches an expired batch — those have to be discarded explicitly, so "we drank it" can't be silently recorded against milk that had already gone off.
- **Shared shopping list**, grouped by shop (or any other axis you like), with drag and drop. Ticking something off puts it straight into stock.
- **Barcode scanning** that fills the item form from Open Food Facts and its sibling databases, and can contribute back what they did not know.
- **Telegram bot** and a daily digest of what's expiring or running out.

## Quick start

```bash
pnpm install
```

```bash
cp .env.example .env
```

Fill in `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then bring up the database and seed it:

```bash
pnpm db:up
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Demo login: `anton@example.com` / `supplies123`.

Postgres runs in Docker on host port **5434**. Docker Desktop must be running, and it does not start automatically after a reboot — a Prisma error on whatever query happens to run first almost always means the database is down, not that the query is wrong.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and run |
| `pnpm test` | vitest over the pure rules in `lib/`, no database |
| `pnpm test:db` | Integration smoke test against a live seeded database |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm db:up` / `db:migrate` / `db:seed` / `db:studio` | Database |
| `pnpm bot:dev` / `pnpm bot:start` | Telegram bot (long polling) |
| `pnpm bot:webhook:set` / `:delete` | Register or remove the production webhook |
| `pnpm digest:run` | Daily expiry and out-of-stock digest (also runs via Vercel Cron, and on demand from Settings) |

## How the domain works

An **Item** is a kind of thing ("Молоко 2,5%"). A **StockBatch** is a concrete lot of it with its own quantity *and its own expiry date* — because two cartons bought a week apart go off on different days.

An item's quantity is **never stored**. It is the sum of its live batches, computed on read, so the number cannot drift away from reality. Every batch change writes a `StockMovement` in the same transaction, which is what makes "who used the last of it" answerable.

Stock state is `OUT` / `LOW` / `OK`; expiry state is `EXPIRED` / `SOON` / `FRESH` / `NONE`. They are tracked and displayed **independently**, because an item can be well stocked and half-expired, and collapsing them into one badge would hide whichever half is worse.

[PROJECT_PROMPT.md](PROJECT_PROMPT.md) §3 has the full rules; §3.6 is a worked example that `lib/stock.test.ts` reproduces verbatim.

## Language

Ukrainian is the **interface language**, and only that:

- **UI copy is written in Ukrainian directly in the components** — no i18n library, no message catalogs, no locale switcher. What you read in the JSX is what the user sees.
- Strings produced outside React (engine rule errors, validation messages, bot replies, the digest) live in `lib/messages.ts` as a typed key → Ukrainian map. Pure functions return the key and its params, never a formatted sentence, so tests assert on stable keys instead of prose.
- Dates and numbers format through `lib/format.ts` (`uk-UA`, `DD.MM.YYYY`, decimal comma, and real `one/few/many` plurals — "1 пляшка / 2 пляшки / 5 пляшок").
- Seed data is Ukrainian, since it is content rather than code.

**Everything else is English:** this README, `CLAUDE.md` and the per-area docs, `PROJECT_PROMPT.md`, code, comments, identifiers, and commit messages. Where English prose quotes a literal UI label — «Загальна група», for instance — the Ukrainian stays, because the doc is naming something the user actually sees on screen.

## Deployment

[deployment-instructions.md](deployment-instructions.md) — Vercel + Neon, free tier. Migrations run as part of the build, so an ordinary `git push` is the whole deploy.

## Documentation

- [PROJECT_PROMPT.md](PROJECT_PROMPT.md) — the full specification: domain rules, data model, every feature, and implementation notes recording what changed and why.
- [CLAUDE.md](CLAUDE.md) — stack, layout, auth model, conventions.
- [prisma/CLAUDE.md](prisma/CLAUDE.md) · [components/CLAUDE.md](components/CLAUDE.md) · [bot/CLAUDE.md](bot/CLAUDE.md)

## Status

Features 0–19 are implemented and running in production on Vercel + Neon. `pnpm test` (207), `pnpm test:db`, `pnpm lint`, `pnpm typecheck` and `pnpm build` all pass.

Not yet exercised: the drag gesture on the shopping list, whose wiring, collision strategy and server action are verified but which has never been driven by an actual finger or mouse; and the first automatic run of the daily digest.
