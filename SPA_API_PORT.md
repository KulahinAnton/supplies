# Rebuilding Supplies as SPA + API + React Native

A plan for turning one Next.js app into **one domain engine with four clients**:
the existing Next.js app, a plain React SPA, a React Native app, and the
Telegram bot that already exists.

The goal is not new features. It is to make the codebase say, without a cover
letter, that the author can build a standalone API and a React front end that
is not Next.js — and can put a phone in front of the same API.

This absorbs and supersedes [REACT_NATIVE_PORT.md](REACT_NATIVE_PORT.md), which
answered "can we go native" and correctly found that the real work is the
missing API. It also picks up **F4** from
[ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md), which is now a blocker rather
than a nice-to-have.

---

> **Decided 2026-09-04.** Full parity · NestJS · one workspace · offline branch
> parked · iOS as a later phase after Android ships · no deadline. §10 records
> the answers; the plan below is written to them.

---

## 1. Repo shape — one workspace

The reasoning is kept rather than deleted, because it is what an interviewer
will ask about the moment they see four apps in one repository — and because
the condition attached to it is real work, not a formality.

### Why one repo

The strongest thing this codebase can claim is not "it has a React SPA in it".
It is that **the rules were already factored so a second and third client could
be added without rewriting them** — 339 unit tests over pure functions, a
single stock write path, and a Telegram bot that has been proving the "one
implementation, two front ends" rule in production for months.

Copy the engine into a second repo and that claim evaporates. You get two
repositories that each demonstrate one thing, plus a divergence problem: the
day FEFO changes in one and not the other, the portfolio is actively
misleading. In one repo, adding a third and fourth client *without duplicating
a single rule* is the demonstration.

Practical arguments in the same direction:

- The 20-odd pure modules move once and are then imported by four consumers.
- One CI run proves the engine, the API, the web app and the SPA together.
- Workspace/monorepo setup is itself a thing job ads ask for, and it is only
  visible if there is a workspace.
- Nothing has to be kept in sync by hand — `packages/core` is either green for
  everyone or red for everyone.

### The condition

A reviewer gives a repository somewhere between 60 seconds and 10 minutes. If
they open the README and see a Next.js household tracker, they will conclude
"Next.js developer" and close the tab — which is the exact outcome this whole
exercise exists to prevent.

So: **the README is part of the deliverable, not documentation of it.** It has
to open with the architecture (one engine, four clients), a diagram, and a
table pointing at where each stack lives. Phase 4 treats that as work, with
hours attached.

### What was rejected, and why it is worth being able to say

A separate `supplies-api` + `supplies-spa` showcase repo reads in three minutes;
this one will not, at ~20k lines before any of this starts. That is a genuine
cost and the honest answer to "why is your portfolio repo so big" is the trade
above: brevity was given up to keep one engine and one set of rules.

The other case for splitting — not wanting to touch a live app — is handled by
sequencing instead. Every phase before the last is additive, and production
configuration does not change until Phase 4.1.

---

## 2. Where the app actually stands today

Counted, not estimated:

| | Count | Ports to a new client? |
|---|---|---|
| Screens (`page.tsx`) | 16 + 1 redirect | No — RSC, `next/*`, server actions |
| Feature components | 26 (~6.7k lines) | **Mostly, to the SPA.** Not to RN |
| UI primitives (`components/ui`) | 22 | **Yes, to the SPA**, nearly verbatim |
| Server actions | 46 across 9 files | No — become HTTP endpoints |
| Query readers (`lib/queries.ts`) | 17 | Server-side; reused by the API as-is |
| Modules in `lib/` (non-test) | 44 | 20-odd are pure and move to `packages/core` |
| Unit tests | 339 across 22 files | **Move with the code, unchanged** |
| DB integration checks | 52 (`pnpm test:db`) | Stay with the API |
| Playwright specs | 4 | Adapt to the SPA nearly as-is |
| Migrations | 14 | Untouched — one schema, one database |

**Prisma coupling is the only structural obstacle**, and it is small. Seven
modules import `Prisma` as a *value*; only three of those are pure engine —
`lib/stock.ts`, `lib/item-group.ts`, `lib/shopping.ts` — and each does it for
exactly one reason: to reach `Prisma.Decimal`. That single import drags the
generated client into any bundle touching the engine, which already breaks
browser builds (`node:module`) and would break Metro identically.

`lib/format.ts` imports from the generated client too, but **type-only**, so it
is erased at compile time and is genuinely portable.

That is the whole blast radius. Everything else is additive.

---

## 3. Stack

