# Deployment

What runs where, how a change reaches production, and what has to happen before
the parts that are not deployed yet can be. The architecture behind these
choices is in [ARCHITECTURE.md](ARCHITECTURE.md) §10.

| Piece | Where | State | Cost |
|---|---|---|---|
| Next.js app, Telegram webhook, daily digest cron | Vercel Hobby | **production**, built from `main` | free |
| PostgreSQL | Neon free tier, `us-east-2` (Postgres 18) | **production** | free (0.5 GB) |
| NestJS API | a long-lived Node host, US East | **not deployed**, §6 | ~$5/month |
| Vite SPA | a second Vercel project | **not deployed**, §6 | free |
| Android app | EAS Build → sideloaded APK | builds; useful away from home only once the API is deployed | free tier |

---

## 1. Neon

A project in a region near the users, with two connection strings:

- **Pooled** (hostname contains `-pooler`): what the app uses. Vercel runs many
  short-lived serverless instances, and PgBouncer stops them exhausting Neon's
  connection limit.
- **Direct** (the same host without `-pooler`): what **migrations** and
  **backups** use. Migrations need a session-level advisory lock, and
  `pg_dump` needs a consistent snapshot. PgBouncer in transaction mode
  provides neither. `pnpm migrate:deploy` derives the direct host by dropping
  `-pooler`, or uses `DIRECT_URL` if it is set. `pnpm backup:prod` refuses a
  pooled URL.

**Do not seed production.** The first registration creates the household and
its default categories and locations. `pnpm db:seed` deletes the household
«Наша родина» and creates users with a published password.

The free tier suspends an idle database after about five minutes, so the first
request afterwards takes a second or two. That is normal.

## 2. The Vercel project

- **Root Directory: `apps/web`**, with *Include files outside the root
  directory* **on**. Without it, pnpm cannot install from the workspace root,
  where `packages/*`, `bot/` and `prisma/schema.prisma` live, and the build
  fails at install rather than at compile.
- **Build Command: `pnpm migrate:deploy && pnpm build`.** `apps/web` delegates
  both to the repo root (`pnpm -C ../..`), so Prisma runs where the schema is.
  - `migrate:deploy`, **not** `prisma migrate deploy`. The latter goes through
    the pooled URL and fails with
    `P1002 … Timed out trying to acquire a postgres advisory lock`. The script
    also retries, because a Neon compute waking from zero can use up the whole
    10-second lock timeout.
  - `pnpm build` runs `prisma generate` itself. That is not redundant with
    `postinstall`: once Vercel restores a build cache it skips installing, so
    `postinstall` never fires, and the generated client is gitignored.
- **Preview deployments share production's `DATABASE_URL`** unless a separate
  one is configured for Preview, so a preview build **applies pending
  migrations to production**. Either give Preview its own Neon branch, or
  check that a branch's migrations are additive before pushing it.

### Environment variables (Production)

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon **pooled** string |
| `AUTH_SECRET` | fresh: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Never reuse your local one |
| `APP_URL` | `https://<project>.vercel.app`, used in reset and invite links. Wrong here means dead links |
| `EMAIL_FROM` | `Запаси <onboarding@resend.dev>` or your verified sender |
| `RESEND_API_KEY` | optional. Without it reset and invite emails silently do nothing (the UI never reveals whether an address exists), and invites are shared with the copy-link button instead |
| `CRON_SECRET` | required for the digest; the route answers 503 without it |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (no `@`), `TELEGRAM_WEBHOOK_SECRET` | optional, §4. Set all three or none: the webhook refuses every update without the secret |
| `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` | optional, Feature 32. **Set a monthly spend limit in the Anthropic console**: any household member can press the button repeatedly |
| `OFF_USER`, `OFF_PASSWORD` | optional, Feature 18.2 |

Not needed on Vercel: `AUTH_TRUST_HOST`, `NEXTAUTH_URL` and `AUTH_URL`.
Auth.js trusts the host automatically there. Environment variables reach the
app only on a new build, so redeploy after changing one.

## 3. How a change reaches production

```
feature branch → PR → CI → squash into main → Vercel builds main → migrate:deploy → build
```

