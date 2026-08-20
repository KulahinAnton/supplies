# Запаси (Supplies)

Домашні запаси для родини: що є, скільки, що закінчується і що псується.
Веб-застосунок (mobile-first, PWA) + Telegram-бот.

- Спільна комора на всю родину — кожен зі своїм входом, дані одні.
- Один товар — кілька партій із власними датами придатності.
- Списання за принципом FEFO: першим іде те, що псується найшвидше.
- Спільний список покупок: позначили куплене — воно одразу в запасах.
- Сканування штрихкодів і щоденне зведення в Telegram.

Мова інтерфейсу — українська.

---

## Швидкий старт

```bash
pnpm install
cp .env.example .env      # заповніть AUTH_SECRET
pnpm db:up                # Postgres 17 у Docker, порт 5434
pnpm db:migrate           # створює першу міграцію
pnpm db:seed              # демо-дані
pnpm dev
```

Демо-вхід: `anton@example.com` / `supplies123`.

`AUTH_SECRET` згенерувати:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Команди

| Команда | Що робить |
|---|---|
| `pnpm dev` | сервер розробки |
| `pnpm build` / `pnpm start` | продакшн-збірка та запуск |
| `pnpm test` | vitest — чисті правила з `lib/`, без БД |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm db:up` / `db:migrate` / `db:seed` / `db:studio` | база даних |
| `pnpm bot:dev` / `pnpm bot:start` | Telegram-бот |
| `pnpm digest:run` | щоденне зведення |

## Документація

- [PROJECT_PROMPT.md](PROJECT_PROMPT.md) — повна специфікація: правила предметної області, модель даних, перелік функцій.
- [CLAUDE.md](CLAUDE.md) — стек, структура, домовленості.
- [prisma/CLAUDE.md](prisma/CLAUDE.md) · [components/CLAUDE.md](components/CLAUDE.md) · [bot/CLAUDE.md](bot/CLAUDE.md)
