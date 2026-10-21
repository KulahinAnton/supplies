# Roadmap

What is not built yet, what is built but wrong, and what would make the code
better, in priority order. Written on 2026-10-21 from a full read of the docs
and a check of the code against them. The baseline that day was green:
`pnpm verify` (lint, six typechecks, 378 unit tests and 28 API unit tests).

When an item lands, it leaves this file. A rule or behaviour goes into
[PROJECT_PROMPT.md](../PROJECT_PROMPT.md); a structural decision goes into
[ARCHITECTURE.md](ARCHITECTURE.md).

**Priority:** **P0** do before anything else ships · **P1** next · **P2**
worth doing · **P3** only with a reason.
**Size:** **S** under an hour · **M** half a day to a day · **L** more.

---

## 1. Defects: code that disagrees with its own rules

None open. The four found on 2026-10-21 were fixed the same day (see
[Closed](#closed)).

## 2. Ship what is built

### 2.1 Merge `feature/shared-core` into `main` · P0 · M

Sixty-four commits and six weeks of work (the workspace split, the API, the
SPA, the phone app, Features 33–35 and four migrations) exist only on this
branch. Production still runs the pre-split layout. The longer it waits, the
more the cut-over costs, and the more a fix to production has to be made twice.
`chore/post-review` is already contained in this branch.

**Proposal:** the procedure in [DEPLOYMENT.md](DEPLOYMENT.md) §3: backup,
Root Directory, preview, merge, checks. **New step:** confirm
`TELEGRAM_WEBHOOK_SECRET` is set for Production first, because the webhook now
refuses every update without it. Before merging, `git pull` on the local
`main`, which is one commit behind `origin/main`.

### 2.2 Deploy the API and the SPA · P0 · M

Until the API has a public HTTPS address, the phone app works only on the home
Wi-Fi, and the SPA exists only on a laptop. This is what turns three of the
four clients from demonstrations into things the household uses.

Before the first deploy (details in [DEPLOYMENT.md](DEPLOYMENT.md) §6):

- **Set `TRUST_PROXY`** for the host (usually `1`). The setting exists and
  defaults to off; without it the whole household shares one rate-limit
  bucket.
- **A tighter limit on the credential endpoints** · S–M. The global throttle
  is 120 a minute ([app.module.ts:44](../apps/api/src/app.module.ts)), and
  `login`, `register`, `forgot-password` and `reset-password` inherit it.
  Give them their own `@Throttle` (say 10 a minute), as `recipes` already
  has. **Not done yet, deliberately:** the API e2e suite signs in about fifty
  times from one address and the SPA's Playwright run signs in on every test,
  so a fixed limit would fail CI. Make the limit an env variable
  (`AUTH_THROTTLE_LIMIT`, default 10) and raise it in both test setups in the
  same change.
- Choose the host (US East, beside Neon), choose the domain arrangement (sibling
  subdomains avoid third-party-cookie trouble), and give the SPA project a
  rewrite to `/index.html`.

### 2.3 Push delivery · P1 · S (plus your Firebase account)

Feature 35 is built end to end except the part only the account owner can do:
a Firebase project, its FCM credentials uploaded to the EAS project, and one
real device that receives the noon digest. Until then push is "built and
unverified".

### 2.4 Play Store listing · P3 · M

Optional (Phase 3.8). The household does not need it: the APK installs
directly. Two facts to plan around: a new personal Play account must run a
closed test (12 testers, 14 days) before publishing, and Android developer
verification starts restricting unregistered sideloads in 2027. A free
limited-distribution account covers a household.

## 3. Operations

### 3.1 Error reporting · P1 · M

Nothing reports a production exception. The API logs to stdout, and the Next
app's `error.tsx` writes to the browser console of whoever saw it. A failure is seen only if a
family member mentions it. (Review finding F8, still open.)

**Proposal:** the zero-vendor option first: one `reportError()` in
`packages/db` that sends a short message through the bot to the owner's chat,
rate-limited, called from `RuleErrorFilter`'s 500 branch, the Next app's error
boundaries (through a server action), and the digest's catch. Use Sentry's free
tier if stack traces with source maps turn out to matter.

### 3.2 Backups on a schedule · P2 · S

`pnpm backup:prod` works and was last run on 2026-10-21, but it runs when
somebody remembers. (Review finding F9.) A weekly GitHub Actions job running
the same `pg_dump` against a repository secret, keeping the dump as a 30-day
artifact, closes that gap. Mind that an artifact on a public repository is
downloadable by collaborators. If the repository is public, encrypt the dump
with `age` and a key that is not in the repo.

### 3.3 A monthly spend limit on the Anthropic key · P1 · S, no code

Any member can press «Що приготувати сьогодні?» repeatedly. The API throttles it
and the Next app does not. The real cap belongs in the Anthropic console, and
costs nothing to set.

### 3.4 Run the same Postgres everywhere · P2 · S

Production is Postgres 18 (Neon); `docker-compose.yml` and CI run 17. The
backup scripts already had to move to 18 because of it. A migration that
behaves differently between majors would pass CI and fail on deploy.

**Proposal:** `postgres:18-alpine` in `docker-compose.yml` (a fresh volume:
majors do not share a data directory) and in CI.

### 3.5 Housekeeping for token tables · P3 · S

`ApiRefreshToken` gains a row on every refresh (every 15 minutes of use per
device) and nothing ever deletes one. The same goes for expired
`PasswordResetToken` and `HouseholdInvite` rows. Harmless at this size, and
unbounded. Delete rows that expired more than a week ago (revoked rows must
outlive their expiry no longer than that, since replay detection only needs
them while the token could still be presented), piggybacking on the daily cron.

### 3.6 Pin the Node version · P3 · S

CI runs Node 24, `@types/node` is `^20`, and there is no `engines` field or
`.nvmrc`, so Vercel, the future API host and a new laptop each pick their own.
Pin 24 in `package.json` `engines`, move `@types/node` to 24, and set the same
version on Vercel.

## 4. Repository housekeeping · P1 · S

- **Delete merged and superseded branches**, locally and on GitHub:
  `chore/post-review` (contained in this branch), `feature/recipes`
  (squash-merged as #1), `feature/react-native` (its one document is now
  `docs/archive/REACT_NATIVE_PORT.md`). For `feature/offline-sync`, **tag it
  first** (`git tag archive/offline-sync feature/offline-sync`) so the code
  stays reachable, then delete the branch.
- **Remove the leftover root `.next/`** from before the Next app moved
  (ignored, but it confuses tools that walk the tree).

## 5. Not built yet

### 5.1 Offline writes, on the phone · P2 · L

Feature 31 was built for the Next app (service worker, IndexedDB outbox,
`/api/sync`) and parked. It cannot be rebased onto the workspace. Its design
transfers intact, and belongs on the API, where one implementation serves the
phone (which is where offline actually happens) and the SPA:

- the client queues **intents** («взяв 2 л молока»), never batch arithmetic;
- the server replays them through `stock-service`, **re-planning FEFO at
  apply time**;
- `clientOpId` makes a replay idempotent, and the outcome is stored, failures
  included, so a refused take stays refused;
- a queued take that fails at sync is **shown**, with retry or discard;
- `occurredAt` comes from the device.

Start with the API endpoint and the `ClientOperation` table, then a TanStack
Query `onlineManager` + persisted-mutation outbox on the phone. Reference:
[archive/OFFLINE_SYNC.md](archive/OFFLINE_SYNC.md),
[archive/FEATURE_31_OFFLINE.md](archive/FEATURE_31_OFFLINE.md).

### 5.2 Several barcodes per item · P2 · M

Recorded as "not built" in Feature 26. It is the better answer when a
manufacturer changes a product's barcode: one item and two codes, rather than a
set of two items. It needs an `ItemBarcode` table (unique per household), a
data migration from `Item.barcode`, and every lookup reading the new table.

### 5.3 Make `digestHour` real in production · P2 · S

Settings offers an hour that production ignores, and says so in small print
(Feature 19). Vercel Hobby allows only daily cron, but a GitHub Actions
schedule is free: an hourly workflow calling `/api/cron/digest` with the bearer
secret, and the route switched to `respectHour: true`, honours every
household's hour with no paid plan. The hour comparison is already Kyiv time
(`isDigestHour`). The alternative is to
remove the field from Settings and stop offering a setting that does nothing.

### 5.4 A barcode photo sent to the bot · P3 · M

The last bullet of Feature 10, never built: decode a photo server-side and
continue into `/add`. It needs a server-side decoder (the ZXing port for Node)
and Telegram's file download. Worth it only if typing names in the bot turns
out to be the bottleneck.

### 5.5 "Where you are signed in" · P3 · M

`ApiRefreshToken.userAgent` was added for this screen and nothing reads it. A
list of sessions with "sign out everywhere" in Settings, on all three clients,
builds on the `sid` claim every access token now carries.

### 5.6 iOS · P3 · L

Parked by decision 11. What is left: haptics, an Apple Developer account,
TestFlight, App Store review. The cross-platform groundwork (safe areas,
keyboard, `expo-camera`, platform-neutral push) is already in place.

### 5.7 Product decisions waiting on you

- **The default `minQty` for a new item.** It is 0, which since Feature 25
  means "never remind". Restock reminders are therefore opt-in per item. A
  default of 1 makes them opt-out without weakening the 0 opt-out.
- **A per-category «це їжа» flag** for recipes, if the prompt's instruction to
  ignore non-food ever fails in practice (Feature 32).
- **`Household.timezone`**, the day a second timezone exists. Until then, Kyiv
  is hardcoded in two places that change together (Feature 33).

## 6. Code and architecture

### 6.1 One API client for the SPA and the phone · P2 · M

`apps/spa/src/api/keys.ts` and `apps/mobile/lib/api/keys.ts` are the same map
with the same invalidation sets, and each client spells out its own endpoint
URLs inline: about 70 calls in the SPA and 60 on the phone. A path that changes
on the server is found by a screen, not by the compiler.

The transport genuinely differs (a cookie vs SecureStore), which is why
`client.ts` is written twice, and that stays true. Everything above the
transport is identical: the paths, the request bodies, the response contracts
and the keys.

**Proposal:** `packages/api-client`: the key map, the invalidation sets, and one
typed function per endpoint (`items.consume(id, body)` returning the contract's
type), all taking an injected `request(method, path, body)`. Each app keeps its
own `client.ts` as that function. This passes the sharing test in
[ARCHITECTURE.md](ARCHITECTURE.md) §4: neither host gives up an idiom, both
already use TanStack Query, and a path or key drift becomes a type error.

### 6.2 Decompose the web shopping list · P2 · M

`apps/web/components/shopping-list.tsx` is 803 lines. The Phase 2.10 audit
called it "the same smell one size down" as the SPA monoliths it then split.
The SPA's version is split into `hooks/use-shopping-list.ts`,
`use-buy-flow.ts`, `use-row-drag.ts` and per-component files. Mirror that
split, which also makes the two clients easier to keep at parity.

### 6.3 TypeScript 6 · P3 · M

Expo SDK 57 expects TypeScript 6.0. The workspace is on 5.9.3, and
`expo.install.exclude` hides the warning. Upgrade the whole workspace at once,
as its own PR, rather than letting the phone drift onto a different compiler.

## 7. Tests

### 7.1 Component tests for the shared UI · P2 · M

`packages/ui` has no tests, and both web clients render it. Testing Library on
the pieces with behaviour (`settings-list-panel`, `id-set-store`,
`barcode-scan-button`'s fallback choice, `state-badges`' copy) would put a
check on the one layer shared by two apps that currently has none. Deferred in
Phase 2.10 "to 4.5's CI work"; 4.5 shipped without it.

### 7.2 One driven flow on the phone · P3 · M

The phone has no automated test beyond `expo-doctor` and a bundle. The original
plan named Maestro. A single flow (sign in, take one, see the number change),
run against the emulator locally rather than in CI, would catch the class of
bug that only a device shows, which has happened four times.

### 7.3 Typed routes in CI · P3 · S

Expo Router's route types are generated only by `expo start`, so CI type-checks
the phone with a looser `Href` and a link to a missing route passes. Generating
the types before `tsc` in the mobile job closes that.

## 8. Deliberately not doing

From the September review and the port, still true:

- **Paging in SQL.** States are derived from batches; expressing §3.4/§3.5 in
  SQL would be a second implementation of the rules. Revisit only with
  evidence, somewhere past a thousand items.
- **Splitting `queries.ts`.** It is the single place the database meets the
  engine, by design.
- **A revocation list for web sessions.** `requireSession()` re-reads the user
  on every request, so deactivation is immediate. API sessions are revocable,
  and a password reset or change ends them (Feature 1).
- **`useActionState` in the web forms.** A rewrite of working forms for idiom
  alone; the custom runner also keeps `SettingsListPanel` host-neutral.
- **Moving the web app onto the API's tokens.** Two auth systems is a
  deliberate state, not an inconsistency.

## Suggested order

| # | Item | Size |
|---|---|---|
| 1 | 4 Repository housekeeping (branches, the root `.next/`) | S |
| 2 | 2.1 Merge to `main`, with the cut-over | M |
| 3 | 3.3 Anthropic spend limit | S |
| 4 | 2.2 Credential throttles, then deploy the API and the SPA | M |
| 5 | 2.3 Push delivery on a real phone | S |
| 6 | 3.1 Error reporting | M |
| 7 | 5.3 Make the digest hour real in production | S |
| 8 | 3.4 Postgres 18 everywhere, 3.6 Node pinned | S |
| 9 | 6.1 Shared API client | M |
| 10 | 6.2 Web shopping list split, 7.1 UI component tests | M |
| 11 | 3.2 Scheduled backups | S |
| 12 | 5.1 Offline on the phone | L |

## Closed

Kept briefly so the next reader can see what moved. The rules now live in
[PROJECT_PROMPT.md](../PROJECT_PROMPT.md).

| Date | Item | Where it went |
|---|---|---|
| 2026-10-21 | A password reset left API sessions alive; so did a change | Feature 1, Feature 34. Reset ends every refresh token; a change ends all but the caller's (`sid` claim). New `revokedReason = password` (migration `20261021144928`), which is refused without the theft response. Two API e2e checks, mutation-tested |
| 2026-10-21 | The Telegram webhook accepted unsigned updates when its secret was unset | Feature 9. `bot/webhook-gate.ts` (unit-tested) refuses everything (503) without a secret |
| 2026-10-21 | `digest:run` compared a Kyiv hour with the UTC hour | Feature 19. `isDigestHour`, tested across both DST offsets |
| 2026-10-21 | `.env.backup.example` was gitignored | `.gitignore` re-includes it |
| 2026-10-21 | No way to trust a host's proxy | `TRUST_PROXY` in `apps/api/src/config/env.ts`, default off, unit-tested |
| 2026-10-21 | A stray trailing space in `shopping.controller.ts` | Reverted |