The full flow is in [CONTRIBUTING.md](../CONTRIBUTING.md). A schema change
ships its migration in the same commit, and the build applies it. **Migrations
run against production data**, so they are reviewed like code.

Before merging anything with a migration:

```bash
pnpm backup:prod
```

```bash
pnpm backup:verify
```

The dump is the only undo for the database. No Vercel button reverts a
migration. **Instant Rollback** reverts the code, reusing the previous build.

### The pending cut-over (`feature/shared-core` → `main`)

`main` still has the Next app at the repository root. This branch moves it to
`apps/web` and carries four additive migrations (`api_refresh_tokens`,
`refresh_revocation_reason`, `push_devices`, `refresh_revocation_password`). The Root Directory setting has to
change **in the same window as the merge**: a build of the new tree with Root
Directory `.` finds no `next` in `package.json`, and a build of the old tree
with `apps/web` finds nothing at all.

**Production's migration history is not `main`'s.** A dump taken on
2026-10-21 shows two migrations from the never-merged `feature/offline-sync`
applied to production (`20260831192302_client_operations`,
`20260831194054_client_operation_error_params`), almost certainly by a preview
deploy of that branch sharing `DATABASE_URL`. They created a `ClientOperation`
table that nothing on `main` or this branch uses. It is harmless, and
`migrate deploy` tolerates it: the cut-over was rehearsed against that dump
(`pnpm db:prod-copy`, then `migrate deploy` on port 5435), and the four new
migrations applied cleanly. Leave the table alone. Dropping it would be a
destructive migration for no gain, and it is the schema offline sync will want
back (docs/ROADMAP.md 5.1).

1. `pnpm backup:prod` and `pnpm backup:verify`. Then confirm
   **`TELEGRAM_WEBHOOK_SECRET` is set for Production** in Vercel. On this
   branch the webhook refuses every update (503) without it, where `main`
   silently accepted unsigned ones. If it is missing, the bot goes quiet the
   moment the new build is live.
2. Change **Root Directory** to `apps/web` (with *include files outside* on).
   Nothing rebuilds, and the live deployment keeps serving.
3. Push the branch. Vercel builds a **preview** of the new layout. If Preview
   shares `DATABASE_URL`, this preview build applies the four migrations, which
   is safe because they only add tables, a column and an enum value.
4. Preview green: merge to `main`, watch the production build, then check
   sign-in, the bot (send it any command), and **Settings → Cron Jobs** for
   both digest entries.
5. Something wrong: **Instant Rollback**. Reverting `main` itself means
   reverting the Root Directory setting with it.

## 4. Telegram bot

