# bot/ — Telegram bot (grammy)

Spec: [PROJECT_PROMPT.md Feature 9](../PROJECT_PROMPT.md).

## The rule that matters

**The bot is a second front end, never a second implementation.** Every read goes through `lib/queries.ts`; every write goes through `lib/stock-service.ts` — the same module the server actions call. If a rule needs fixing, it gets fixed once, in `lib/`, and both front ends inherit it.

`bot/actions.ts` is deliberately three lines per operation. If it ever grows business logic, that logic is in the wrong file.

## Running it

- `pnpm bot:dev` / `pnpm bot:start` — long polling, for local development (`bot/index.ts`).
- Production uses the webhook at `app/api/telegram/route.ts` (Node runtime — the bot touches Prisma). Telegram echoes `TELEGRAM_WEBHOOK_SECRET` in the `x-telegram-bot-api-secret-token` header and the route rejects anything else, so the URL alone is not a credential.
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` (for the deep link), plus `AUTH_SECRET` (signs link tokens).

## Linking a chat

`/start <token>` where the token is a signed `userId.expiry.signature` triple from `lib/telegram-link.ts`, generated in Settings → Telegram and valid for 15 minutes.

Stateless on purpose: no table, no cleanup job, and it cannot be replayed once expired. **Rotating `AUTH_SECRET` invalidates every outstanding link token** — correct behaviour, not a bug.

`bot/auth.ts` `resolveChat()` is the bot's `requireSession()`: it re-reads the user each time, so a deactivated account loses bot access immediately. An unlinked chat can do nothing but `/start`.

## Commands

| Command | Does |
|---|---|
| `/low` | items that are OUT or LOW |
| `/expiring` | items EXPIRED or SOON |
| `/list` | the unchecked shopping list |
| `/add` | guided: item → quantity → expiry |
| `/took` | guided: item → quantity (FEFO consume) |
| `/cancel` | drop the current conversation |

## Switching between the deployed bot and your machine

Telegram delivers to **one transport at a time**, so these are the switch:

| Command | Effect |
|---|---|
| `pnpm bot:webhook:set` | the **deployed** app handles messages |
| `pnpm bot:webhook:delete` | nothing does, until you start a local bot |
| `pnpm bot:local` | both of the above — delete the webhook, then poll here |
| `pnpm bot:dev` | poll here (refuses if a webhook is still registered) |

The target comes from **`TELEGRAM_WEBHOOK_URL`**, deliberately separate from `APP_URL`. `APP_URL` is what the running app uses to build reset and invite links and should stay on localhost while you develop; sharing one variable would mean editing it back and forth on every switch.

`bot:dev` checks `getWebhookInfo` before polling and exits with instructions if a webhook is live. Without that it would sit there looking healthy while every message went to the deployment — the failure is silent, which is the worst kind.

Both paths publish the command list (`registerCommands`), so Telegram's / menu matches whichever bot is answering.

## Conversation state

`bot/state.ts` is an in-memory `Map` keyed by chat id. **Not persisted, on purpose**: a half-finished `/add` is worth nothing after a restart and costs the user one retyped word. Anything that matters is already a database row.

This does mean state is per-process — if the webhook ever runs on more than one instance, a multi-step conversation can land on the wrong one. Move it to Redis or a table *only* when that actually happens.

## Strings

Bot replies come from `lib/messages.ts` (`MESSAGES` / `renderMessage`) or are inline Ukrainian. There is **no** `bot/i18n.ts` here, unlike AquaBill — this app is Ukrainian-only (PROJECT_PROMPT.md §8).