### API — NestJS + REST + OpenAPI

| Concern | Choice |
|---|---|
| Framework | **NestJS** (Fastify adapter) |
| ORM | Prisma 7 — unchanged, same schema, same migrations |
| Validation | **`nestjs-zod`** over the existing `lib/validation/` schemas |
| Auth | JWT access (15 min) + rotating refresh (30 d), `bcryptjs` hashes reused |
| Docs | `@nestjs/swagger` → OpenAPI at `/docs` |
| Hardening | `helmet`, CORS allowlist, `@nestjs/throttler` |
| Tests | `supertest` e2e against a seeded database |

**Why Nest.** It is the Node backend framework job ads name most often after
Express, and unlike Express it *forces* structure — modules, DI, guards,
interceptors, pipes. That structure is the signal. It also generates OpenAPI,
which is what lets the SPA and the RN app share one typed client instead of two
hand-written ones.

**Fastify standalone was the alternative** and would have saved roughly 3–4 days
of ceremony. Declined: with no deadline, the ceremony *is* the deliverable —
modules and guards are the part a reviewer reads to judge whether you can
structure a backend, and a single `server.ts` with 40 routes does not show it.

**Rejected: tRPC.** Excellent DX, wrong instrument here. It hides the API behind
a TypeScript function call, which is precisely the thing you are trying to
prove you can build — and a reviewer cannot open `/docs` and see an API. It is
also perceived as Next-adjacent, which does not help.

### SPA — Vite + React Router + TanStack Query

| Concern | Choice | Notes |
|---|---|---|
| Build | **Vite** | Pin at scaffold time |
| Router | **React Router 7** | The default non-Next answer; 16 routes to map |
| Server state | **TanStack Query 5** | The direct replacement for RSC + `revalidatePath` |
| Forms | react-hook-form + zod | Already used — ports with no changes |
| Styling | Tailwind v4 + shadcn/Base UI | Same config, same components |
| Tests | Vitest + Testing Library, Playwright | Existing specs adapt |

The insight worth planning around: **the SPA is much cheaper than it looks.**
Those 48 components are DOM React and Tailwind. They do not care that Next.js
rendered them. What actually changes is three things — `next/link` and
`next/navigation` become React Router, RSC data loading becomes `useQuery`, and
server actions become `useMutation` + `invalidateQueries`. The markup, the
styling and the Ukrainian copy survive intact.

### React Native — Expo

| Concern | Choice |
|---|---|
| Runtime | Expo (current SDK), EAS Build |
| Router | Expo Router — file-based, same mental model as App Router |
| Styling | NativeWind 4 — Tailwind class names, native primitives |
| Server state | **TanStack Query — the same hooks the SPA uses** |
| Camera | `expo-camera` (replaces `BarcodeDetector` + `@zxing/browser`) |
| Tokens | `expo-secure-store` |
| Push | `expo-notifications` — in scope (Phase 3.7); today Telegram fills this gap |

### Shared packages

- **`packages/core`** — the pure engine, `lib/messages.ts`, `lib/format.ts`,
  and `lib/validation/`. Imported by all four clients *and* the API.
- **`packages/api-client`** — `openapi-typescript` types generated from the
  Nest OpenAPI doc, `openapi-fetch` for calls, plus TanStack Query hooks.
  **Written once, consumed by the SPA and the RN app.**

The zod schemas in `lib/validation/` become the API's request validation, the
SPA's form resolver *and* the RN form resolver — one schema, three consumers,
no drift possible. That is worth a paragraph in the README on its own.

---

## 4. Target layout

```
supplies/
├── apps/
│   ├── web/          Next.js 16 — today's app, moved in Phase 4
│   ├── api/          NestJS — the new backend
│   ├── spa/          Vite + React — the new web client
│   └── mobile/       Expo + React Native
├── packages/
│   ├── core/         pure engine, messages, formatting, zod schemas + 339 tests
│   └── api-client/   generated types + fetch client + TanStack Query hooks
├── prisma/           one schema, 14 migrations, one seed — unchanged
└── bot/              Telegram bot — unchanged, still on the engine directly
```

**One database.** All four clients point at the same Postgres on port 5434 with
the same seed. That is not just convenient — being able to take a bottle of
water on the phone, watch it drop in the SPA, and see the same number come back
from the Telegram bot is the single most persuasive thing you can put in front
of an interviewer, and it costs nothing extra to arrange.

The bot keeps importing `lib/stock-service.ts` directly. It is a server-side
Node process with database access; routing it through HTTP would add a network
hop and a failure mode to buy nothing. Worth one line in the README explaining
that, because it is a deliberate call and reads as one.