Get a token from [@BotFather](https://t.me/BotFather) and set the three
variables in §2. Then register the webhook **from your machine**. It talks to
Telegram, not to Vercel, and reads `TELEGRAM_WEBHOOK_URL` (the deployment's
HTTPS URL) from your local `.env`, never `APP_URL`:

```bash
pnpm bot:webhook:set
```

It refuses a non-HTTPS URL and a missing `TELEGRAM_WEBHOOK_SECRET`, since an
unauthenticated webhook URL lets anyone who guesses it post fake updates.

Telegram delivers to one transport at a time. To take the bot back to your
machine:

```bash
pnpm bot:local
```

That deletes the webhook and starts long polling. `pnpm bot:dev` on its own
refuses to start while a webhook is registered. Link your chat in
**Налаштування → Прив'язати Telegram**.

## 5. The daily digest

`apps/web/vercel.json` registers two cron entries, at **09:00 and 10:00 UTC**.
Kyiv is UTC+3 in summer and UTC+2 in winter, so no fixed UTC hour is noon all
year. The route sends only on whichever firing is **12:00 in Kyiv** and skips
the other. Hobby allows daily cron jobs only, which is why it works this way.
`lastDigestOn` makes a double fire harmless.

- `Household.digestHour` is **not** honoured in production (see Feature 19,
  and [ROADMAP.md](ROADMAP.md) for a free way to make it real).
- To move the hour: change `DIGEST_HOUR_KYIV` in `bot/digest.ts` **and** the
  two UTC schedules in `vercel.json`.
- `GET /api/cron/digest?force=1` (with the bearer secret) sends regardless of
  the hour, for testing.
- **«Надіслати зведення зараз»** in Settings sends on demand. It does not mark
  the day, so the scheduled digest still arrives.
- Phones registered for push get the same message after Telegram (Feature 35).
  Delivery needs FCM credentials on the EAS project.

## 6. The API and the SPA — before the first deploy

Neither is deployed. Everything is env-driven ([ARCHITECTURE.md](ARCHITECTURE.md)
§5), so no code has to change for the first deploy. These are the decisions and
settings it needs:

**API host** (Railway, Fly or Render; any of them):

- **Region: US East**, beside the database. Every request makes several round
  trips to Postgres.
- **A long-lived process**, not serverless (ARCHITECTURE.md §10).
- **`TRUST_PROXY`.** Off by default, which behind a host's proxy means the
  rate limiter keys every request on the proxy's address: the whole household
  shares one 120-a-minute bucket, and sign-in has no real brute-force limit.
  Set it to the number of proxies in front of the API (usually `1`), or to
  their addresses. Use `true` only if the API cannot be reached except
  through the proxy, because it believes any `X-Forwarded-For`.
- Build `pnpm api:build`; start `pnpm api:start`; health checks at
  `GET /health` (liveness) and `GET /health/ready` (database).
- Environment: `DATABASE_URL` (pooled), `API_JWT_SECRET` (fresh, and **not**
  `AUTH_SECRET`), `TRUST_PROXY`, `APP_URL` (whichever client serves `/reset-password`),
  `CORS_ORIGINS` (`https://` only; the config refuses `http://` origins in
  production), the cookie trio below, and the Telegram, Resend, Anthropic and
  barcode variables the Next app has.

**Refresh-token cookie**, which depends on the domains chosen:

| Arrangement | `COOKIE_DOMAIN` | `COOKIE_SAMESITE` | `COOKIE_SECURE` |
|---|---|---|---|
| Sibling subdomains (`api.example.com` + `app.example.com`) — preferred | `.example.com` | `lax` | `true` |
| Unrelated domains (`*.vercel.app` + `*.up.railway.app`) | empty | `none` | `true` (required; the API refuses to boot otherwise) |

Third-party-cookie blocking in Safari and Firefox makes the second arrangement
fragile. A custom domain with two subdomains avoids it.

**SPA**: a second Vercel project on the same repository, Root Directory
`apps/spa`, *include files outside* on, build `pnpm spa:build` (with
`VITE_API_URL` set **at build time**, because Vite inlines it), output
`apps/spa/dist`. It needs a rewrite of every path to `/index.html` for client
routing, and an Ignored Build Step so a commit touching only the Next app does
not rebuild it:

```bash
git diff --quiet HEAD^ HEAD -- apps/spa packages/core packages/ui
```

**Phone**: once the API has an HTTPS address, set it for the EAS `production`
(and `preview`) environment and rebuild. Production builds allow no cleartext
HTTP at all ([apps/mobile/CLAUDE.md](../apps/mobile/CLAUDE.md)).

```bash
pnpm exec eas env:set --environment production --name EXPO_PUBLIC_API_URL --value "https://api.example.com" --type string --visibility plaintext
```

## 7. Backups

| Command | Does |
|---|---|
| `pnpm backup:prod` | `pg_dump` (custom format) of production through a throwaway `postgres:18-alpine` container, into `backups/` (gitignored). Reads the **direct** URL from `DATABASE_URL_PROD` in `.env.backup` (template: `.env.backup.example`). Refuses an empty dump |
| `pnpm backup:verify [file]` | Restores the newest dump (or the named one) into a disposable container and prints exact row counts. `--keep` leaves it running |
| `pnpm db:prod-copy [file]` | Loads a dump into a local Postgres 18 on port 5435 and points the app at it through `.env.local`. The Prisma CLI keeps reading `.env`, so `db:seed` and `migrate dev` cannot reach that data by accident |

Dumps contain password hashes, emails and Telegram chat ids, unencrypted. One
copy on one laptop is not a backup. Automation is on the
[ROADMAP.md](ROADMAP.md).

A prod-copy can be behind the schema. If the app crashes on a missing column,
apply the migrations to the copy:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/supplies" pnpm exec prisma migrate deploy
```
