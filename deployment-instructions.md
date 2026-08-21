# Deploying Supplies to Vercel (free)

Web app, Telegram bot and Postgres at **$0/month** for family-scale use.

| Piece | Where | Cost |
|---|---|---|
| Next.js app | Vercel (Hobby) | free |
| Postgres | [Neon](https://neon.tech) free tier | free (0.5 GB) |
| Telegram bot | a **webhook** served by the same Vercel app — no separate process | free |
| Daily digest | Vercel Cron, 12:00 Kyiv — see [The daily digest](#the-daily-digest) | free |

Do these in order.

## 1. Create the Neon database

Sign up at [neon.tech](https://neon.tech), create a project in a region near you, and copy the **pooled** connection string — the one with `-pooler` in the hostname:

```
postgresql://<user>:<password>@ep-xxxx-pooler.<region>.aws.neon.tech/<db>?sslmode=require
```

Pooled matters: Vercel runs the app as many short-lived serverless instances, and the pooled (PgBouncer) endpoint keeps them from exhausting Neon's connection limit. This same string is used for migrations too — `prisma migrate deploy` works through the pooler.

## 2. Create the Vercel project

1. [vercel.com/new](https://vercel.com/new) → sign in with GitHub → import this repo.
2. Vercel auto-detects Next.js and pnpm. **Before deploying**, open **Settings → Build & Development Settings** and override the **Build Command**:
   ```
   pnpm prisma migrate deploy && pnpm build
   ```
   This applies pending migrations to the production database on every deploy. Safe to repeat — it only applies what has not run yet, and never authors new migrations the way `migrate dev` does.

   `pnpm build` itself runs `prisma generate` first. That is **not** redundant with the `postinstall` hook: once Vercel restores a build cache it skips installing ("Already up to date"), so `postinstall` never fires — and because `lib/generated/` is gitignored, the client is in neither the cache nor the repo. The build then fails with `Module not found: Can't resolve '@/lib/generated/prisma/client'`. Generating in the build script makes it independent of whether install ran.
3. **Settings → Environment Variables**, for **Production**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled string from step 1 |
   | `AUTH_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `APP_URL` | placeholder for now, e.g. `https://example.com` — corrected in step 3 |
   | `EMAIL_FROM` | `Запаси <onboarding@resend.dev>` |
   | `RESEND_API_KEY` | your Resend key, or omit |

   Generate a **fresh** `AUTH_SECRET` — do not reuse the one from your local `.env`.

   You do **not** need `AUTH_TRUST_HOST`, `NEXTAUTH_URL` or `AUTH_URL`: Auth.js v5 trusts the host automatically on Vercel.

   Without `RESEND_API_KEY`, password-reset and invite emails silently no-op by design (the UI never reveals whether an address exists). The app works; you just invite people with the copy-link button instead of by email.

4. **Deploy.**

## 3. Point `APP_URL` at the real domain

Copy the domain from the project Overview (`https://<name>.vercel.app`), set `APP_URL` to it in Environment Variables, then **Deployments → ⋯ → Redeploy**.

`APP_URL` builds password-reset and household-invite links. Leave it wrong and those links lead nowhere.

## 4. Create your household

**Do not seed production.** Unlike AquaBill, this app needs no bootstrap account: open the domain, click **Створити**, and register. That first registration creates the household and seeds its default categories and storage locations.

`pnpm db:seed` is for local development only — it deletes the household named «Наша родина» and creates demo users with the published password `supplies123`.

Then invite the family: **Налаштування → Створити запрошення** gives a single-use link valid for 7 days.

## 5. Telegram bot (optional)

Get a token from [@BotFather](https://t.me/BotFather), then add three variables and redeploy:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_BOT_USERNAME` | the bot's username **without** `@` |
| `TELEGRAM_WEBHOOK_SECRET` | generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

Register the webhook **from your machine** (it talks to Telegram's API, not to Vercel). Set `TELEGRAM_WEBHOOK_URL` in your local `.env` to the deployment URL — **not** `APP_URL`, which stays on localhost — then:

```bash
pnpm bot:webhook:set
```

The script refuses a non-HTTPS URL and refuses to register without `TELEGRAM_WEBHOOK_SECRET` — an unauthenticated webhook URL lets anyone who guesses it post fake updates. Nothing to undo afterwards: `APP_URL` was never touched.

To take the bot back to your machine, `pnpm bot:local` (or `pnpm bot:webhook:delete` then `pnpm bot:dev`). Telegram delivers to one transport at a time, so `bot:dev` refuses to start while a webhook is still registered rather than sitting there receiving nothing.

Link your chat in **Налаштування → Прив'язати Telegram**.

Long polling (`pnpm bot:dev`) is local-only: Vercel has no persistent process, which is why the webhook exists.

## Everyday deploys

`git push` to `main`. Vercel rebuilds and runs `prisma migrate deploy` first, per the build-command override. Nothing else to do — including after a schema change, because the migration ships in the same commit.

## The daily digest

`vercel.json` registers **two** cron entries, at 09:00 and 10:00 UTC. Vercel schedules in UTC and Kyiv is UTC+3 in summer, UTC+2 in winter, so no fixed UTC hour is noon all year. The route sends only on whichever firing is currently **12:00 in Kyiv** and skips the other, which keeps delivery steady across the DST changeover without needing a paid plan's finer schedules. `lastDigestOn` makes a double fire harmless regardless.

Needs `CRON_SECRET` set in **Production** and a redeploy — env vars only reach the app on a new build. Check **Vercel → Cron Jobs** to confirm both entries registered.

To change the time, edit `DIGEST_HOUR_KYIV` in `lib/digest.ts` **and** the two schedules in `vercel.json` to the matching UTC hours.

The **«Надіслати зведення зараз»** button in Settings sends the same message on demand and needs no cron secret; it deliberately does not mark the day, so the scheduled one still arrives.

## Notes

- **Local development is unaffected.** Your local `.env` keeps pointing at Docker Postgres on port 5434; the Vercel variables are separate.
- **Preview deployments** reuse the same `DATABASE_URL` unless you configure a separate one, so a preview branch writes to production data. For a family app, push straight to `main`.
- **Neon free tier suspends** an idle database after ~5 minutes. The first request afterwards takes a second or two to wake it — normal, not a bug.