### 4.1 Hosting — what actually changes on Vercel

**In Phase 0, nothing.** The Next app does not have to move for the workspace to
exist. The root `package.json` stays the Next.js app; `pnpm-workspace.yaml`
gains a `packages:` key (today it holds only `allowBuilds`); the root depends on
`@supplies/core` with `workspace:*`. Root Directory stays `.`, install and build
commands stay as they are, the domain and the bot webhook are untouched.

The only code change is `transpilePackages: ["@supplies/core"]` in
`next.config.ts`, because the shared package ships TypeScript source rather than
a built `dist` — the standard internal-package arrangement, and the reason Vite
and Metro can consume the same files.

| Deployment | Host | Root Directory | Cost |
|---|---|---|---|
| Next.js app | Vercel — **same project, same domain** | `.`, becoming `apps/web` in Phase 4.1 | unchanged |
| API | Railway / Fly / Render | `apps/api` | new service, ~$5/mo |
| SPA | Vercel — **second project, same repo** | `apps/spa` | free tier |

Two Vercel projects from one repository is an ordinary supported setup: create a
second project against the same Git repo, give it a different Root Directory,
and enable including files outside it so Vercel installs from the workspace root
and resolves `packages/core` through the pnpm link. Phase 4.1 then changes
exactly one setting on the existing project — Root Directory `.` → `apps/web` —
and is verified against a preview deploy before it touches production.

**Why the API should not live on Vercel.** It can; Nest runs behind a serverless
handler. But Nest is built for a long-lived process and three things get worse
without one: cold starts on every call the phone makes, `@nestjs/throttler`'s
in-memory rate limiting stops meaning anything once each request may be a fresh
lambda, and Prisma needs the pooled Neon endpoint plus connection-limit care.
Railway or Fly gives a normal Node process, a subdirectory setting for
monorepos, and a health check, for a few dollars a month.

**Stop rebuilding everything on every push.** Give each Vercel project an
Ignored Build Step so an SPA-only commit does not rebuild the Next app:

```bash
git diff --quiet HEAD^ HEAD -- apps/web packages prisma
```

Exit 0 means nothing that project cares about changed, and Vercel skips the
build.

**Three origins means CORS is real work, not a checkbox.** The SPA and the API
will be on different domains, so the API needs an explicit allowlist, and the
refresh-token cookie needs either a shared parent domain (`api.supplies.app` +
`app.supplies.app`, cookie `Domain=.supplies.app`, `SameSite=Lax`) or
`SameSite=None; Secure` cross-site.

### 4.2 Domains are unknown — so nothing hard-codes one

Decided 2026-09-04: **every origin is an environment variable with a working
localhost default.** No domain appears in source, and the first deploy is a
matter of filling values in, not editing code.

| Variable | Local default | Read by |
|---|---|---|
| `API_PORT` | `3200` | API |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | API — comma-separated allowlist |
| `COOKIE_DOMAIN` | *empty* → host-only cookie | API |
| `COOKIE_SAMESITE` | `lax` | API |
| `COOKIE_SECURE` | `false` | API |
| `VITE_API_URL` | `http://localhost:3200` | SPA build |
| `EXPO_PUBLIC_API_URL` | `http://<LAN-ip>:3200` | RN build |
| `APP_URL` | `http://localhost:3000` | already exists — Next app |

Local port map, so nothing collides: **3000** Next dev · **3100** Playwright's
production build · **3200** API · **5173** Vite.

Two rules that make this hold up rather than merely look tidy:

1. **The config module fails loudly on a bad value, at boot.** Nest reads and
   validates these once through a zod schema at startup, so a missing or
   malformed origin is a refusal to start with a named variable — not a CORS
   error at 2am that reads like a browser bug.
2. **Cross-site cookie settings are a matched set.** `SameSite=None` without
   `Secure` is silently dropped by every current browser. The three cookie
   variables are validated together, and the schema rejects the combination
   rather than letting it fail at runtime in one browser and not another.

Phone testing needs a LAN IP rather than `localhost`, which is why
`EXPO_PUBLIC_API_URL` is separate — the same reason `TELEGRAM_WEBHOOK_URL` is
already separate from `APP_URL` today.

---

## 5. Phases

Marked **⚠ prod** where a step can affect the running deployment. There are
exactly two, and both are last.

### Phase 0 — make the engine shareable · 3–4 days

| # | Task | Est. |
|---|---|---|
| 0.1 | Add `packages:` to `pnpm-workspace.yaml` (today it is only a build allowlist) | 1 h |
| 0.2 | **F4:** decouple `stock.ts`, `item-group.ts`, `shopping.ts` from `Prisma.Decimal` → `decimal.js`; convert at the DB edge in `queries.ts` / `stock-service.ts` | 1 d |
| 0.3 | Create `packages/core`; move the pure modules **and their tests**; leave `lib/*.ts` re-export shims so the app compiles unchanged | 1 d |
| 0.4 | Repoint the Next app at `@supplies/core`; delete the shims | 0.5 d |
| 0.5 | Wire vitest + ESLint + tsconfig project references for the workspace | 0.5 d |

**Gate:** `pnpm verify`, `pnpm test:db`, `pnpm test:e2e` and a Vercel preview
deploy all green before anything else starts. 0.2 touches the arithmetic of a
stock tracker; the 339 tests are the reason this is a day and not a fortnight.

### Phase 1 — the API · 2–3 weeks

| # | Task | Est. |
|---|---|---|
| 1.1 | Scaffold Nest, config module, Prisma module (`--schema` at repo root) | 1 d |
| 1.2 | Auth: `register` / `login` / `refresh` / `logout` / `me`; reuse bcrypt hashes so existing users work | 3 d |
| 1.3 | `JwtAuthGuard` + a household-scoping guard, so no handler can forget `householdId` | 1 d |
| 1.4 | Resource modules — see the endpoint sketch below | 6–8 d |
| 1.5 | `nestjs-zod` pipes over `packages/core/validation` | 1 d |
| 1.6 | Error envelope carrying **message keys + params**, never formatted prose — the existing `RuleMessage` rule, extended to HTTP | 1 d |
| 1.7 | OpenAPI at `/docs`, CORS allowlist, helmet, throttler | 1 d |
| 1.8 | `supertest` e2e mirroring what `scripts/smoke.ts` covers | 2–3 d |

Endpoint sketch — 46 actions and 17 readers collapse to roughly 40 routes:

| Resource | Routes |
|---|---|
| `/auth` | register, login, refresh, logout, me, change-password, forgot, reset, invite |
| `/items` | list (paged/filtered), get, create, update, archive, names, archived |
| `/items/:id/stock` | add, consume, consume-batch, discard, correct |
| `/dashboard` | one composed read |
| `/shopping` | list, add row, check, uncheck, update, delete, archive, bulk |
| `/shopping-groups` | CRUD + reorder + move row |
| `/settings` | household, categories, locations, item-groups (CRUD + reorder + defaults) |
| `/barcode/:code` | lookup (OFF → GEPIR → METRO chain, server-side) |
| `/recipes` | suggest (Claude; gated on `aiEnabled`) |
| `/telegram` | link token, send digest now |

### Phase 2 — the SPA · 2–3 weeks

| # | Task | Est. |
|---|---|---|
| 2.1 | Vite scaffold, Tailwind v4 config, copy the 22 UI primitives | 1 d |
| 2.2 | `packages/api-client`: generate types from OpenAPI, fetch wrapper, refresh-on-401 interceptor | 2 d |
| 2.3 | Auth context, protected routes, token storage | 1 d |
| 2.4 | Router: 16 routes + the authed shell | 1 d |
| 2.5 | TanStack Query hooks + invalidation map (the `revalidatePath` replacement) | 2 d |
| 2.6 | Port screens: login → items → item detail → add/take → shopping → dashboard → settings → groups → recipes | 6–9 d |
| 2.7 | Barcode scanner — lift the existing DOM code verbatim | 0.5 d |
| 2.8 | Playwright against the SPA; adapt the 4 existing specs | 1 d |

### Phase 3 — React Native, Android · 3–4 weeks

| # | Task | Est. |
|---|---|---|
| 3.1 | Expo + Expo Router + NativeWind scaffold; Metro workspace resolution | 1.5 d |
| 3.2 | `expo-secure-store` tokens, same `api-client`, refresh on 401 | 1 d |
| 3.3 | **Milestone A** — login, items list, item detail with take/add, scan | 4–5 d |
| 3.4 | `expo-camera` barcode scanning | 1 d |
| 3.5 | EAS Build → internal-distribution APK on your phone | 1 d |
| 3.6 | Remaining 12 screens: dashboard, shopping + groups, settings panels, item form, archive, recipes, join/reset | 2–2.5 w |
| 3.7 | Push notifications via `expo-notifications` | 2–3 d |
| 3.8 | Play Console listing ($25, once) | 1 d |

**Milestone A is a checkpoint, not a reduced scope.** Full parity is the
destination; 3.3–3.5 just happen to be the order that proves the whole stack —
workspace, API, auth, camera, real write — before twelve more screens are built
on top of it. If something is structurally wrong, it surfaces in week one of
this phase rather than week four. Ship an APK to your own phone at 3.5 and use
it for a few days before continuing.

**Do not paint yourself into Android**, since Phase 5 exists. Concretely, from
3.1 onward: `react-native-safe-area-context` on every screen even though Android
mostly does not need it, no Android-only libraries, `expo-camera` rather than
anything platform-specific, and keyboard handling written against
`KeyboardAvoidingView` rather than Android's default resize behaviour. All four
are free now and expensive to retrofit.

### Phase 4 — finish and present · 3–5 days

| # | Task | Est. |
|---|---|---|
| 4.1 | **⚠ prod** Move the Next app to `apps/web`; set Vercel Root Directory | 0.5 d |
| 4.2 | **⚠ prod** Verify the deploy: build, migrations, bot webhook, cron | 0.5 d |
| 4.3 | Deploy the API (Railway / Fly / Render) and the SPA (Vercel / Netlify) | 1 d |
| 4.4 | README rewrite: diagram, stack table, screenshots, "where to look" | 1 d |
| 4.5 | CI matrix — core, api, web, spa; Playwright on both web clients | 1 d |

Phase 4.1 is deliberately **the last thing that touches production**. Until
then the Next app stays at the repo root and Vercel's configuration never
changes, so every phase before it is additive and cannot break what your
household is using.

At the end of Phase 4 the portfolio is complete and showable: API, SPA, Android
app, Next.js app, Telegram bot, one engine. Phase 5 extends it.

### Phase 5 — iOS · 1–1.5 weeks

Sequenced after Phase 4 on purpose, so nothing you show people is ever blocked
on Apple's review queue.

| # | Task | Est. |
|---|---|---|
| 5.1 | Apple Developer account ($99/yr), EAS credentials, bundle id | 0.5 d |
| 5.2 | Platform pass: safe areas, keyboard, scroll behaviour, haptics | 2–3 d |
| 5.3 | `Info.plist` usage strings (camera), icons, splash | 0.5 d |
| 5.4 | APNs push, if 3.7 shipped | 1 d |
| 5.5 | TestFlight build, install, fix what only shows on a real device | 1–2 d |
| 5.6 | App Store submission: demo account, privacy policy, App Privacy answers | 1–2 d + review latency |

**You need a Mac or EAS cloud builds.** EAS removes the hardware requirement,
not the $99. Review latency is usually a day or two and is entirely outside your
control — which is the whole reason this phase sits where it does.

---

## 6. Scope and timeline

**Full parity.** Every endpoint, all 16 screens on the SPA, all 16 on React
Native, push notifications, both stores.

Estimates below are **working days of focused effort** — a "week" is five of
them. Translate to calendar at whatever rate you actually work; the two columns
on the right are the honest arithmetic, not a hedge.

| Phase | Effort | Full-time | ~15 h/week |
|---|---|---|---|
| 0 · shareable engine | 3–4 d | <1 wk | ~2 wk |
| 1 · API | 10–15 d | 2–3 wk | 5–7 wk |
| 2 · SPA | 10–15 d | 2–3 wk | 5–7 wk |
| 3 · Android | 15–20 d | 3–4 wk | 7–10 wk |
| 4 · finish + present | 3–5 d | ~1 wk | ~2 wk |
| **Showable total** | **41–59 d** | **8–12 wk** | **5–7 months** |
| 5 · iOS | 5–8 d | 1–1.5 wk | 2–4 wk |

Two things follow from choosing parity with no deadline, and both are worth
building in from the start rather than discovering later:

**Order matters more than scope now.** Milestone A in Phase 3 exists precisely
because the total is long: it puts a working end-to-end vertical — workspace,
API, auth, camera, real write — on your phone inside the first week of that
phase, so a structural mistake surfaces at day 5 rather than day 25.

**Something has to be presentable at every point after Phase 2.** Five months is
long enough that a job opportunity will appear mid-way through. Keep the README
current as each phase lands, so the repo is never in a state where the honest
description is "half-migrated". That is a habit, not a task — but it is the one
that pays if a recruiter appears in week nine.

---

## 7. Testing and CI

The existing test story is unusually strong for a personal project and is worth
protecting — it is itself a hiring signal.

| Layer | Tool | Where it lands |
|---|---|---|
| Rules | vitest, 339 tests | `packages/core` — **moved, not rewritten** |
| API contract | supertest + seeded Postgres | `apps/api` — absorbs `scripts/smoke.ts` |
| SPA units | Vitest + Testing Library | `apps/spa` |
| SPA e2e | Playwright, desktop + Pixel 7 | `apps/spa` — the 4 specs adapt |
| Next e2e | Playwright, unchanged | `apps/web` |
| RN | Maestro flows over the critical paths | `apps/mobile` — cheaper to write and maintain than Detox |

CI becomes a matrix: `core` (fast, always), then `api` / `web` / `spa` in
parallel behind a Postgres service. The pre-commit hook stays as it is —
lint + typecheck + unit — because 20 seconds is the budget that keeps it from
being bypassed.

---

## 8. What a reviewer will be able to verify

The point of the whole exercise, mapped to evidence:

| Claim | Where it is provable |
|---|---|
| React without a meta-framework | `apps/spa` — Vite, React Router, TanStack Query |
| Backend API design | `apps/api` — Nest modules, guards, DTOs, OpenAPI at `/docs` |
| Auth beyond a library default | Access + rotating refresh, cookie for web, secure-store for native |
| React Native | `apps/mobile` — real APK, camera, same API |
| Monorepo | pnpm workspace, four apps, two shared packages |
| Domain modelling | `packages/core` — FEFO, expiry states, Decimal arithmetic, 339 tests |
| Testing judgement | Four layers with a written rationale for the size of each |
| Not just greenfield | An existing production app refactored without downtime |

That last row is the one most portfolios cannot claim, and it comes free with
the one-repo decision.

---

## 9. Risks and frictions

1. **Prisma must never enter the SPA or Metro bundle.** Already true for the
   browser; Phase 0.2 is what makes it enforceable across three build systems.
   Add a lint rule banning `@/lib/generated/*` outside `apps/api`, `apps/web`
   and `bot/` — a convention that is not enforced is a convention that breaks.
2. **Metro and workspaces.** `nodeModulesPaths` and symlink resolution need
   configuring or Metro will not resolve `packages/core`. Budget half a day and
   do not be surprised by it.
3. **The `@/` alias.** Everything imports `@/lib/...` today. Shared code becomes
   `@supplies/core`; this is mechanical but touches many files, which is why
   Phase 0.3 keeps re-export shims so it lands as its own reviewable commit.
4. **Auth divergence.** Two auth systems will coexist — Auth.js cookies for
   `apps/web`, JWT bearer for everything else. Acceptable and normal, but say
   so in the README before someone calls it an inconsistency. Unifying `web`
   onto the API is possible later and is not worth doing now.
5. **`revalidatePath` has no equivalent.** Every mutation needs an explicit
   invalidation decision. Write the query-key map (2.5) *before* porting
   screens, not during.
6. **Scope creep into features.** The temptation to "improve it while I'm in
   there" is what turns 7 weeks into 20. The API is a translation of 46
   existing actions. Behaviour changes go on a separate list.
7. **`feature/offline-sync` is parked, and parking it has a cost.** It stays on
   its branch, out of scope, not merged. Be clear-eyed that Phase 0 moves the
   engine into `packages/core` and rewrites every `@/lib/*` import the branch
   touches — after that, rebasing it is not a merge conflict, it is a rewrite.
   Treat the branch as a **design record** rather than resumable code: the
   IndexedDB outbox, the idempotency keys and the `navigator.onLine` fast-path
   are the parts worth re-reading if offline is ever rebuilt on the API, which
   is where it belongs anyway — one queue serving two mobile clients instead of
   a browser-only one.

---

## 10. Decisions taken — 2026-09-04

| # | Decision | Consequence in this plan |
|---|---|---|
| 1 | **Full parity** | All 16 screens on RN too; Phase 3 is 3–4 weeks, not one |
| 2 | **NestJS** | Modules/DI/guards; OpenAPI at `/docs`; Fastify declined |
| 3 | **One workspace** | §1; Vercel untouched until Phase 4.1 |
| 4 | **Offline parked** | Out of scope; §9.7 on why the branch will not rebase |
| 5 | **iOS later** | Its own Phase 5, after Phase 4 ships; §3 stays cross-platform |
| 6 | **No deadline** | Buys the Nest ceremony and full parity; §6 on what it costs |
| 7 | **Domains unknown → env-driven** | §4.2; localhost defaults, no origin in source |

### Still open, but not blocking

- **API host** — Railway, Fly or Render. Any of the three; pick when Phase 1
  first needs to deploy, not before.
- **Package build strategy** — ship `packages/core` as TypeScript source
  (simpler, one source of truth, needs `transpilePackages` + Metro config) or
  build to `dist` (works everywhere with no bundler config, adds a build step).
  Source is the default; revisit only if Metro fights back in Phase 3.1.

---

## 11. Progress log

### Phase 0 — done, 2026-09-04

| # | Task | Commit |
|---|---|---|
| 0.1 | `packages:` key in `pnpm-workspace.yaml`; Next app stays the root package | `5396ea1` |
| 0.2 | Engine decoupled from `Prisma.Decimal` → decimal.js; units moved out of the generated enums | `abadd29` |
| 0.3 | 28 modules + their tests moved to `packages/core`, subpath exports, no barrel | `5396ea1` |
| 0.4 | Every app import repointed to `@supplies/core/*` — done directly, no shim commit | `5396ea1` |
| 0.5 | vitest over three roots, ESLint boundary rule, `transpilePackages` | — |

**Gate met:** 351 unit tests (339 + 12 new), lint, typecheck, production build,
and all 52 live-database smoke checks. Not yet run: `pnpm test:e2e` and a Vercel
preview deploy — both belong to the `chore/post-review` PR this branch is
stacked on.

Three things worth knowing before Phase 1:

**The boundary is enforced, not documented.** `eslint.config.mjs` bans Prisma,
React, Next, `server-only`, the `@/` alias and Node builtins inside
`packages/core`, with `node:crypto` the single exception for
`telegram-link.ts`. Verified against a file that deliberately imports all of
them, rather than assumed from a passing lint run. Core's *tests* keep every
ban but the Node one — they run in Node, and `gepir.test.ts` reads fixtures off
disk.

**No barrel, and it must stay that way.** `exports` is `"./*": "./src/*.ts"`.
An `index.ts` would put `node:crypto` in the module graph of any mobile screen
that imported anything at all.

**The engine's tests no longer need a database, an `.env`, or a generated
client.** That is the property Phase 1 will lean on when the API imports the
same rules, and Phase 3 when Metro does.

### Phase 1.1 — done, 2026-09-04

`apps/api` boots, connects, and serves. Verified by running it, not by building
it: `/health`, `/health/ready` (real `SELECT 1`), `/api/meta`, and Swagger UI at
`/docs` all answered on port 3200.

| Piece | State |
|---|---|
| NestJS 11 on Fastify, helmet, cookie, throttler | done |
| `PrismaService` — eager connect, real shutdown hook | done |
| Env config: zod-validated at boot, 11 tests | done |
| `GET /api/meta` — units and movement reasons from `@supplies/core` | done |
| OpenAPI at `/docs` | done |
| Auth, resource modules, zod pipe | Phase 1.2+ |

**§4.2 is implemented.** No domain appears anywhere in `apps/api`. The config
refuses to boot on `SameSite=None` without `Secure`, refuses an origin that is
not a URL, refuses plain `http://` origins in production, and names every bad
variable in one message rather than one per restart. `API_JWT_SECRET` is the
only value with no default — a fallback secret is a fallback that reaches
production.

**`GET /api/meta` is the wiring proof, not a placeholder.** It serves the unit
list from the same module the zod schemas validate against, which is the same
one `lib/units.test.ts` pins to the Prisma enum. The SPA and the phone will both
need that list for their «Одиниця» dropdowns, and a hardcoded copy in either is
a copy that still says six units the day the schema has seven.

**Toolchain, in one line each** — the detail is in
[apps/api/CLAUDE.md](apps/api/CLAUDE.md):

- The API is **CommonJS**, and Prisma's generator is told `moduleFormat = "cjs"`
  for it. Its default ESM output carries `import.meta`, which survives a
  CommonJS build and makes Node reject the file.
- **ESM is a dead end here.** Node ESM needs file extensions, tsc never adds
  them on emit, and Turbopack will not resolve `./decimal.js` to `decimal.ts` —
  so one of the two consumers of `packages/core` breaks whichever way its source
  is written. Tried, reverted, documented.
- A tsconfig `paths` alias does not survive emit, so the API has its **own
  generated client** and one file (`src/core.ts`) that reaches into
  `packages/core/src` relatively.
- **No `ValidationPipe`.** Nest's default needs class-validator; this API
  validates with the zod schemas in `@supplies/core/validation`. Two validation
  libraries would be two definitions of a valid item.

### Phase 2.1 — done, 2026-09-04

`apps/spa` — Vite, React 19, React Router 7, TanStack Query, Tailwind v4. One
route so far, and **nothing on it is mocked**: it fetches the API's liveness,
readiness and unit list, and formats a quantity through `@supplies/core/format`
to show the engine running in a browser bundle with no Prisma in it.

**All three run together:**

```bash
pnpm dev:all     # Next :3000 · API :3200 · SPA :5173
```

Verified in a browser, not just with curl: the SPA's cross-origin requests to
:3200 return 200 with `credentials: "include"`, the console is clean, and the
Next app still serves `/login` alongside them.

`credentials: "include"` is set before there is a cookie to send. Credentialed
CORS is the configuration that fails loudest and most confusingly when wrong, so
it gets exercised now rather than on the day the refresh token needs it.

One fix on the way: `nest start --watch` looks for `dist/main`, but including
`packages/core` in the API's tsconfig makes tsc infer the repo root as
`rootDir`, so the entry is `dist/apps/api/src/main`. `entryFile` in
`nest-cli.json` now says so.

### Phase 1 — the API · substantially done, 2026-09-05

Documented as **Feature 34** in PROJECT_PROMPT.md before any of it was written.

| # | Task | State |
|---|---|---|
| 1.1 | Nest on Fastify, config, Prisma, health, OpenAPI | done |
| 1.2 | Auth: register/login/refresh/logout/me, rotation + reuse detection | done |
| 1.3 | Global guard, `@CurrentUser` household scoping | done |
| 1.4 | Items, dashboard, shopping, taxonomy, groups, movements, 5 stock writes | done |
| 1.5 | zod pipe over `@supplies/core/validation` | done |
| 1.6 | Error envelope carrying message keys + params | done |
| 1.7 | CORS allowlist, helmet, throttler | done |
| 1.8 | 11 e2e checks against a live database | done |
| — | Settings CRUD, shopping writes, barcode, recipes, telegram | **remaining** |

**`packages/db` arrived here, and it had to.** Feature 34 makes the API a third
front end, and one that wrote its own queries would be a third implementation.
So `prisma.ts`, `queries.ts` and `stock-service.ts` moved into a package every
consumer shares — which needed one generated client instead of two
(`moduleFormat = "cjs"`), and needed Feature 4's discard and correct to move out
of `lib/actions/stock.ts` into the write path where the bot and the API can
reach them.

**Three toolchain findings, each verified rather than assumed:**

- Prisma 7's ESM output carries `import.meta`, which survives a CommonJS build
  and leaves a file Node rejects.
- **ESM for the API is a dead end.** Node ESM needs file extensions, tsc never
  adds them on emit, and Turbopack will not resolve `./decimal.js` to
  `decimal.ts` — so `packages/core` breaks one of its two consumers whichever
  way its source is written. Tried, reverted, documented.
- **tsc does not rewrite module specifiers**, so anything `nest build` compiles
  must import across packages relatively. This bit three times before it was
  written down.

### Phase 2 — the SPA · in progress, 2026-09-05

| # | Task | State |
|---|---|---|
| 2.1 | Vite, React Router, TanStack Query, Tailwind scaffold | done |
| 2.3 | Auth context, in-memory access token, refresh-cookie recovery | done |
| 2.5 | Query-key map, written before the screens | done |
| 2.6 | Login, dashboard, item list, item detail with take/restock | done |
| 2.6 | The other 12 screens | **remaining** |
| 2.2 | Generate the client from OpenAPI (hand-written types for now) | **remaining** |
| 2.7 | Barcode scanner | **remaining** |
| 2.8 | Playwright against the SPA | **remaining** |

Verified in a browser rather than only by build: sign in, the dashboard shows
the seeded household's expired/expiring/low items, open an item, press «Взяли»
— 120 becomes 119 — press «Поповнити» and it is 120 again.

Two bugs that only running it could find:

- A reload landed on the login page with a valid session in the cookie jar.
  `api.post` with no body still sent `Content-Type: application/json`, and
  Fastify answers an empty JSON body with 400 *before the handler runs* — so
  `/auth/refresh`, which needs no body, was answered by the body parser.
- The item detail type was invented rather than read. `getItemDetail` returns
  the row alongside the states computed from it, and sends no per-batch expiry
  state — correctly, since shipping one would put a second copy of Feature 13's
  category inheritance on the wire.

### Phases 3–5 — not started

React Native, the deploy, iOS.

### Start here

**Phase 0.2 — the `decimal.js` decoupling — is the first commit**, and it is
worth doing even if everything after it is abandoned: it removes the generated
Prisma client from the engine's bundle graph, which is a live constraint on the
current web build. That is F4 from ARCHITECTURE_REVIEW.md, closed at last, on
its own merits.
